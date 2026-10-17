/**
 * Un registro de la auditoría, en palabras del negocio — SPEC-KRILINXI-018.
 *
 * La auditoría guarda códigos (`CREAR` sobre `ordenes`); la pantalla dice "Registró ropa".
 * Todo lo que se muestra de un registro sale de aquí, que es puro: se prueba sin pantalla.
 *
 * "Sobre qué" tiene un límite que hay que conocer: el admin no tiene en su tablet ni la ropa, ni
 * los cobros, ni las entregas (el bucket `sucursal` le llega vacío, CLAUDE.md §7), así que de
 * esos solo se dice el tipo. Clientes, personal y sucursales sí se nombran.
 */
import { esEstadoOrden, TEXTO_ESTADO_ORDEN } from '../../lib/dominio';
import { desdeDecimal, formatearBs } from '../../lib/money';
import { fechaParaLeer } from '../estadisticas/periodo';
import type { Accion, NombresConocidos, RegistroAuditoria, Tabla } from './types';

/** Qué hizo, sin el "sobre qué". */
export function queHizo({ accion, tablaAfectada, valoresAnteriores }: RegistroAuditoria): string {
  const antes = valoresAnteriores ?? {};
  if (accion === 'LOGIN') return 'Entró al sistema';
  if (accion === 'COBRAR') return 'Cobró';
  if (accion === 'ENTREGAR') return 'Entregó ropa';
  if (accion === 'ELIMINAR') return 'Borró un registro';
  if (accion === 'CREAR') {
    const altas: Record<Tabla, string> = {
      ordenes: 'Registró ropa',
      clientes: 'Dio de alta un cliente',
      usuarios: 'Dio de alta una cuenta',
      sucursales: 'Dio de alta una sucursal',
      pagos: 'Cobró',
      entregas: 'Entregó ropa',
    };
    return altas[tablaAfectada];
  }
  // EDITAR: lo que había antes dice qué cambió. Si `activo` estaba en true, ahora es false.
  if (tablaAfectada === 'usuarios' && antes.activo === true) return 'Dio de baja una cuenta';
  if (tablaAfectada === 'sucursales' && antes.activa === true) return 'Cerró una sucursal';
  if (tablaAfectada === 'sucursales' && antes.activa === false) return 'Volvió a abrir una sucursal';
  if (tablaAfectada === 'ordenes' && 'estado' in antes) return 'Cambió el estado de una boleta';
  const cambios: Record<Tabla, string> = {
    ordenes: 'Cambió una boleta',
    clientes: 'Cambió los datos de un cliente',
    usuarios: 'Cambió los datos de una cuenta',
    sucursales: 'Cambió los datos de una sucursal',
    pagos: 'Cambió un cobro',
    entregas: 'Cambió una entrega',
  };
  return cambios[tablaAfectada];
}

/** El nombre de lo que tocó, si la tablet lo conoce; null si no (ropa, cobros, entregas). */
export function sobreQue({ tablaAfectada, registroId }: RegistroAuditoria, nombres: NombresConocidos): string | null {
  if (!registroId) return null;
  if (tablaAfectada === 'clientes') return nombres.clientes.get(registroId) ?? null;
  if (tablaAfectada === 'usuarios') return nombres.cuentas.get(registroId) ?? null;
  if (tablaAfectada === 'sucursales') return nombres.sucursales.get(registroId) ?? null;
  return null;
}

/** "2026-10-15 18:30:00" → "15/10/2026 18:30". Ya viene en hora de Bolivia. */
export function momento(fecha: string): string {
  return `${fechaParaLeer(fecha)} ${fecha.slice(11, 16)}`.trim();
}

/**
 * Cuándo pasó y, si es distinto, cuándo llegó. Una tablet sin internet sube después: la ropa
 * se recibió a las 10:00 y llegó a las 15:00. Las dos cosas importan, y se dicen las dos.
 */
