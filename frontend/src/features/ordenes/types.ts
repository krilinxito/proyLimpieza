import type { Centavos } from '../../lib/money';
import type { MetodoPago } from '../../lib/dominio';
import type { Cliente } from '../clientes/types';

/** Lo que escribe el empleado al registrar ropa, tal cual, sin limpiar. */
export type DatosRopa = {
  /** El cliente elegido en el paso anterior; null si todavía no eligió. */
  cliente: Cliente | null;
  numeroBoleta: string;
  descripcion: string;
  /** Como lo escribió: "25", "25,50" o "25.50". */
  precio: string;
  /** AAAA-MM-DD, del selector de fecha; vacío si no se sabe. */
  fechaEstimada: string;
  /** Vacío si no deja adelanto. */
  adelanto: string;
  /** Solo cuenta si hay adelanto. */
  metodoAdelanto: MetodoPago | null;
};

/** Qué está mal en cada campo, en palabras del mostrador. */
export type ErroresRopa = Partial<Record<keyof DatosRopa, string>>;

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

export type ResultadoRegistro = { tipo: 'registrada'; ropa: RopaRegistrada } | { tipo: 'invalida'; errores: ErroresRopa };
