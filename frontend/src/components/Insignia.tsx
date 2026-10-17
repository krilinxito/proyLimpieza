import type { ReactNode } from 'react';

export type TonoInsignia = 'neutro' | 'informacion' | 'exito' | 'advertencia' | 'peligro';

const TONO: Record<TonoInsignia, string> = {
  neutro: 'border-borde bg-fondo text-texto',
  informacion: 'border-info-borde bg-info-fondo text-info-texto',
  exito: 'border-exito-borde bg-exito-fondo text-exito-texto',
  advertencia: 'border-advertencia-borde bg-advertencia-fondo text-advertencia-texto',
  peligro: 'border-peligro-borde bg-peligro-fondo text-peligro-texto',
};

type Props = {
  tono: TonoInsignia;
  /** La palabra: "Lista para entregar". Es lo que se lee; el color solo ayuda a encontrarla. */
  children: ReactNode;
};

/**
 * Una etiqueta corta con color — SPEC-KRILINXI-022. No sabe de órdenes: qué tono lleva cada
 * estado lo decide la feature (CLAUDE.md §5, `components/` no conoce el negocio).
 */
export function Insignia({ tono, children }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-lg font-semibold ${TONO[tono]}`}>
      {children}
    </span>
  );
}
