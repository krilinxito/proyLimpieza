/**
 * Lo que devuelven `/api/estadisticas/ingresos`, `/saldos` y `/sin-recoger` — SPEC-KRILINXI-015 —,
 * y `/volumen`, `/productividad` y `/clientes` — SPEC-KRILINXI-016.
 *
 * Es el contrato de SPEC-ALE186-008, campo por campo. Los montos llegan como texto decimal
 * ("125.50"), ya sumados en Postgres: el front los muestra, no los suma (CLAUDE.md §8).
 */
import type { MetodoPago } from '../../lib/dominio';

/** Un monto tal como lo manda el servidor: "125.50". */
export type MontoTexto = string;

export const TRAMOS = ['HASTA_7_DIAS', 'DE_8_A_30_DIAS', 'MAS_DE_30_DIAS'] as const;
export type Tramo = (typeof TRAMOS)[number];

export const TEXTO_TRAMO: Record<Tramo, string> = {
  HASTA_7_DIAS: 'Hasta 7 días',
  DE_8_A_30_DIAS: 'De 8 a 30 días',
  MAS_DE_30_DIAS: 'Más de 30 días',
};

export type Ingresos = {
  desde: string;
  hasta: string;
  total: MontoTexto;
  porSucursal: {
    sucursalId: string;
    sucursal: string;
    total: MontoTexto;
    porMetodo: Record<MetodoPago, MontoTexto>;
  }[];
};

/** Lo cobrado un día, con el desglose por forma de pago — `/ingresos-por-dia`, SPEC-KRILINXI-043. */
export type IngresoDia = {
  /** `YYYY-MM-DD`, día de Bolivia. */
  fecha: string;
  total: MontoTexto;
  porMetodo: Record<MetodoPago, MontoTexto>;
};

/** `/ingresos-por-dia`: todos los días del período, también los que quedan en "0.00". */
export type IngresosPorDia = {
  desde: string;
  hasta: string;
  total: MontoTexto;
  porDia: IngresoDia[];
};

export type Saldos = {
  desde: string;
  hasta: string;
  total: MontoTexto;
  cantidad: number;
  porAntiguedad: { tramo: Tramo; cantidad: number; total: MontoTexto }[];
  ordenes: {
    ordenId: string;
    numeroBoleta: string;
    cliente: string;
    estado: string;
    montoACobrar: MontoTexto;
    totalPagado: MontoTexto;
    saldoPendiente: MontoTexto;
    dias: number;
  }[];
};

export type SinRecoger = {
  desde: string;
  hasta: string;
  cantidad: number;
  porAntiguedad: { tramo: Tramo; cantidad: number }[];
  ordenes: {
    ordenId: string;
    numeroBoleta: string;
    cliente: string;
    telefono: string;
    descripcion: string;
    sucursal: string;
    precioTotal: MontoTexto;
    dias: number;
  }[];
};

/** `/volumen` — SPEC-ALE186-013. Un día por cada día del período, también los que quedan en 0. */
export type Volumen = {
  desde: string;
  hasta: string;
  total: number;
  anuladas: number;
  porDia: { fecha: string; ordenes: number; anuladas: number }[];
};

/** `/productividad` — SPEC-ALE186-013. Una fila por persona y por sucursal del registro. */
export type Productividad = {
  desde: string;
  hasta: string;
  porEmpleado: {
    usuario: { id: string; nombreCompleto: string };
    sucursal: { id: string; nombre: string };
    ordenesRecibidas: number;
    cobros: number;
    montoCobrado: MontoTexto;
    entregas: number;
  }[];
};

/** Lo que vino un cliente: en total o en una sucursal. `ultimaVisita` es `YYYY-MM-DD HH:MM:SS` de Bolivia. */
export type Atenciones = { ordenes: number; gastado: MontoTexto; ultimaVisita: string };

/** `/clientes` — SPEC-ALE186-017, paginada. */
export type ClientesAtendidos = {
  desde: string;
  hasta: string;
  pagina: number;
  porPagina: number;
  /** Todos los clientes con atenciones, no solo los de esta página. */
  total: number;
  clientes: (Atenciones & {
    cliente: { id: string; nombre: string; telefono: string };
    porSucursal: (Atenciones & { sucursal: { id: string; nombre: string } })[];
  })[];
};

export type Panel = {
  ingresos: Ingresos;
  saldos: Saldos;
  sinRecoger: SinRecoger;
  /** SPEC-KRILINXI-016. Los clientes y la productividad van aparte (SPEC-KRILINXI-050): solo las usan tarjetas plegadas. */
  volumen: Volumen;
};

/** Una sucursal para el filtro, leída de la base local. */
export type SucursalElegible = { id: string; nombre: string };
