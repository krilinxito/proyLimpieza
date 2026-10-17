import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from './iconos';

export type TipoAviso = 'informacion' | 'exito' | 'advertencia' | 'error';

const TONO: Record<TipoAviso, { clases: string; icono: NombreIcono; rol: 'status' | 'alert' }> = {
  informacion: { clases: 'border-info-borde bg-info-fondo text-info-texto', icono: 'informacion', rol: 'status' },
  exito: { clases: 'border-exito-borde bg-exito-fondo text-exito-texto', icono: 'listo', rol: 'status' },
  advertencia: { clases: 'border-advertencia-borde bg-advertencia-fondo text-advertencia-texto', icono: 'advertencia', rol: 'alert' },
  error: { clases: 'border-peligro-borde bg-peligro-fondo text-peligro-texto', icono: 'alerta', rol: 'alert' },
};

type Props = {
  tipo: TipoAviso;
  /** Lo que pasó y qué hacer, en palabras (CLAUDE.md §9). Siempre hay texto: el color solo acompaña. */
  children: ReactNode;
};

/**
 * Un aviso en la pantalla — SPEC-KRILINXI-022. Reemplaza los `bg-red-50`, `bg-green-50`… que
 * cada pantalla escribía a mano, para que un error se vea igual en todas.
 *
 * El rol le dice al lector de pantalla cuánto apurarse: `alert` (error, advertencia) se lee en
 * el acto, interrumpiendo; `status` (información, éxito) espera a que termine lo que estaba
 * leyendo. Los tests lo buscan igual: `getByRole('alert')`.
 *
 * Sin márgenes propios: el espacio alrededor lo pone quien lo usa, que sabe dónde va.
 */
export function Aviso({ tipo, children }: Props) {
  const { clases, icono, rol } = TONO[tipo];
  return (
    <div role={rol} className={`flex items-start gap-3 rounded-xl border-2 p-4 text-xl ${clases}`}>
      <Icono nombre={icono} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
