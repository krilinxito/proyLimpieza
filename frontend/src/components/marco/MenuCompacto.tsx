import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icono } from '../iconos';
import { MenuPrincipal, type DestinoMenu } from './MenuPrincipal';

/** Lo que se puede enfocar con Tab dentro del cajón. */
const ENFOCABLES = 'a[href], button:not([disabled])';

/**
 * El menú en pantalla chica (tablet vertical, celular) — SPEC-KRILINXI-023: un botón que dice
 * "Menú" en palabras, y un cajón que se abre encima de la pantalla.
 *
 * El cajón es un diálogo modal, y se porta como uno:
 * - Al abrir, el foco va al primer destino: quien usa teclado o lector de pantalla empieza ahí.
 * - Tab no se escapa: del último vuelve al primero (si no, seguiría por la pantalla de atrás,
 *   que está tapada y no se ve).
 * - Escape, "Cerrar menú" o tocar fuera lo cierran, y el foco vuelve al botón "Menú": sin eso,
 *   quedaría en ningún lado y el próximo Tab empezaría desde el principio de la página.
 * - Elegir un destino navega y lo cierra.
 *
 * Desde SPEC-KRILINXI-066, en un celular el botón es más bajo (44px) y de letra más chica, para el renglón único de la cabecera.
 *
 * En pantalla ancha no se muestra (`lg:hidden`): ahí el menú es la barra lateral.
 */
export function MenuCompacto({ destinos }: { destinos: readonly DestinoMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const cajon = useRef<HTMLDivElement>(null);
  const id = useId();

  function cerrar() {
    setAbierto(false);
    boton.current?.focus();
  }

  useEffect(() => {
    if (!abierto) return;
    cajon.current?.querySelector<HTMLElement>('a[href]')?.focus();
    const alPresionar = (evento: globalThis.KeyboardEvent) => {
      if (evento.key === 'Escape') cerrar();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [abierto]);

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
    <div className="lg:hidden">
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-borde bg-superficie px-3 text-base font-semibold text-texto sm:min-h-14 sm:gap-2 sm:px-4 sm:text-xl focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
      >
        <Icono nombre="menu" />
        Menú
      </button>
      {abierto && (
        <div
          className="fixed inset-0 z-40 bg-texto/60"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) cerrar();
          }}
        >
          <div
            ref={cajon}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            onKeyDown={atraparTab}
            className="flex h-full w-80 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-superficie p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xl font-bold text-texto">Menú</p>
              <button
                type="button"
                onClick={cerrar}
                className="inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-borde px-4 text-lg font-semibold text-texto focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
              >
                <Icono nombre="cerrar" />
                Cerrar menú
              </button>
            </div>
            <MenuPrincipal destinos={destinos} onElegir={() => setAbierto(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
