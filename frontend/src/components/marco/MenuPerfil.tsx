import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Avatar } from './Avatar';

type Props = {
  /** Nombre completo de quien atiende: el avatar lo lleva en su nombre accesible. */
  nombre: string;
  /** Lo que se esconde tras el avatar en un celular: el tema, "Dejar de atender" y Salir. */
  children: ReactNode;
};

/**
 * Quién atiende, y lo que se hace con su sesión — SPEC-KRILINXI-066.
 *
 * Desde `sm` (640px) todo está a la vista en la cabecera, como siempre: el tema, "Dejar de atender", el círculo con la
 * inicial y Salir, en ese orden. En un celular no entran en un renglón, así que se esconden tras el círculo, que pasa a
 * ser un botón ("Opciones de Rosa Quispe") y abre un panel debajo de la cabecera.
 *
 * Los hijos existen una sola vez en el DOM: lo que cambia entre celular y pantalla ancha es solo qué clase los esconde
 * (`hidden` / `sm:contents`). Por eso un lector de pantalla no los oye repetidos y los tests (jsdom no aplica el CSS) los
 * ven siempre. El panel se porta como un menú pequeño: al abrir, el foco va a su primer botón; Escape o tocar fuera lo
 * cierran y el foco vuelve al círculo; cambiar de pantalla (p. ej. "Dejar de atender" lleva al Inicio) también lo cierra.
 * No se cierra al tocar Salir: su confirmación vive dentro del panel y se taparía con él.
 *
 * Es la tercera excepción a "un ícono nunca va solo" (junto al tema y la flecha de volver): el círculo con la inicial no
 * lleva texto visible, y su nombre va en `aria-label`.
 */
export function MenuPerfil({ nombre, children }: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const { pathname } = useLocation();

  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return;
    panel.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    function alTocarFuera(evento: PointerEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return;
      setAbierto(false);
      boton.current?.focus();
    }
    document.addEventListener('pointerdown', alTocarFuera);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('pointerdown', alTocarFuera);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative sm:contents">
      <button
        ref={boton}
        type="button"
        aria-label={`Opciones de ${nombre}`}
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((a) => !a)}
        className="inline-flex shrink-0 items-center justify-center rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco sm:hidden"
      >
        <Avatar nombre={nombre} decorativo />
      </button>
      <div
        ref={panel}
        id={id}
        className={`${abierto ? 'flex' : 'hidden'} absolute right-0 top-full z-40 mt-2 w-64 flex-col items-stretch gap-2 rounded-xl border-2 border-borde-suave bg-superficie p-3 shadow-md sm:contents`}
      >
        {children}
      </div>
    </div>
  );
}
