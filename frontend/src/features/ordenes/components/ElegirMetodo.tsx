import { METODOS_PAGO, TEXTO_METODO_PAGO, type MetodoPago } from '../../../lib/dominio';

type Props = {
  value: MetodoPago | null;
  onChange: (metodo: MetodoPago) => void;
  error?: string;
};

/**
 * Cómo paga: cuatro opciones grandes, todas a la vista. Un desplegable obliga a abrirlo
 * para saber qué hay adentro, y en el mostrador eso es un paso de más (CLAUDE.md §9).
 */
export function ElegirMetodo({ value, onChange, error }: Props) {
  return (
    <fieldset className="mt-4" aria-describedby={error ? 'metodo-error' : undefined}>
      <legend className="text-xl font-semibold text-slate-900">¿Cómo paga el adelanto?</legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {METODOS_PAGO.map((metodo) => (
          <label
            key={metodo}
            className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
              value === metodo ? 'border-sky-700 bg-sky-50' : 'border-slate-400 bg-white'
            }`}
          >
            <input
              type="radio"
              name="metodo-adelanto"
              className="size-6"
              checked={value === metodo}
              onChange={() => onChange(metodo)}
            />
            {TEXTO_METODO_PAGO[metodo]}
          </label>
        ))}
      </div>
      {error && (
        <p id="metodo-error" className="mt-2 text-lg text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
