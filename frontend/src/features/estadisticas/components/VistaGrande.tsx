import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Boton } from '../../../components/Boton';
import { GrandeContext } from './graficos/grande';

/** Lo que se puede enfocar con Tab dentro del diálogo (los gráficos de Recharts se enfocan con `tabindex="0"`). */
const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';

type Props = {
  /** El nombre corto de la tarjeta ("Cobrado por día"): es el nombre del diálogo. */
  nombre: string;
  /** La pregunta que se ve arriba, la misma de la tarjeta. */
  pregunta: string;
  periodo: string;
  alCerrar: () => void;
  children: ReactNode;
};

/**
 * El gráfico de una tarjeta, en grande — SPEC-KRILINXI-065. Un diálogo que no ocupa toda la pantalla (`max-w-4xl`) y que
 * dibuja los mismos hijos de la tarjeta con `GrandeContext` en `true`: más alto, con el detalle del dato a un lado, la
 * tabla a la vista y, en los gráficos por día, la leyenda que apaga series y el rango de días.
 *
 * Se porta como un diálogo modal, igual que el cajón del menú (`MenuCompacto`):
 * - Al abrir, el foco va a "Cerrar", el primer botón: quien usa teclado o lector de pantalla empieza ahí.
 * - Tab no se escapa: del último vuelve al primero (si no, seguiría por el tablero de atrás, que está tapado).
 * - Escape, "Cerrar" o tocar fuera lo cierran. **Quien lo abre** (`SeccionPanel`) devuelve el foco a su botón "Agrandar".
 *
 * No pide nada: los hijos ya traen sus datos. Un test cuenta los pedidos antes y después de abrirlo.
 */
export function VistaGrande({ nombre, pregunta, periodo, alCerrar, children }: Props) {
  const cajon = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const alPresionar = (evento: globalThis.KeyboardEvent) => {
      if (evento.key === 'Escape') alCerrar();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [alCerrar]);

  function atraparTab(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key !== 'Tab' || !cajon.current) return;
    const enfocables = [...cajon.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
    const primero = enfocables[0];
    const ultimo = enfocables.at(-1);
    if (!primero || !ultimo) return;
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-texto/60 p-3 backdrop-blur-sm sm:p-4"
      onClick={(evento) => {
        // Solo el fondo: un click dentro del cuadro también burbujea hasta aquí.
        if (evento.target === evento.currentTarget) alCerrar();
      }}
    >
      <div
        ref={cajon}
        role="dialog"
        aria-modal="true"
        aria-label={nombre}
        onKeyDown={atraparTab}
        className="max-h-full w-full max-w-4xl overflow-y-auto rounded-2xl border border-borde-suave bg-superficie p-4 shadow-2xl sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${id}-pregunta`} className="text-2xl font-bold text-texto">
              {pregunta}
            </h2>
            <p className="mt-1 text-lg text-texto-suave">{periodo}</p>
          </div>
          <Boton variante="secundario" tamano="compacto" icono="cerrar" autoFocus onClick={alCerrar}>
            Cerrar
          </Boton>
        </div>
        <GrandeContext.Provider value>{children}</GrandeContext.Provider>
      </div>
    </div>
  );
}