export function cuando({ fecha, fechaDelHecho }: RegistroAuditoria): { paso: string; llego: string | null } {
  if (!fechaDelHecho || fechaDelHecho.slice(0, 16) === fecha.slice(0, 16)) return { paso: momento(fecha), llego: null };
  return { paso: momento(fechaDelHecho), llego: momento(fecha) };
}

const ETIQUETAS: Record<string, string> = {
  nombre: 'Nombre',
  nombre_completo: 'Nombre',
  telefono: 'Teléfono',
  carnet: 'Carnet',
  numero_boleta: 'Número de boleta',
  descripcion: 'Qué ropa',
  precio_total: 'Precio',
  fecha_estimada_salida: 'Para cuándo',
  estado: 'Estado',
  direccion: 'Dirección',
  sucursal_id: 'Sucursal',
  activo: 'Cuenta',
  activa: 'Sucursal',
};

function valorParaLeer(clave: string, valor: unknown, nombres: NombresConocidos): string {
  if (valor === null || valor === undefined || valor === '') return '(vacío)';
  if (clave === 'estado' && esEstadoOrden(valor)) return TEXTO_ESTADO_ORDEN[valor];
  if (clave === 'precio_total' && typeof valor === 'string') {
    try {
      return formatearBs(desdeDecimal(valor));
    } catch {
      return valor;
    }
  }
  if (clave === 'sucursal_id' && typeof valor === 'string') return nombres.sucursales.get(valor) ?? 'otra sucursal';
  if (clave === 'activo') return valor === true ? 'activa' : 'dada de baja';
  if (clave === 'activa') return valor === true ? 'abierta' : 'cerrada';
  if (clave === 'fecha_estimada_salida' && typeof valor === 'string') return fechaParaLeer(valor);
  return String(valor);
}

/**
 * Lo que había antes, dato por dato, para el detalle de una edición. De la contraseña no se
 * guarda nada más que la marca de que cambió (SPEC-ALE186-010), y eso es lo que se dice.
 */
export function antes(registro: RegistroAuditoria, nombres: NombresConocidos): string[] {
  const valores = registro.valoresAnteriores;
  if (!valores) return [];
  return Object.entries(valores).flatMap(([clave, valor]) => {
    if (clave === 'contrasena_cambiada') return valor === true ? ['Le cambió la contraseña'] : [];
    const etiqueta = ETIQUETAS[clave];
    // Un dato que la pantalla no sabe nombrar no se muestra con su nombre de columna.
    if (!etiqueta) return ['Otro dato'];
    return [`${etiqueta} antes: ${valorParaLeer(clave, valor, nombres)}`];
  });
}

export const TEXTO_REVISION: Record<string, string> = {
  cuenta_dada_de_baja: 'Para revisar: lo hizo una cuenta que ya estaba dada de baja.',
};

export function textoRevision(revision: string | null): string | null {
  if (!revision) return null;
  return TEXTO_REVISION[revision] ?? 'Para revisar.';
}

/**
 * Las opciones de "Qué buscar", en palabras del negocio. Cada una es una acción, un tipo de
 * registro o los dos: así el admin elige una sola cosa en vez de combinar dos listas de códigos.
 */
export const QUE_BUSCAR: readonly { clave: string; texto: string; accion?: Accion; tabla?: Tabla }[] = [
  { clave: 'ropa', texto: 'Ropa registrada', accion: 'CREAR', tabla: 'ordenes' },
  { clave: 'boletas', texto: 'Cambios en boletas', accion: 'EDITAR', tabla: 'ordenes' },
  { clave: 'cobros', texto: 'Cobros', tabla: 'pagos' },
  { clave: 'entregas', texto: 'Entregas', tabla: 'entregas' },
  { clave: 'clientes', texto: 'Clientes', tabla: 'clientes' },
  { clave: 'personal', texto: 'Personal', tabla: 'usuarios' },
  { clave: 'sucursales', texto: 'Sucursales', tabla: 'sucursales' },
  { clave: 'ingresos', texto: 'Entradas al sistema', accion: 'LOGIN' },
];
