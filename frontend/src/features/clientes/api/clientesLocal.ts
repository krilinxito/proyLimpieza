/**
 * Los clientes en la base local: el único archivo de la feature que escribe SQL.
 *
 * Lee y escribe en el SQLite del dispositivo, nunca en la API (CLAUDE.md §6). La tabla
 * `clientes` baja entera por el bucket `global`, así que buscar aquí es buscar en todo el
 * sistema, con o sin internet. Lo que se escribe queda en la cola de subida y llega al
 * servidor como `POST /api/clientes` cuando exista `cola-subida`.
 *
 * Recibe la base como argumento en vez de sacarla de un contexto de React: así se prueba
 * con `baseLocalDePrueba()` sin montar ninguna pantalla. Quien la saca del contexto es el
 * hook (`hooks/useClientes.ts`).
 */
import type { BaseLocal, Fila, Sentencia } from '../../../lib/powersync';
import { alcanzaParaBuscar, type ResultadosDeBusqueda } from '../../../lib/texto';
import { normalizarTelefono } from '../telefono';
import type {
  Cliente,
  DatosAlta,
  DatosEdicion,
  ErroresAlta,
  ResultadoAlta,
  ResultadoEdicion,
} from '../types';
import { condicionCliente } from './busqueda';

/** Cuántos resultados muestra el buscador: más no se leen de pie en un mostrador (SPEC-KRILINXI-032). */
export const MAXIMO_RESULTADOS = 6;

// Los mismos textos que responde el backend (SPEC-ALE186-003): el empleado lee lo mismo
// lo detecte el dispositivo o el servidor. Exportados para la corrección de lo rechazado
// (SPEC-KRILINXI-013), que valida lo mismo.
export const FALTA_NOMBRE = 'Escribí el nombre del cliente.';
export const FALTA_TELEFONO = 'Escribí el número de teléfono del cliente.';

/**
 * Estrecha una fila de SQLite a `Cliente`. SQLite no garantiza tipos, así que se comprueba
 * en vez de afirmarlo con `as`. Una fila rota (sin nombre, p. ej.) no se muestra.
 */
function aCliente(fila: Fila): Cliente | null {
  const { id, nombre, telefono, carnet } = fila;
  if (typeof id !== 'string' || typeof nombre !== 'string' || typeof telefono !== 'string') return null;
  return { id, nombre, telefono, carnet: typeof carnet === 'string' && carnet !== '' ? carnet : null };
}

/**
 * El cliente con ese teléfono, o null. Acepta el teléfono como lo escriba el empleado.
 *
 * `excluirId` deja afuera a un cliente, y tiene que ir **dentro** de la consulta
 * (SPEC-KRILINXI-021): la tablet puede tener dos filas con el mismo teléfono por un rato (un alta
 * rechazada que todavía no se revirtió y el cliente de otra tablet que ya bajó). Filtrar después
 * del `LIMIT 1` podía devolver justo al excluido y decir que el teléfono estaba libre.
 */
export async function buscarPorTelefono(base: BaseLocal, telefono: string, excluirId: string | null = null): Promise<Cliente | null> {
  const normalizado = normalizarTelefono(telefono);
  if (normalizado === '') return null;

  const filas = await base.consultar('SELECT id, nombre, telefono, carnet FROM clientes WHERE telefono = ? AND id IS NOT ? LIMIT 1', [
    normalizado,
    excluirId,
  ]);
  const [fila] = filas;
  return fila ? aCliente(fila) : null;
}

/**
 * Los clientes que coinciden con lo escrito, mientras se escribe — SPEC-KRILINXI-032. Por
 * nombre (sin tildes ni mayúsculas), parte del teléfono o carnet: ver `api/busqueda.ts`.
 *
 * Pide uno más de los que muestra: si llega, hay más resultados y la pantalla lo dice ("escribí
 * un poco más"), sin contar todos. Con menos de 2 letras o 3 dígitos no busca.
 */
export async function buscarClientes(base: BaseLocal, texto: string): Promise<ResultadosDeBusqueda<Cliente>> {
  const condicion = alcanzaParaBuscar(texto)
    ? condicionCliente(texto, { nombre: 'nombre', telefono: 'telefono', carnet: 'carnet' })
    : null;
  if (!condicion) return { resultados: [], hayMas: false };

  const filas = await base.consultar(
    `SELECT id, nombre, telefono, carnet FROM clientes
      WHERE ${condicion.donde}
      ORDER BY ${condicion.orden}, nombre
      LIMIT ?`,
    [...condicion.parametros, ...condicion.parametrosOrden, MAXIMO_RESULTADOS + 1],
  );
  const clientes = filas.map(aCliente).filter((c): c is Cliente => c !== null);
  return { resultados: clientes.slice(0, MAXIMO_RESULTADOS), hayMas: clientes.length > MAXIMO_RESULTADOS };
}

/** Un cliente por su id, o null — SPEC-KRILINXI-033: la ficha del Mostrador se abre también desde una boleta. */
export async function obtenerCliente(base: BaseLocal, id: string): Promise<Cliente | null> {
  const [fila] = await base.consultar('SELECT id, nombre, telefono, carnet FROM clientes WHERE id = ?', [id]);
  return fila ? aCliente(fila) : null;
}

/** El mensaje cuando el teléfono ya es de otro cliente: dice de quién es y qué hacer. */
export const telefonoDeOtro = (nombre: string) => `Ese teléfono ya es de ${nombre}. Revisalo y volvé a escribirlo.`;

