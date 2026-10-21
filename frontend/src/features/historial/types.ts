import type { EstadoOrden } from '../../lib/dominio';
import type { Centavos } from '../../lib/money';

/**
 * Una boleta en la lista del historial — SPEC-KRILINXI-041. Es una sola forma para las dos
 * fuentes: la base local (quien atiende, últimos 30 días) y la API (el admin, todo el historial).
 * Así la lista y el filtro no saben de dónde vienen los datos.
 */
export type BoletaListada = {
  id: string;
  numeroBoleta: string;
  /** Para abrirla en el Mostrador; null en una fila rota. */
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  /** Solo la trae la API: en la base local todas son de la sucursal de trabajo. */
  sucursalNombre: string | null;
  descripcion: string;
  /** ENTREGADO si ya tiene entrega, también en la base local aunque no haya sincronizado. */
  estado: EstadoOrden;
  /** El día en que entró, en Bolivia (`YYYY-MM-DD`); null si la fecha no se entiende. */
  dia: string | null;
  precioTotal: Centavos;
  /** El de la entrega; null mientras no se entregó. */
  precioFinal: Centavos | null;
  pagado: Centavos;
  saldo: Centavos;
};

/** Una página de la lista completa del admin — `GET /api/ordenes` (SPEC-KRILINXI-040). */
export type PaginaHistorial = {
  pagina: number;
  porPagina: number;
  total: number;
  boletas: BoletaListada[];
};
