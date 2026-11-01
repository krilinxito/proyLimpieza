/**
 * Corregir una boleta del historial — SPEC-KRILINXI-071. La parte pura: de la boleta al formulario, del formulario a lo
 * que se manda, y qué está mal. Sin pantalla ni API, así se prueba sola (`correccion.test.ts`).
 *
 * Lo que se manda es SOLO lo que cambió, como en Personal y Sucursales (SPEC-KRILINXI-017): un campo que se deja como
 * estaba no viaja, y si no cambió nada no se manda nada. La excepción son las prendas: si cambia una, van todas, porque
 * el servidor deja la boleta con exactamente esa lista y el total tiene que ser su suma.
 *
 * Las reglas son las de Registrar ropa (`lib/formatos`, `ordenes/renglones.ts`). Acá son cortesía: la garantía es del
 * servidor, que vuelve a validar todo (CLAUDE.md §6).
 */
import { esNumeroDeBoleta } from '../../lib/formatos';
import { aDecimal, formatearCantidad, parsearMonto, type Centavos } from '../../lib/money';
import { describirRenglones, totalDe, validarRenglon, type CampoRenglon, type RenglonEscrito, type RenglonValido } from '../ordenes/renglones';
import type { BoletaListada, OrigenDeLaBoleta } from './types';

const LARGO_MAXIMO_BOLETA = 30;

/** Bolivia está siempre en UTC−4: no tiene horario de verano. */
const ZONA_BOLIVIA = '-04:00';

export const MENSAJES_CORRECCION = {
  boleta: 'Escribe el número de la boleta: letras, números y guion, con al menos un número.',
  boletaLarga: 'Ese número de boleta es demasiado largo. Revisa el papel.',
  dia: 'Escribe el día en que entró la ropa.',
  hora: 'Escribe la hora en que entró la ropa, por ejemplo 09:30.',
  descripcion: 'Escribe qué ropa dejó el cliente.',
  precio: 'Escribe el precio con números, por ejemplo 25 o 25,50.',
  sinCambios: 'No cambiaste nada: la boleta quedó como estaba.',
} as const;

/** El formulario de la corrección, como lo escribe el admin. */
export type DatosCorreccion = {
  numeroBoleta: string;
  sucursalId: string;
  /** `YYYY-MM-DD`, en Bolivia. */
  dia: string;
  /** `HH:MM`, en Bolivia. */
  hora: string;
  /** `YYYY-MM-DD`, o vacío si no se dice. */
  fechaEstimada: string;
  /** Solo se escribe en una boleta sin prendas (de antes de SPEC-KRILINXI-068); con prendas, sale de ellas. */
  descripcion: string;
  /** Idem: con prendas, el total es su suma. */
  precio: string;
  /** Las prendas (renglones de INGRESO). La clave de cada una es su id en la base, o uno nuevo. */
  prendas: RenglonEscrito[];
};

export type CampoCorreccion = 'numeroBoleta' | 'dia' | 'hora' | 'descripcion' | 'precio';
export type ErroresCorreccion = Partial<Record<CampoCorreccion | `renglon:${string}:${CampoRenglon}`, string>>;

/** Un precio para volver a escribirlo: 2550 → "25,50". Sin puntos de miles, que `parsearMonto` no acepta. */
function paraEscribir(centavos: Centavos): string {
  return aDecimal(centavos).replace('.', ',');
}

/** El formulario arranca con la boleta como está. */
export function datosIniciales(boleta: BoletaListada, origen: OrigenDeLaBoleta): DatosCorreccion {
  return {
    numeroBoleta: boleta.numeroBoleta,
    sucursalId: origen.sucursalId,
    dia: origen.fechaEntrada.slice(0, 10),
    hora: origen.fechaEntrada.slice(11, 16),
    fechaEstimada: origen.fechaEstimadaSalida ?? '',
    descripcion: boleta.descripcion,
    precio: paraEscribir(boleta.precioTotal),
    prendas: boleta.renglones
      .filter((r) => r.momento === 'INGRESO')
      .map((r) => ({
        clave: r.id,
        descripcion: r.descripcion,
        cantidad: formatearCantidad(r.cantidad),
        precioUnitario: paraEscribir(r.precioUnitario),
      })),
  };
}

/** Lo que se manda a `PATCH /api/ordenes/:id`, con los nombres de las columnas. */
export type CuerpoCorreccion = {
  numero_boleta?: string;
  sucursal_id?: string;
  fecha_entrada?: string;
  fecha_estimada_salida?: string | null;
  descripcion?: string;
  precio_total?: string;
  renglones?: { id: string; descripcion: string; cantidad: string; precio_unitario: string }[];
};

