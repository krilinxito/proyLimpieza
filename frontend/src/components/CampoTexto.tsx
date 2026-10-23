import {
  useId,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Icono } from './iconos';

type AtributosInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'className'>;
type AtributosTextarea = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value' | 'onChange' | 'className' | 'rows'>;

/** Lo que tienen en común el campo de una línea y el de varias: lo que se escribe y cómo se avisa. */
type Comun = {
  /** Siempre visible encima del campo. Un placeholder no sirve: desaparece al escribir. */
  etiqueta: string;
  value: string;
  /** Recibe el texto ya extraído del evento: quien usa el campo no toca el DOM. */
  onChange: (valor: string) => void;
  /** Qué está mal y qué hacer: "Escribe el teléfono del cliente." */
  error?: string;
  /**
   * Lo escrito ya está bien (SPEC-KRILINXI-058): un visto a la derecha del campo y, para el lector de pantalla, el texto
   * "Correcto". Quien usa el campo decide cuándo (con las mismas reglas que el guardado); un error tiene prioridad.
   */
  correcto?: boolean;
};

type Props = Comun & AtributosInput;
type PropsDeVariasLineas = Comun & AtributosTextarea;

/** Las clases del borde y del relleno: el mismo aspecto para el campo de una línea y el de varias. */
function clasesDelCampo(error: boolean, correcto: boolean): string {
  return `mt-2 w-full rounded-xl border-2 bg-superficie px-4 text-xl text-texto placeholder:text-texto-suave focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco ${
    error ? 'border-peligro' : 'border-borde'
  } ${correcto ? 'pr-12' : ''}`;
}

/**
 * El marco de cualquier campo: la etiqueta arriba, el campo (que llega como `children`), el visto si está bien y,
 * debajo, el error. `describedBy` enlaza el campo con lo que lo explica, para el lector de pantalla.
 */
function MarcoDelCampo({
  id,
  etiqueta,
  error,
  correcto,
  alto,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  correcto: boolean;
  /** Dónde cae el visto: centrado en un campo de una línea, arriba en uno de varias. */
  alto: 'centro' | 'arriba';
  children: ReactNode;
}) {
  const idError = `${id}-error`;
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-xl font-semibold text-texto">
        {etiqueta}
      </label>
      <div className="relative">
        {children}
        {/* El visto es un ícono: el nombre de lo que dice va en texto (sr-only), enlazado al campo con aria-describedby. */}
        {correcto && (
          <span
            className={`pointer-events-none absolute right-4 text-exito-texto ${alto === 'centro' ? 'top-1/2 mt-1 -translate-y-1/2' : 'top-5'}`}
          >
            <Icono nombre="listo" />
            <span id={`${id}-correcto`} className="sr-only">
              Correcto
            </span>
          </span>
        )}
      </div>
      {/* El ícono acompaña, no reemplaza: el error se lee igual sin distinguir el rojo. */}
      {error && (
        <p id={idError} className="mt-2 flex items-start gap-2 text-lg font-semibold text-peligro-texto">
          <Icono nombre="alerta" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/** A qué apunta `aria-describedby`: el error, o el "Correcto"; nada si el campo no tiene ninguno. */
function descripcionDe(id: string, error: string | undefined, correcto: boolean): string | undefined {
  if (error) return `${id}-error`;
  return correcto ? `${id}-correcto` : undefined;
}

/**
 * Un campo del mostrador: etiqueta arriba, input grande y, debajo, su error.
 *
 * El error queda enlazado al input con `aria-describedby`: un lector de pantalla lo lee al
 * entrar en el campo, y los tests lo encuentran igual que lo encontraría una persona.
 * El resto de atributos (`inputMode`, `autoComplete`, `required`…) pasan tal cual al input.
 *
 * Con `correcto` muestra un visto a la derecha (SPEC-KRILINXI-058), nunca solo con color: lleva el ícono y el texto
 * "Correcto" para el lector de pantalla.
 */
export function CampoTexto({ etiqueta, value, onChange, error, correcto = false, ...resto }: Props) {
  const id = useId();
  const bien = correcto && !error;

  return (
    <MarcoDelCampo id={id} etiqueta={etiqueta} error={error} correcto={bien} alto="centro">
      <input
        {...resto}
        id={id}
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcionDe(id, error, bien)}
        className={`min-h-14 ${clasesDelCampo(Boolean(error), bien)}`}
      />
    </MarcoDelCampo>
  );
}

/**
 * Un campo de varias líneas — SPEC-KRILINXI-058, para lo que se escribe en renglones ("Qué deja": una boleta suele
 * listar varias prendas). Se ve igual que `CampoTexto` y comparte todo lo demás (etiqueta, error, visto), pero Enter
 * pone un salto de línea en vez de enviar el formulario, y **crece con lo escrito** en vez de esconderlo detrás de una
 * barra: al menos dos renglones, y uno más por cada línea que se agrega.
 *
 * El alto se ajusta desde el código (`style.height` sobre el elemento), no con un `style={…}` en el marcado: lo segundo
 * lo bloquea la política de seguridad del contenido en la app compilada (CLAUDE.md §4), lo primero no.
 */
export function CampoTextoLargo({ etiqueta, value, onChange, error, correcto = false, ...resto }: PropsDeVariasLineas) {
  const id = useId();
  const bien = correcto && !error;
  const area = useRef<HTMLTextAreaElement>(null);

  // Primero se suelta el alto para que pueda achicarse al borrar, y después se pone el que pide el texto.
  useLayoutEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    elemento.style.height = 'auto';
    elemento.style.height = `${elemento.scrollHeight}px`;
  }, [value]);

  return (
    <MarcoDelCampo id={id} etiqueta={etiqueta} error={error} correcto={bien} alto="arriba">
      <textarea
        {...resto}
        ref={area}
        id={id}
        rows={2}
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcionDe(id, error, bien)}
        className={`min-h-24 resize-none overflow-hidden py-3 ${clasesDelCampo(Boolean(error), bien)}`}
      />
    </MarcoDelCampo>
  );
}
