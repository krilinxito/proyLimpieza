/**
 * Lo que devuelve `GET /api/auditoria` — SPEC-KRILINXI-018, contrato de SPEC-ALE186-012 (con
 * `fechaDelHecho` desde SPEC-ALE186-015 y `revision` desde SPEC-ALE186-018).
 */

export const ACCIONES = ['CREAR', 'EDITAR', 'ELIMINAR', 'LOGIN', 'ENTREGAR', 'COBRAR'] as const;
export type Accion = (typeof ACCIONES)[number];

// `orden_items`, los renglones de la boleta, desde SPEC-KRILINXI-068.
export const TABLAS = ['clientes', 'ordenes', 'pagos', 'entregas', 'usuarios', 'sucursales', 'orden_items'] as const;
export type Tabla = (typeof TABLAS)[number];

export type RegistroAuditoria = {
  id: string;
  /** Cuándo llegó al servidor: `YYYY-MM-DD HH:MM:SS` en hora de Bolivia. */
  fecha: string;
  accion: Accion;
  tablaAfectada: Tabla;
  registroId: string | null;
  /** Dónde pasó; null si no pasa en una sucursal (un login, un cambio de personal). */
  sucursalId: string | null;
  /** Cuándo pasó de verdad, según la tablet; null si no se sabe. */
  fechaDelHecho: string | null;
  /** Si el admin tiene que revisarlo, y por qué. */
  revision: string | null;
  /** En una edición, lo que había antes de lo que cambió. De una contraseña, solo `contrasena_cambiada`. */
  valoresAnteriores: Record<string, unknown> | null;
  usuario: { id: string; nombreCompleto: string; username: string };
};

export type PaginaAuditoria = {
  desde: string;
  hasta: string;
  pagina: number;
  porPagina: number;
  total: number;
  registros: RegistroAuditoria[];
};

/** Nombres que la tablet sí conoce, para decir "sobre qué": bajan por el bucket `global`. */
export type NombresConocidos = {
  clientes: ReadonlyMap<string, string>;
  cuentas: ReadonlyMap<string, string>;
  sucursales: ReadonlyMap<string, string>;
  /**
   * El nombre del cliente por el que se está filtrando, si hay uno (SPEC-KRILINXI-062). Toda la ropa, los cobros y
   * las entregas de esa lista son suyos, aunque la tablet no tenga esos registros para nombrarlo.
   */
  clienteDelFiltro: string | null;
};
