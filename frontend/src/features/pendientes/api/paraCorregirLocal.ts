/**
 * Los registros que el servidor rechazó, leídos de la tabla solo local `para_corregir` —
 * SPEC-KRILINXI-007. Los escribe la subida (`lib/powersync/conector.ts`); aquí solo se leen.
 *
 * Mismo patrón que `features/clientes/api/clientesLocal.ts`: la base llega como argumento.
 */
import type { BaseLocal, Fila } from '../../../lib/powersync';
import { desdeDecimal, formatearBs } from '../../../lib/money';

export type RegistroParaCorregir = {
  id: string;
  /** Qué era, en palabras: "Ropa con la boleta 001234", "Cobro de Bs 20,00". */
  que: string;
  /** Por qué no se guardó: el mensaje del servidor, ya escrito para el mostrador. */
  mensaje: string;
  /** Cuándo se intentó guardar, en ISO 8601. */
  fecha: string;
};

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

function monto(valor: unknown): string | null {
  const decimal = texto(valor);
  if (!decimal) return null;
  try {
    return formatearBs(desdeDecimal(decimal));
  } catch {
    return null;
  }
}

/**
 * Describe el registro con sus datos principales. Una edición (PATCH) puede traer solo lo
 * que cambió, así que cada dato es opcional y se dice lo que haya.
 */
export function describir(tabla: string, datos: Record<string, unknown>): string {
  switch (tabla) {
    case 'ordenes': {
      const boleta = texto(datos.numero_boleta);
      return boleta ? `Ropa con la boleta ${boleta}` : 'Un cambio en una boleta';
    }
    case 'pagos': {
      const cuanto = monto(datos.monto);
      return cuanto ? `Cobro de ${cuanto}` : 'Un cobro';
    }
    case 'clientes': {
      const nombre = texto(datos.nombre);
      const telefono = texto(datos.telefono);
      if (nombre && telefono) return `Cliente ${nombre} (${telefono})`;
      return nombre ? `Cliente ${nombre}` : 'Un cambio en un cliente';
    }
    case 'entregas':
      return 'Una entrega de ropa';
    default:
      return 'Un registro';
  }
}

function leerDatos(json: unknown): Record<string, unknown> {
  if (typeof json !== 'string') return {};
  try {
    const valor: unknown = JSON.parse(json);
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? { ...valor } : {};
  } catch {
    return {};
  }
}

function aRegistro(fila: Fila): RegistroParaCorregir | null {
  const { id, tabla, datos, mensaje, fecha } = fila;
  if (typeof id !== 'string' || typeof tabla !== 'string') return null;
  return {
    id,
    que: describir(tabla, leerDatos(datos)),
    mensaje: texto(mensaje) ?? 'No se pudo guardar.',
    fecha: texto(fecha) ?? '',
  };
}

/** Todos, del más viejo al más nuevo: en el orden en que se intentaron guardar. */
export async function listarParaCorregir(base: BaseLocal): Promise<RegistroParaCorregir[]> {
  const filas = await base.consultar('SELECT id, tabla, datos, mensaje, fecha FROM para_corregir ORDER BY fecha');
  return filas.map(aRegistro).filter((r): r is RegistroParaCorregir => r !== null);
}
