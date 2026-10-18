import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { alcanzaParaBuscar, type ResultadosDeBusqueda } from '../lib/texto';
import { Aviso } from './Aviso';
import { Icono, type NombreIcono } from './iconos';

const NO_SE_PUDO_BUSCAR = 'No se pudo buscar. Probá de nuevo y, si sigue pasando, avisale al encargado.';
const HAY_MAS = 'Hay más resultados: escribí un poco más.';

type Props<T> = {
  /** Lo que dice arriba del campo, y el nombre del campo para el lector de pantalla. */
  etiqueta: string;
  /** Busca lo escrito. Llega solo cuando alcanza (2 letras o 3 dígitos), y con la demora ya esperada. */
  buscar: (texto: string) => Promise<ResultadosDeBusqueda<T>>;
  /** La clave de cada resultado, para React. */
  claveDe: (resultado: T) => string;
  /** Lo que muestra la tarjeta de cada resultado. Es también su nombre para el lector de pantalla. */
  mostrar: (resultado: T) => ReactNode;
  alElegir: (resultado: T) => void;
  /**
   * Una acción fija al final, siempre visible, haya resultados o no ("Cliente nuevo"). Recibe lo
   * escrito, para no tener que volver a tipearlo.
   */
  accion?: { texto: string; alElegir: (escrito: string) => void; icono?: NombreIcono };
  /** Qué decir cuando nada coincide: "Ningún cliente coincide con eso." */
  sinResultados: string;
  /** Cuánto esperar después de la última tecla antes de buscar. */
  demoraMs?: number;
  /** Mientras la base local se abre, no se puede buscar. */
  deshabilitado?: boolean;
};

type Estado<T> =
  | { tipo: 'esperando' }
  | { tipo: 'listo'; resultados: T[]; hayMas: boolean }
  | { tipo: 'error' };

/**
 * Buscar mientras se escribe — SPEC-KRILINXI-032. Un campo grande y, debajo, hasta 6 resultados
 * como tarjetas que se tocan, con una acción fija al final. No es un `<select>`: con miles de
 * clientes, una lista desplegable no se puede recorrer.
 *
 * Sigue el patrón *combobox* de ARIA, así se usa igual con el dedo, con el teclado y con un lector
 * de pantalla:
 *  - el campo es `role="combobox"` y controla la lista (`role="listbox"`, cada tarjeta `option`);
 *  - las flechas mueven la opción activa sin sacar el foco del campo (`aria-activedescendant`),
 *    Enter la elige y Escape borra lo escrito;
 *  - cuántos resultados hay se anuncia aparte, en una región viva que no interrumpe.
 *
 * Una respuesta vieja nunca pisa a la nueva: cada búsqueda se descarta si, mientras volvía, se
 * escribió otra cosa (el mismo cuidado que SPEC-KRILINXI-019 le puso a "Ropa en el local").
 */
