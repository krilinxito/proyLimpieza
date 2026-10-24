import { useId } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { fechaParaLeer } from '../periodo';
import type { useRangoDeDias } from '../hooks/useRangoDeDias';

const CAMPO =
  'mt-2 min-h-12 w-full rounded-xl border-2 border-borde bg-superficie px-3 text-lg text-texto focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco';

/**
 * "Acercar a unos días" — SPEC-KRILINXI-065: dos listas, "Desde" y "Hasta", con los días **ya cargados** del gráfico, y
 * un botón para volver a ver todos. Solo se dibuja en la vista grande. Con las fechas al revés lo dice en palabras y el
 * gráfico no cambia (`useRangoDeDias` solo aplica un rango con sentido). Son `<select>` nativos: se manejan bien con el
 * teclado y con el dedo, y en el celular abren su propio selector.
 */
export function RangoDeDias({ fechas, rango }: { fechas: readonly string[]; rango: ReturnType<typeof useRangoDeDias> }) {
  const id = useId();
  return (
    <fieldset className="mt-4">
      <legend className="text-xl font-semibold text-texto">Acercar a unos días</legend>
      <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-desde`} className="text-lg text-texto">
            Desde
          </label>
          <select id={`${id}-desde`} className={CAMPO} value={rango.elegido.desde} onChange={(e) => rango.cambiarDesde(e.target.value)}>
            {fechas.map((f) => (
              <option key={f} value={f}>
                {fechaParaLeer(f)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-hasta`} className="text-lg text-texto">
            Hasta
          </label>
          <select id={`${id}-hasta`} className={CAMPO} value={rango.elegido.hasta} onChange={(e) => rango.cambiarHasta(e.target.value)}>
            {fechas.map((f) => (
              <option key={f} value={f}>
                {fechaParaLeer(f)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {rango.invalido && (
        <div className="mt-3">
          <Aviso tipo="advertencia">
            <p>El día de inicio es posterior al día final. Revisa las fechas.</p>
          </Aviso>
        </div>
      )}
      <div className="mt-3">
        <Boton variante="secundario" tamano="compacto" disabled={rango.verTodo} onClick={rango.verTodos}>
          Ver todos los días
        </Boton>
      </div>
    </fieldset>
  );
}
