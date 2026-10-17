import { useId } from 'react';
import { METODOS_PAGO, TEXTO_METODO_PAGO, type MetodoPago } from '../../../lib/dominio';

type Props = {
  value: MetodoPago | null;
  onChange: (metodo: MetodoPago) => void;
  error?: string;
  /** Lo que se pregunta arriba de las opciones. */
  pregunta?: string;
};

/**
 * Cómo paga: cuatro opciones grandes, todas a la vista. Un desplegable obliga a abrirlo
 * para saber qué hay adentro, y en el mostrador eso es un paso de más (CLAUDE.md §9).
 */
export function ElegirMetodo({ value, onChange, error, pregunta = '¿Cómo paga el adelanto?' }: Props) {
  // Un nombre propio por grupo: si hubiera dos en pantalla, no se pisarían las opciones.
  const grupo = useId();
  return (
    <fieldset className="mt-4" aria-describedby={error ? `${grupo}-error` : undefined}>
      <legend className="text-xl font-semibold text-texto">{pregunta}</legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {METODOS_PAGO.map((metodo) => (
          <label
            key={metodo}
            className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
              value === metodo ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
            }`}
          >
            <input
              type="radio"
              name={grupo}
              className="size-6"
              checked={value === metodo}
              onChange={() => onChange(metodo)}
            />
            {TEXTO_METODO_PAGO[metodo]}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${grupo}-error`} className="mt-2 text-lg font-semibold text-peligro-texto">
          {error}
        </p>
      )}
    </fieldset>
  );
}
