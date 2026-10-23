import { Icono } from './iconos';

type Props = {
  /** Lo que dice para el lector de pantalla y al pasar el mouse: "Volver al mostrador". */
  nombre: string;
  alTocar: () => void;
};

/**
 * Una flechita para volver atrás, arriba a la izquierda — SPEC-KRILINXI-057. Es para salir de una pantalla que
 * abrió una vista adentro (la ficha de un cliente, registrar ropa): estar arriba evita bajar toda la página para
 * volver, y como es solo una flecha ocupa poco.
 *
 * Es la segunda excepción a "un ícono nunca va solo" (`iconos.tsx`, la primera es el tema): una flecha hacia atrás se
 * entiende sin texto. El nombre va en `aria-label` para el lector de pantalla y en `title` para quien pasa el mouse.
 * Lleva borde para que se vea que es un botón, y mide 48px de lado: chico a la vista, pero se toca con el dedo.
 */
export function BotonAtras({ nombre, alTocar }: Props) {
  return (
    <button
      type="button"
      onClick={alTocar}
      aria-label={nombre}
      title={nombre}
      className="inline-flex size-12 items-center justify-center rounded-full border-2 border-borde bg-superficie text-texto transition-colors hover:bg-fondo focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      <Icono nombre="volver" />
    </button>
  );
}