export type ClienteValidado = {
  errores: ErroresAlta;
  /** Los valores ya limpios: el nombre sin espacios de más, el teléfono solo con dígitos. */
  nombre: string;
  telefono: string;
  /** El cliente que ya tiene ese teléfono, si es otro. */
  ocupadoPor: Cliente | null;
};

/**
 * Las validaciones del cliente, en un solo lugar: las usan el alta, la edición
 * (SPEC-KRILINXI-014) y la corrección de lo rechazado (SPEC-KRILINXI-013). `excluirId` es el
 * cliente que se está editando: su propio teléfono no cuenta como ocupado.
 *
 * El teléfono ocupado no va en `errores`: el alta lo trata como "ya existe, es este", y la
 * edición como un error del campo. Lo decide quien llama.
 */
export async function validarCliente(
  base: BaseLocal,
  datos: { nombre: string; telefono: string },
  excluirId: string | null = null,
): Promise<ClienteValidado> {
  const nombre = datos.nombre.trim();
  const telefono = normalizarTelefono(datos.telefono);

  const errores: ErroresAlta = {};
  if (nombre === '') errores.nombre = FALTA_NOMBRE;
  if (telefono === '') errores.telefono = FALTA_TELEFONO;

  // El teléfono es único en todo el sistema (CLAUDE.md §3). El servidor lo vuelve a
  // comprobar, pero aquí el empleado se entera al momento y ve a quién pertenece.
  const ocupadoPor = telefono === '' ? null : await buscarPorTelefono(base, telefono, excluirId);
  return { errores, nombre, telefono, ocupadoPor };
}

/**
 * Da de alta un cliente en la base local.
 *
 * El id lo genera el dispositivo (CLAUDE.md §6): el cliente existe desde este momento, sin
 * esperar al servidor, y la orden que se cree enseguida ya puede apuntarle.
 *
 * Solo se escriben los tres datos que escribió el empleado. `fecha_registro` y
 * `sucursal_registro_id` los pone el servidor al recibir el alta —la sucursal sale de la
 * sesión, nunca del dispositivo— y bajan con la siguiente sincronización.
 */
export async function registrarCliente(base: BaseLocal, datos: DatosAlta): Promise<ResultadoAlta> {
  const { errores, nombre, telefono, ocupadoPor } = await validarCliente(base, datos);
  if (errores.nombre || errores.telefono) return { tipo: 'invalido', errores };
  if (ocupadoPor) return { tipo: 'telefono-ocupado', cliente: ocupadoPor };

  const cliente = clienteNuevo({ nombre, telefono, carnet: datos.carnet });
  const { sql, parametros } = sentenciaAltaCliente(cliente);
  await base.ejecutar(sql, parametros);
  return { tipo: 'registrado', cliente };
}

/** Un cliente nuevo, con su id del dispositivo (CLAUDE.md §6) y los datos ya validados. */
export function clienteNuevo({ nombre, telefono, carnet }: { nombre: string; telefono: string; carnet: string }): Cliente {
  const limpio = carnet.trim();
  return { id: crypto.randomUUID(), nombre, telefono, carnet: limpio === '' ? null : limpio };
}

/**
 * La escritura del alta, sin hacerla — SPEC-KRILINXI-034: para guardar al cliente en la misma
 * transacción que su primera ropa (`ejecutarJuntas`). Primero va el alta: así la cola la sube antes
 * que la orden que le apunta.
 */
export function sentenciaAltaCliente(cliente: Cliente): Sentencia {
  return {
    sql: 'INSERT INTO clientes (id, nombre, telefono, carnet) VALUES (?, ?, ?, ?)',
    parametros: [cliente.id, cliente.nombre, cliente.telefono, cliente.carnet],
  };
}

/**
 * Cambia el nombre o el teléfono de un cliente en la base local — SPEC-KRILINXI-014.
 *
 * Escribe solo las columnas que cambiaron: PowerSync encola el `UPDATE` como un PATCH con
 * esas columnas, y el servidor recibe solo lo que cambió (`PATCH /api/clientes/:id`). Si no
 * cambió nada no escribe: un `UPDATE` que deja todo igual igual encolaría un PATCH vacío
 * (SPEC-KRILINXI-013).
 */
export async function editarCliente(base: BaseLocal, cliente: Cliente, datos: DatosEdicion): Promise<ResultadoEdicion> {
  const { errores, nombre, telefono, ocupadoPor } = await validarCliente(base, datos, cliente.id);
  if (!errores.telefono && ocupadoPor) errores.telefono = telefonoDeOtro(ocupadoPor.nombre);
  if (errores.nombre || errores.telefono) return { tipo: 'invalido', errores };

  const cambios: [columna: 'nombre' | 'telefono', valor: string][] = [];
  if (nombre !== cliente.nombre) cambios.push(['nombre', nombre]);
  if (telefono !== cliente.telefono) cambios.push(['telefono', telefono]);
  if (cambios.length === 0) return { tipo: 'sin-cambios' };

  // Las columnas salen de la lista de arriba, nunca de lo que escribió el empleado.
  await base.ejecutar(`UPDATE clientes SET ${cambios.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`, [
    ...cambios.map(([, valor]) => valor),
    cliente.id,
  ]);
  return { tipo: 'editado', cliente: { ...cliente, nombre, telefono } };
}
