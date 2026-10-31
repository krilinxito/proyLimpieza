import type { MetodoPago, TipoRetiro } from '../../lib/dominio';
import type { Centavos } from '../../lib/money';
import type { ClaveCampoRenglon, RenglonEscrito, RenglonValido } from '../ordenes/renglones';

/** Lo que escribe el empleado al entregar, tal cual — SPEC-KRILINXI-009. */
export type DatosEntrega = {
  /** null mientras no eligió. */
  traeBoleta: boolean | null;
  retiradoPorNombre: string;
  retiradoPorCarnet: string;
  /**
   * Los cargos al entregar (un recargo por almacenamiento, por ejemplo) — SPEC-KRILINXI-068. Son renglones, como los de
   * la boleta, y el precio final es el de la boleta más ellos: ya no se escribe a mano. Vacío si no hay ninguno.
   */
  cargos: RenglonEscrito[];
  /** Vacío si no cobra nada al entregar. */
  pagoFinal: string;
  metodoPago: MetodoPago | null;
};

/** Los de cada cargo van por su clave (`renglon:<clave>:cantidad`), como en Registrar ropa. */
export type ErroresEntrega = Partial<Record<keyof DatosEntrega | ClaveCampoRenglon, string>>;

/** Una entrega que pasó todas las validaciones y todavía no se guardó. */
export type EntregaLista = {
  ordenId: string;
  numeroBoleta: string;
  tipoRetiro: TipoRetiro;
  retiradoPorNombre: string | null;
  retiradoPorCarnet: string | null;
  /** El de la boleta más todos sus cargos: lo que el servidor va a calcular igual (SPEC-KRILINXI-068). */
  precioFinal: Centavos;
  /** Los cargos nuevos, ya validados, que se guardan con la entrega. */
  cargos: RenglonValido[];
  /** 0 si no cobra nada al entregar. */
  pagoFinal: Centavos;
  metodoPago: MetodoPago | null;
  /**
   * Si la ropa sale sin cobrar (SPEC-KRILINXI-070): el motivo y cuánto no se cobró. `null` en una entrega común. En un
   * reembolso, `precioFinal` es lo ya cobrado, igual que lo que guarda el servidor.
   */
  reembolso: { motivo: string; noCobrado: Centavos } | null;
};

/** Lo que escribe el empleado al entregar sin cobrar — SPEC-KRILINXI-070. El retiro es el de siempre, más el motivo. */
export type DatosReembolso = Pick<DatosEntrega, 'traeBoleta' | 'retiradoPorNombre' | 'retiradoPorCarnet'> & {
  motivoReembolso: string;
};

export type ErroresReembolso = Partial<Record<keyof DatosReembolso, string>>;

export type ResultadoReembolso =
  | { tipo: 'lista'; entrega: EntregaLista }
  | { tipo: 'invalida'; errores: ErroresReembolso }
  /** La orden en sí no se puede entregar sin cobrar: no existe, está cerrada o no debe nada. */
  | { tipo: 'no-se-puede'; mensaje: string };

export type ResultadoEntrega =
  | { tipo: 'lista'; entrega: EntregaLista }
  | { tipo: 'invalida'; errores: ErroresEntrega }
  /** La orden en sí no se puede entregar: no existe, está anulada o ya se entregó. */
  | { tipo: 'no-se-puede'; mensaje: string };
