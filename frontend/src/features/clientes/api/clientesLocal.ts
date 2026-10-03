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
import type { BaseLocal, Fila } from '../../../lib/powersync';
import { normalizarTelefono } from '../telefono';
import type { Cliente, DatosAlta, ErroresAlta, ResultadoAlta } from '../types';

// Los mismos textos que responde el backend (SPEC-ALE186-003): el empleado lee lo mismo
// lo detecte el dispositivo o el servidor.
const FALTA_NOMBRE = 'Escribí el nombre del cliente.';
const FALTA_TELEFONO = 'Escribí el número de teléfono del cliente.';

/**
 * Estrecha una fila de SQLite a `Cliente`. SQLite no garantiza tipos, así que se comprueba
 * en vez de afirmarlo con `as`. Una fila rota (sin nombre, p. ej.) no se muestra.
 */
function aCliente(fila: Fila): Cliente | null {
  const { id, nombre, telefono, carnet } = fila;
  if (typeof id !== 'string' || typeof nombre !== 'string' || typeof telefono !== 'string') return null;
  return { id, nombre, telefono, carnet: typeof carnet === 'string' && carnet !== '' ? carnet : null };
}

/** El cliente con ese teléfono, o null. Acepta el teléfono como lo escriba el empleado. */
export async function buscarPorTelefono(base: BaseLocal, telefono: string): Promise<Cliente | null> {
  const normalizado = normalizarTelefono(telefono);
  if (normalizado === '') return null;

  const filas = await base.consultar('SELECT id, nombre, telefono, carnet FROM clientes WHERE telefono = ? LIMIT 1', [
    normalizado,
  ]);
  const [fila] = filas;
  return fila ? aCliente(fila) : null;
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
  const nombre = datos.nombre.trim();
  const telefono = normalizarTelefono(datos.telefono);
  const carnet = datos.carnet.trim();

  const errores: ErroresAlta = {};
  if (nombre === '') errores.nombre = FALTA_NOMBRE;
  if (telefono === '') errores.telefono = FALTA_TELEFONO;
  if (errores.nombre || errores.telefono) return { tipo: 'invalido', errores };

  // El teléfono es único en todo el sistema (CLAUDE.md §3). El servidor lo vuelve a
  // comprobar, pero aquí el empleado se entera al momento y ve a quién pertenece.
  const existente = await buscarPorTelefono(base, telefono);
  if (existente) return { tipo: 'telefono-ocupado', cliente: existente };

  const cliente: Cliente = { id: crypto.randomUUID(), nombre, telefono, carnet: carnet === '' ? null : carnet };
  await base.ejecutar('INSERT INTO clientes (id, nombre, telefono, carnet) VALUES (?, ?, ?, ?)', [
    cliente.id,
    cliente.nombre,
    cliente.telefono,
    cliente.carnet,
  ]);
  return { tipo: 'registrado', cliente };
}
