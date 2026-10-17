/**
 * Lo que devuelven `/api/estadisticas/ingresos`, `/saldos` y `/sin-recoger` — SPEC-KRILINXI-015.
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

export type Panel = { ingresos: Ingresos; saldos: Saldos; sinRecoger: SinRecoger };

/** Una sucursal para el filtro, leída de la base local. */
export type SucursalElegible = { id: string; nombre: string };
