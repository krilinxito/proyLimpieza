import type { MetodoPago, TipoRetiro } from '../../lib/dominio';
import type { Centavos } from '../../lib/money';

/** Lo que escribe el empleado al entregar, tal cual — SPEC-KRILINXI-009. */
export type DatosEntrega = {
  /** null mientras no eligió. */
  traeBoleta: boolean | null;
  retiradoPorNombre: string;
  retiradoPorCarnet: string;
  /** Viene cargado con el precio de la orden; se puede cambiar. */
  precioFinal: string;
  /** Vacío si no cobra nada al entregar. */
  pagoFinal: string;
  metodoPago: MetodoPago | null;
};

export type ErroresEntrega = Partial<Record<keyof DatosEntrega, string>>;

/** Una entrega que pasó todas las validaciones y todavía no se guardó. */
export type EntregaLista = {
  ordenId: string;
  numeroBoleta: string;
  tipoRetiro: TipoRetiro;
  retiradoPorNombre: string | null;
  retiradoPorCarnet: string | null;
  precioFinal: Centavos;
  /** 0 si no cobra nada al entregar. */
  pagoFinal: Centavos;
  metodoPago: MetodoPago | null;
  /** Lo que queda debiendo el cliente después de entregar. */
  saldoDespues: Centavos;
};

export type ResultadoEntrega =
  | { tipo: 'lista'; entrega: EntregaLista }
  | { tipo: 'invalida'; errores: ErroresEntrega }
  /** La orden en sí no se puede entregar: no existe, está anulada o ya se entregó. */
  | { tipo: 'no-se-puede'; mensaje: string };