export type RevisionCorreccion =
  | { tipo: 'invalida'; errores: ErroresCorreccion }
  | { tipo: 'sin-cambios' }
  | { tipo: 'lista'; cuerpo: CuerpoCorreccion };

function mismasPrendas(antes: readonly RenglonValido[], ahora: readonly RenglonValido[]): boolean {
  return (
    antes.length === ahora.length &&
    antes.every((a, i) => {
      const b = ahora[i];
      return (
        b !== undefined &&
        a.clave === b.clave &&
        a.descripcion === b.descripcion &&
        a.cantidad === b.cantidad &&
        a.precioUnitario === b.precioUnitario
      );
    })
  );
}

function validarPrendas(prendas: readonly RenglonEscrito[], errores: ErroresCorreccion): RenglonValido[] {
  const validas: RenglonValido[] = [];
  for (const prenda of prendas) {
    const { errores: suyos, valido } = validarRenglon(prenda);
    for (const [campo, mensaje] of Object.entries(suyos)) errores[`renglon:${prenda.clave}:${campo as CampoRenglon}`] = mensaje;
    if (valido) validas.push(valido);
  }
  return validas;
}

/**
 * Revisa el formulario y arma lo que hay que mandar. `boleta` y `origen` son cómo estaba: con ellos se decide qué cambió.
 */
export function revisarCorreccion(boleta: BoletaListada, origen: OrigenDeLaBoleta, datos: DatosCorreccion): RevisionCorreccion {
  const errores: ErroresCorreccion = {};
  const numeroBoleta = datos.numeroBoleta.trim();
  if (!esNumeroDeBoleta(numeroBoleta)) errores.numeroBoleta = MENSAJES_CORRECCION.boleta;
  else if (numeroBoleta.length > LARGO_MAXIMO_BOLETA) errores.numeroBoleta = MENSAJES_CORRECCION.boletaLarga;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.dia)) errores.dia = MENSAJES_CORRECCION.dia;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.hora)) errores.hora = MENSAJES_CORRECCION.hora;

  const antes = validarPrendas(datosIniciales(boleta, origen).prendas, {});
  const prendas = validarPrendas(datos.prendas, errores);
  const conPrendas = datos.prendas.length > 0;

  let descripcion = datos.descripcion.trim();
  let precio: Centavos | null = null;
  const cambiaronLasPrendas = !mismasPrendas(antes, prendas) || datos.prendas.length !== antes.length;
  if (conPrendas) {
    const { total, error } = totalDe(prendas);
    if (error) errores.precio = error;
    precio = total;
    // La descripción es el resumen de las prendas, pero solo se vuelve a armar si cambiaron: una boleta guardada con
    // otro resumen (de otra versión de la app) no tiene por qué "corregirse" si el admin no tocó nada.
    descripcion = cambiaronLasPrendas ? describirRenglones(prendas) : boleta.descripcion;
  } else {
    if (descripcion === '') errores.descripcion = MENSAJES_CORRECCION.descripcion;
    try {
      precio = parsearMonto(datos.precio);
    } catch {
      errores.precio = MENSAJES_CORRECCION.precio;
    }
  }

  if (Object.keys(errores).length > 0) return { tipo: 'invalida', errores };

  const cuerpo: CuerpoCorreccion = {};
  if (numeroBoleta !== boleta.numeroBoleta) cuerpo.numero_boleta = numeroBoleta;
  if (datos.sucursalId !== origen.sucursalId) cuerpo.sucursal_id = datos.sucursalId;
  if (`${datos.dia} ${datos.hora}` !== origen.fechaEntrada.slice(0, 16)) {
    cuerpo.fecha_entrada = `${datos.dia}T${datos.hora}:00${ZONA_BOLIVIA}`;
  }
  const fechaEstimada = datos.fechaEstimada === '' ? null : datos.fechaEstimada;
  if (fechaEstimada !== origen.fechaEstimadaSalida) cuerpo.fecha_estimada_salida = fechaEstimada;
  if (descripcion !== boleta.descripcion) cuerpo.descripcion = descripcion;
  if (cambiaronLasPrendas) {
    cuerpo.renglones = prendas.map((p) => ({
      id: p.clave,
      descripcion: p.descripcion,
      cantidad: aDecimal(p.cantidad),
      precio_unitario: aDecimal(p.precioUnitario),
    }));
  }
  // Con prendas, el servidor saca el total de ellas; sin prendas, va el escrito si cambió.
  if (!conPrendas && precio !== null && precio !== boleta.precioTotal) cuerpo.precio_total = aDecimal(precio);

  return Object.keys(cuerpo).length === 0 ? { tipo: 'sin-cambios' } : { tipo: 'lista', cuerpo };
}
