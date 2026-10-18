import { Icono } from '../iconos';

type Props = {
  tema: 'claro' | 'oscuro';
  alCambiar: () => void;
};

/**
 * Claro u oscuro, en la cabecera — SPEC-KRILINXI-030. Discreto: un ícono redondo con el tema al
 * que pasa (la luna en claro, el sol en oscuro), sin texto visible. Es la excepción a "un ícono
 * nunca va solo" (`iconos.tsx`): el nombre va en `aria-label` para el lector de pantalla y en
 * `title` para quien pasa el mouse. Solo recibe props: quién decide y dónde se guarda es de
 * `useTema` (CLAUDE.md §5).
 *
 * 48px de lado: chico a la vista, pero se puede tocar con el dedo.
 */
export function BotonTema({ tema, alCambiar }: Props) {
  const nombre = tema === 'oscuro' ? 'Tema claro' : 'Tema oscuro';
  return (
    <button
      type="button"
      onClick={alCambiar}
      aria-label={nombre}
      title={nombre}
      className="inline-flex size-12 items-center justify-center rounded-full text-texto-suave transition-colors hover:bg-fondo hover:text-texto focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      <Icono nombre={tema === 'oscuro' ? 'sol' : 'luna'} />
    </button>
  );
}
