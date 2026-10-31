/**
 * Qué se corrige de cada registro rechazado y cómo se muestra — SPEC-KRILINXI-013.
 *
 * Es la parte pura de la corrección: no toca la base, así que la usan tanto el formulario
 * (qué campos mostrar y con qué valores arrancar) como `api/corregirLocal.ts` (qué validar y
 * escribir). Está fuera de `api/` por lo mismo que `features/ordenes/estado.ts`: un
 * componente no importa de `api/` (lo vigila `test/arquitectura.test.ts`).
 */
import { aDecimal, desdeDecimal, formatearCantidad } from '../../lib/money';
import type { RegistroParaCorregir } from './types';

/** Cómo se escribe cada dato en el formulario. */
export type TipoCampo = 'texto' | 'texto-largo' | 'monto' | 'cantidad' | 'fecha' | 'metodo' | 'retiro';

/** Un dato que el empleado puede corregir. `clave` es la columna de la base. */
export type Campo = { clave: string; etiqueta: string; tipo: TipoCampo };

/** Lo que muestra "Corregir": el formulario, o por qué este registro no se corrige aquí. */
export type Correccion =
  | { tipo: 'formulario'; campos: Campo[]; valores: Record<string, string> }
  | { tipo: 'sin-formulario'; mensaje: string };

export type ResultadoCorreccion =
  | { tipo: 'guardada' }
  | { tipo: 'invalida'; errores: Record<string, string> }
  | { tipo: 'no-se-puede'; mensaje: string };

export const MENSAJES_CORRECCION = {
  estado:
    'Un cambio de estado no se corrige aquí: puede que la ropa ya esté en otro paso. Busca la boleta en el Mostrador, fíjate cómo está y, si hace falta, haz el cambio de nuevo desde ahí.',
  desconocido: 'Este registro no se puede corregir desde aquí. Avísale al encargado o descártalo.',
  sinCambios: 'No cambiaste ningún dato. Corrige lo que está mal o descarta el registro.',
  yaNoEsta: 'Ese registro ya no está en esta tablet. Descártalo y, si hace falta, vuelve a hacerlo.',
} as const;

/**
 * Los datos que se corrigen de cada tabla, con las mismas etiquetas que su pantalla de origen.
 *
 * Desde SPEC-KRILINXI-068 el precio no se corrige acá: el de una boleta es la suma de sus renglones (y el mostrador no lo
 * cambia), y el precio final de una entrega lo calcula la tablet con los cargos al volver a guardarla. Lo que se corrige
 * de un renglón son sus tres datos.
 */
export const CAMPOS: Record<string, readonly Campo[]> = {
  ordenes: [
    { clave: 'numero_boleta', etiqueta: 'Número de la boleta', tipo: 'texto' },
    { clave: 'descripcion', etiqueta: 'Qué deja', tipo: 'texto-largo' },
    { clave: 'fecha_estimada_salida', etiqueta: 'Para cuándo estará lista (si se sabe)', tipo: 'fecha' },
  ],
  orden_items: [
    { clave: 'descripcion', etiqueta: 'Qué es', tipo: 'texto' },
    { clave: 'cantidad', etiqueta: 'Cuántas', tipo: 'cantidad' },
    { clave: 'precio_unitario', etiqueta: 'Precio de cada una (Bs)', tipo: 'monto' },
  ],
  clientes: [
    { clave: 'nombre', etiqueta: 'Nombre completo', tipo: 'texto' },
    { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'texto' },
    { clave: 'carnet', etiqueta: 'Carnet (si lo da)', tipo: 'texto' },
  ],
  pagos: [
    { clave: 'monto', etiqueta: 'Cuánto paga (Bs)', tipo: 'monto' },
    { clave: 'metodo', etiqueta: '¿Cómo paga?', tipo: 'metodo' },
  ],
  entregas: [
    { clave: 'tipo_retiro', etiqueta: '¿El cliente trae la boleta?', tipo: 'retiro' },
    { clave: 'retirado_por_nombre', etiqueta: 'Nombre de quien retira', tipo: 'texto' },
    { clave: 'retirado_por_carnet', etiqueta: 'Carnet de quien retira', tipo: 'texto' },
  ],
};

/** Un dato guardado, como se escribe en el formulario. */
export function paraFormulario(tipo: TipoCampo, valor: unknown): string {
  if (typeof valor !== 'string') return '';
  if (tipo === 'monto') {
    try {
      // "25.50" → "25,50": como lo escribe el empleado, sin punto de miles para que
      // `parsearMonto` lo vuelva a aceptar tal cual.
      return aDecimal(desdeDecimal(valor)).replace('.', ',');
    } catch {
      return valor;
    }
  }
  if (tipo === 'cantidad') {
    try {
      // "2.50" → "2,5": una cantidad se lee sin ceros de más (SPEC-KRILINXI-068).
      return formatearCantidad(desdeDecimal(valor));
    } catch {
      return valor;
    }
  }
  return valor;
}

/** Los campos que se muestran: todos en un alta, y en una edición solo los que se cambiaron. */
function camposDe(registro: RegistroParaCorregir): Campo[] {
  const campos = CAMPOS[registro.tabla] ?? [];
  return registro.operacion === 'PUT' ? [...campos] : campos.filter((c) => c.clave in registro.datos);
}

/** Lo que muestra "Corregir" para este registro, con los datos que se habían enviado. */
export function prepararCorreccion(registro: RegistroParaCorregir): Correccion {
  const editable = registro.registroId !== '' && (registro.operacion === 'PUT' || registro.operacion === 'PATCH');
  const campos = editable ? camposDe(registro) : [];
  if (campos.length === 0) {
    const esEstado = registro.tabla === 'ordenes' && 'estado' in registro.datos;
    return { tipo: 'sin-formulario', mensaje: esEstado ? MENSAJES_CORRECCION.estado : MENSAJES_CORRECCION.desconocido };
  }
  const valores = Object.fromEntries(campos.map((c) => [c.clave, paraFormulario(c.tipo, registro.datos[c.clave])]));
  return { tipo: 'formulario', campos, valores };
}
