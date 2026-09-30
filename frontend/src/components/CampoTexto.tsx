import { useId, type InputHTMLAttributes } from 'react';

type AtributosInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'className'>;

type Props = AtributosInput & {
  /** Siempre visible encima del campo. Un placeholder no sirve: desaparece al escribir. */
  etiqueta: string;
  value: string;
  /** Recibe el texto ya extraído del evento: quien usa el campo no toca el DOM. */
  onChange: (valor: string) => void;
  /** Qué está mal y qué hacer: "Escribí el teléfono del cliente." */
  error?: string;
};

/**
 * Un campo del mostrador: etiqueta arriba, input grande y, debajo, su error.
 *
 * El error queda enlazado al input con `aria-describedby`: un lector de pantalla lo lee al
 * entrar en el campo, y los tests lo encuentran igual que lo encontraría una persona.
 * El resto de atributos (`inputMode`, `autoComplete`, `required`…) pasan tal cual al input.
 */
export function CampoTexto({ etiqueta, value, onChange, error, ...resto }: Props) {
  const id = useId();
  const idError = `${id}-error`;

  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-xl font-semibold text-slate-900">
        {etiqueta}
      </label>
      <input
        {...resto}
        id={id}
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={`mt-2 min-h-14 w-full rounded-lg border-2 px-4 text-xl ${error ? 'border-red-700' : 'border-slate-400'}`}
      />
      {error && (
        <p id={idError} className="mt-2 text-lg text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
