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
};

export type ResultadoEntrega =
  | { tipo: 'lista'; entrega: EntregaLista }
  | { tipo: 'invalida'; errores: ErroresEntrega }
  /** La orden en sí no se puede entregar: no existe, está anulada o ya se entregó. */
  | { tipo: 'no-se-puede'; mensaje: string };