export function BuscadorVivo<T>({
  etiqueta,
  buscar,
  claveDe,
  mostrar,
  alElegir,
  accion,
  sinResultados,
  demoraMs = 300,
  deshabilitado = false,
}: Props<T>) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<Estado<T>>({ tipo: 'esperando' });
  const [activo, setActivo] = useState(-1);

  // La función de buscar puede ser nueva en cada render de la pantalla. Si fuera dependencia del
  // efecto, cada resultado (que provoca un render) dispararía otra búsqueda, sin fin. Con una ref,
  // el efecto usa siempre la última, y solo vuelve a correr cuando cambia lo escrito.
  const buscarActual = useRef(buscar);
  buscarActual.current = buscar;

  const alcanza = alcanzaParaBuscar(texto);

  useEffect(() => {
    setActivo(-1);
    if (!alcanza || deshabilitado) {
      setEstado({ tipo: 'esperando' });
      return;
    }
    let vigente = true;
    const espera = setTimeout(() => {
      buscarActual
        .current(texto)
        .then((encontrado) => vigente && setEstado({ tipo: 'listo', ...encontrado }))
        .catch((error: unknown) => {
          console.error('No se pudo buscar.', error);
          if (vigente) setEstado({ tipo: 'error' });
        });
    }, demoraMs);
    // Al escribir otra letra: si todavía no buscó, no busca; si ya buscó, su respuesta se descarta.
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto, alcanza, demoraMs, deshabilitado]);

  const resultados = estado.tipo === 'listo' ? estado.resultados : [];
  const total = resultados.length + (accion ? 1 : 0);
  const idOpcion = (i: number) => `${id}-opcion-${i}`;

  function elegir(indice: number) {
    const resultado = resultados[indice];
    if (resultado !== undefined) alElegir(resultado);
    else if (accion && indice === resultados.length) accion.alElegir(texto.trim());
  }

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown' && total > 0) {
      evento.preventDefault();
      setActivo((a) => Math.min(a + 1, total - 1));
    } else if (evento.key === 'ArrowUp' && total > 0) {
      evento.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (evento.key === 'Enter' && activo >= 0) {
      evento.preventDefault();
      elegir(activo);
    } else if (evento.key === 'Escape') {
      setTexto('');
    }
  }

  const anuncio =
    estado.tipo !== 'listo'
      ? ''
      : resultados.length === 0
        ? sinResultados
        : `${resultados.length === 1 ? '1 resultado' : `${resultados.length} resultados`}${estado.hayMas ? '. ' + HAY_MAS : '.'}`;

  return (
    <div className="mt-4">
      <label htmlFor={`${id}-campo`} className="block text-xl font-semibold text-texto">
        {etiqueta}
      </label>
      <input
        id={`${id}-campo`}
        role="combobox"
        aria-expanded={total > 0}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={activo >= 0 ? idOpcion(activo) : undefined}
        autoComplete="off"
        value={texto}
        disabled={deshabilitado}
        onChange={(evento) => setTexto(evento.target.value)}
        onKeyDown={alTeclear}
        className="mt-2 min-h-14 w-full rounded-xl border-2 border-borde bg-superficie px-4 text-xl text-texto focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:border-dashed disabled:opacity-60"
      />

      <p role="status" className="sr-only">
        {anuncio}
      </p>

      {estado.tipo === 'error' && (
        <div className="mt-3">
          <Aviso tipo="error">{NO_SE_PUDO_BUSCAR}</Aviso>
        </div>
      )}
      {estado.tipo === 'listo' && resultados.length === 0 && (
        <p className="mt-3 text-xl text-texto-suave">{sinResultados}</p>
      )}

      <ul id={`${id}-lista`} role="listbox" aria-label={etiqueta} className="mt-3 grid gap-2">
        {resultados.map((resultado, i) => (
          <li
            key={claveDe(resultado)}
            id={idOpcion(i)}
            role="option"
            aria-selected={i === activo}
            onClick={() => elegir(i)}
            className={`flex min-h-16 cursor-pointer items-center rounded-xl border-2 px-4 py-3 text-xl text-texto transition-colors hover:border-marca ${
              i === activo ? 'border-marca bg-marca-suave' : 'border-borde-suave bg-superficie'
            }`}
          >
            {mostrar(resultado)}
          </li>
        ))}
        {accion && (
          <li
            id={idOpcion(resultados.length)}
            role="option"
            aria-selected={activo === resultados.length}
            onClick={() => elegir(resultados.length)}
            className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-xl font-semibold text-marca transition-colors hover:border-marca ${
              activo === resultados.length ? 'border-marca bg-marca-suave' : 'border-borde bg-superficie'
            }`}
          >
            {accion.icono && <Icono nombre={accion.icono} />}
            {accion.texto}
          </li>
        )}
      </ul>

      {estado.tipo === 'listo' && estado.hayMas && <p className="mt-3 text-lg text-texto-suave">{HAY_MAS}</p>}
    </div>
  );
}
