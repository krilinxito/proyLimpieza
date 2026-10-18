/**
 * Qué se corrige de cada registro rechazado y cómo se muestra — SPEC-KRILINXI-013.
 *
 * Es la parte pura de la corrección: no toca la base, así que la usan tanto el formulario
 * (qué campos mostrar y con qué valores arrancar) como `api/corregirLocal.ts` (qué validar y
 * escribir). Está fuera de `api/` por lo mismo que `features/ordenes/estado.ts`: un
 * componente no importa de `api/` (lo vigila `test/arquitectura.test.ts`).
 */
import { aDecimal, desdeDecimal } from '../../lib/money';
import type { RegistroParaCorregir } from './types';

/** Cómo se escribe cada dato en el formulario. */
export type TipoCampo = 'texto' | 'monto' | 'fecha' | 'metodo' | 'retiro';

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
    'Un cambio de estado no se corrige aquí: puede que la ropa ya esté en otro paso. Buscá la boleta en el Mostrador, fijate cómo está y, si hace falta, hacé el cambio de nuevo desde ahí.',
  desconocido: 'Este registro no se puede corregir desde aquí. Avisale al encargado o descartalo.',
  sinCambios: 'No cambiaste ningún dato. Corregí lo que está mal o descartá el registro.',
  yaNoEsta: 'Ese registro ya no está en esta tablet. Descartalo y, si hace falta, volvé a hacerlo.',
} as const;

/** Los datos que se corrigen de cada tabla, con las mismas etiquetas que su pantalla de origen. */
export const CAMPOS: Record<string, readonly Campo[]> = {
  ordenes: [
    { clave: 'numero_boleta', etiqueta: 'Número de la boleta', tipo: 'texto' },
    { clave: 'descripcion', etiqueta: 'Qué ropa deja', tipo: 'texto' },
    { clave: 'precio_total', etiqueta: 'Precio (Bs)', tipo: 'monto' },
    { clave: 'fecha_estimada_salida', etiqueta: 'Para cuándo estará lista (si se sabe)', tipo: 'fecha' },
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
    { clave: 'precio_final', etiqueta: 'Precio final (Bs)', tipo: 'monto' },
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
