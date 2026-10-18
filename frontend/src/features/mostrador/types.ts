import type { Cliente } from '../clientes/types';
import type { OrdenVista } from '../ordenes/types';

/** Lo que encuentra el buscador del Mostrador — SPEC-KRILINXI-033: un cliente o una boleta. */
export type Encontrado = { tipo: 'cliente'; cliente: Cliente } | { tipo: 'boleta'; orden: OrdenVista };
