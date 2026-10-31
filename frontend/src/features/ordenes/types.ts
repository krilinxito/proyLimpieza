import type { Centavos } from '../../lib/money';
import type { EstadoOrden, MetodoPago, MomentoItem, TipoPago } from '../../lib/dominio';
import type { Retiro } from './retiro';
import type { Cliente, ClienteElegido } from '../clientes/types';
import type { ClaveCampoRenglon, RenglonEscrito } from './renglones';

/** Lo que escribe el empleado al registrar ropa, tal cual, sin limpiar. */
export type DatosRopa = {
  /**
   * Quién deja la ropa: uno que ya existe o uno nuevo, que se da de alta junto con la ropa
   * (SPEC-KRILINXI-034). null si todavía no eligió.
   */
  cliente: ClienteElegido | null;
  numeroBoleta: string;
  /**
   * Qué deja, renglón por renglón (SPEC-KRILINXI-068): descripción, cantidad y precio de cada una. El total y la
   * descripción de la boleta salen de acá; ya no se escriben a mano.
   */
  renglones: RenglonEscrito[];
  /** AAAA-MM-DD, del selector de fecha; vacío si no se sabe. */
  fechaEstimada: string;
  /** Vacío si no deja adelanto. */
  adelanto: string;
  /** Solo cuenta si hay adelanto. */
  metodoAdelanto: MetodoPago | null;
};

/**
 * Qué está mal en cada campo, en palabras del mostrador. Los de cada renglón van por su clave (`renglon:<clave>:cantidad`,
 * SPEC-KRILINXI-068), y `renglones` es lo que se dice de todos juntos (un total demasiado alto).
 */
export type ErroresRopa = Partial<
  Record<keyof DatosRopa | 'clienteNombre' | 'clienteTelefono' | 'clienteCarnet' | ClaveCampoRenglon, string>
>;

/**
 * Cómo va lo escrito, sin guardar nada — SPEC-KRILINXI-058: lo que el formulario usa para mostrar el visto de cada campo y
 * de cada tarjeta. Es el resultado de las mismas validaciones del guardado, no de reglas aparte.
 */
export type RevisionDeRopa = {
  errores: ErroresRopa;
  /** El cliente nuevo tiene el teléfono de otro que ya existe: no es un error de escritura, pero tampoco se puede guardar así. */
  telefonoOcupado: boolean;
};

/** Quién registra, y dónde. Sale de la sesión, nunca de lo que se escribe en pantalla. */
export type QuienRegistra = { usuarioId: string; sucursalId: string };

/** Lo que se muestra al terminar: la boleta que se lleva el cliente, en números. */
export type RopaRegistrada = {
  ordenId: string;
  numeroBoleta: string;
  cliente: Cliente;
  descripcion: string;
  precioTotal: Centavos;
  /** 0 si no dejó adelanto. */
  adelanto: Centavos;
  saldo: Centavos;
  fechaEstimada: string | null;
};

export type ResultadoRegistro =
  | { tipo: 'registrada'; ropa: RopaRegistrada }
  | { tipo: 'invalida'; errores: ErroresRopa }
  /** El cliente nuevo tiene el teléfono de otro que ya existe (SPEC-KRILINXI-034): no se guardó nada. */
  | { tipo: 'telefono-ocupado'; cliente: Cliente };

/** Un renglón de la boleta tal como se muestra — SPEC-KRILINXI-068. */
export type RenglonVisto = {
  id: string;
  /** INGRESO, de la boleta; ENTREGA, un cargo al entregar. */
  momento: MomentoItem;
  descripcion: string;
  /** En centésimas: 2,5 son 250. */
  cantidad: number;
  precioUnitario: Centavos;
  subtotal: Centavos;
};

/** Un pago tal como se muestra en el detalle — SPEC-KRILINXI-008. */
export type PagoVisto = {
  id: string;
  tipo: TipoPago;
  metodo: MetodoPago;
  monto: Centavos;
  fecha: string | null;
};

/** Una orden de la sucursal como la ve el mostrador — SPEC-KRILINXI-008. */
export type OrdenVista = {
  id: string;
  numeroBoleta: string;
  descripcion: string;
  /** El estado efectivo: ENTREGADO si ya tiene entrega aunque no haya sincronizado. */
  estado: EstadoOrden;
  /** Para abrir la ficha de su cliente desde la boleta (SPEC-KRILINXI-033); null en una fila rota. */
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  fechaEntrada: string | null;
  fechaEstimada: string | null;
  precioTotal: Centavos;
  /** El de la entrega; null si todavía no se entregó. */
  precioFinal: Centavos | null;
  /** Quién retiró la ropa (SPEC-KRILINXI-060); null si todavía no se entregó. */
  retiro: Retiro | null;
  pagado: Centavos;
  saldo: Centavos;
  pagos: PagoVisto[];
  /** Sus renglones (SPEC-KRILINXI-068): los de la boleta y, después, los cargos. Vacío en una boleta de antes. */
  renglones: RenglonVisto[];
};

/** Cómo terminó una acción sobre una orden (avanzar, anular, cobrar). */
export type ResultadoAccion = { tipo: 'hecho' } | { tipo: 'no-se-puede'; mensaje: string };
