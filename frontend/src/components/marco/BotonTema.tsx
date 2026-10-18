import { Boton } from '../Boton';

type Props = {
  tema: 'claro' | 'oscuro';
  alCambiar: () => void;
};

/**
 * Claro u oscuro, en la cabecera — SPEC-KRILINXI-030. Dice en palabras a qué tema pasa ("Tema
 * oscuro"), no un sol o una luna sueltos que haya que interpretar (CLAUDE.md §9). Solo recibe
 * props: quién decide y dónde se guarda es de `useTema` (CLAUDE.md §5).
 */
export function BotonTema({ tema, alCambiar }: Props) {
  return (
    <div className="w-auto">
      <Boton variante="secundario" onClick={alCambiar}>
        {tema === 'oscuro' ? 'Tema claro' : 'Tema oscuro'}
      </Boton>
    </div>
  );
}
