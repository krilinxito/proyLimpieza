import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { validarFechas } from '../../estadisticas/periodo';
import { QUE_BUSCAR } from '../describir';
import type { FiltroAuditoria as Filtro } from '../filtro';

type Opcion = { id: string; nombre: string };

/** Una lista de opciones grandes con "Todas" al principio. */
function Elegir({
  pregunta,
  opciones,
  valor,
  alElegir,
  todas = 'Todas',
}: {
  pregunta: string;
  opciones: Opcion[];
  valor: string | null;
  alElegir: (valor: string | null) => void;
  todas?: string;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-xl font-semibold text-slate-900">{pregunta}</legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {[{ id: null, nombre: todas }, ...opciones].map(({ id, nombre }) => (
          <label
            key={id ?? 'todas'}
            className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
              valor === id ? 'border-sky-700 bg-sky-50' : 'border-slate-400 bg-white'
            }`}
          >
            <input type="radio" name={pregunta} className="size-6" checked={valor === id} onChange={() => alElegir(id)} />
            {nombre}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Props = { filtro: Filtro; personas: Opcion[]; sucursales: Opcion[]; alCambiar: (filtro: Filtro) => void };

/**
 * Qué mirar. "Solo lo que hay que revisar" va arriba y a la vista; el resto, dentro de "Buscar
 * con más detalle", para que la pantalla no arranque con cinco preguntas (CLAUDE.md §9). Las
 * opciones se aplican al elegirlas; las fechas, con un botón.
 */
export function FiltroAuditoria({ filtro, personas, sucursales, alCambiar }: Props) {
  const [desde, setDesde] = useState(filtro.fechas?.desde ?? '');
  const [hasta, setHasta] = useState(filtro.fechas?.hasta ?? '');
  const [error, setError] = useState<string | undefined>();

  function verFechas(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const fechas = validarFechas(desde, hasta);
    if ('error' in fechas) {
      setError(fechas.error);
      return;
    }
    setError(undefined);
    alCambiar({ ...filtro, fechas });
  }

  return (
    <form onSubmit={verFechas} noValidate aria-label="Qué mirar" className="mt-6 grid gap-2 rounded-lg border-2 border-slate-300 p-4">
      <label className="flex min-h-14 items-center gap-3 text-xl font-semibold text-slate-900">
        <input
          type="checkbox"
          className="size-6"
          checked={filtro.soloParaRevisar}
          onChange={(e) => alCambiar({ ...filtro, soloParaRevisar: e.target.checked })}
        />
        Solo lo que hay que revisar
      </label>
      <details>
        <summary className="min-h-14 cursor-pointer py-3 text-xl font-semibold text-sky-700">Buscar con más detalle</summary>
        <Elegir
          pregunta="¿Qué buscar?"
          opciones={QUE_BUSCAR.map((q) => ({ id: q.clave, nombre: q.texto }))}
          valor={filtro.que}
          alElegir={(que) => alCambiar({ ...filtro, que })}
          todas="Todo"
        />
        <Elegir pregunta="¿Quién?" opciones={personas} valor={filtro.usuarioId} alElegir={(usuarioId) => alCambiar({ ...filtro, usuarioId })} todas="Todos" />
        <Elegir pregunta="¿En qué sucursal?" opciones={sucursales} valor={filtro.sucursalId} alElegir={(sucursalId) => alCambiar({ ...filtro, sucursalId })} />
        <CampoTexto etiqueta="Desde" type="date" value={desde} onChange={setDesde} error={error} />
        <CampoTexto etiqueta="Hasta" type="date" value={hasta} onChange={setHasta} />
        <div className="mt-4">
          <Boton type="submit">Ver estas fechas</Boton>
        </div>
      </details>
    </form>
  );
}
