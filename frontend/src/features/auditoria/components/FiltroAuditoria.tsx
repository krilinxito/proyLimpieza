import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { BuscadorVivo } from '../../../components/BuscadorVivo';
import { CampoTexto } from '../../../components/CampoTexto';
import type { ResultadosDeBusqueda } from '../../../lib/texto';
import type { Cliente } from '../../clientes/types';
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
      <legend className="text-xl font-semibold text-texto">{pregunta}</legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {[{ id: null, nombre: todas }, ...opciones].map(({ id, nombre }) => (
          <label
            key={id ?? 'todas'}
            className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
              valor === id ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
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

/**
 * "¿De qué cliente?" — SPEC-KRILINXI-062. Se busca con el buscador de siempre, sobre la base local (los clientes bajan
 * enteros a la tablet del admin); al elegir, queda su nombre y un botón para quitarlo.
 */
function ElegirCliente({
  cliente,
  buscar,
  alCambiar,
}: {
  cliente: Filtro['cliente'];
  buscar: Props['buscarClientes'];
  alCambiar: (cliente: Filtro['cliente']) => void;
}) {
  if (cliente) {
    return (
      <div className="mt-4">
        <p className="text-xl font-semibold text-texto">¿De qué cliente?</p>
        <p className="mt-2 text-xl text-texto">{cliente.nombre}</p>
        <div className="mt-2">
          <Boton variante="secundario" tamano="compacto" onClick={() => alCambiar(null)}>
            Quitar el cliente
          </Boton>
        </div>
      </div>
    );
  }
  return (
    <BuscadorVivo<Cliente>
      etiqueta="¿De qué cliente? Busca por nombre, teléfono o carnet"
      buscar={buscar}
      claveDe={(c) => c.id}
      mostrar={(c) => (
        <span className="grid">
          <span className="font-semibold">{c.nombre}</span>
          <span className="text-lg text-texto-suave">Tel. {c.telefono}</span>
        </span>
      )}
      alElegir={(c) => alCambiar({ id: c.id, nombre: c.nombre })}
      sinResultados="Ningún cliente coincide con eso."
    />
  );
}

type Props = {
  filtro: Filtro;
  personas: Opcion[];
  sucursales: Opcion[];
  /** Busca clientes en la base local, mientras se escribe (SPEC-KRILINXI-062). */
  buscarClientes: (texto: string) => Promise<ResultadosDeBusqueda<Cliente>>;
  alCambiar: (filtro: Filtro) => void;
};

/**
 * Qué mirar. "Solo lo que hay que revisar" va arriba y a la vista; el resto, dentro de "Buscar
 * con más detalle", para que la pantalla no arranque con cinco preguntas (CLAUDE.md §9). Las
 * opciones se aplican al elegirlas; las fechas, con un botón.
 */
export function FiltroAuditoria({ filtro, personas, sucursales, buscarClientes, alCambiar }: Props) {
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
    <form onSubmit={verFechas} noValidate aria-label="Qué mirar" className="mt-6 grid gap-2 rounded-2xl border border-borde-suave bg-superficie p-5 shadow-sm">
      <label className="flex min-h-14 items-center gap-3 text-xl font-semibold text-texto">
        <input
          type="checkbox"
          className="size-6"
          checked={filtro.soloParaRevisar}
          onChange={(e) => alCambiar({ ...filtro, soloParaRevisar: e.target.checked })}
        />
        Solo lo que hay que revisar
      </label>
      <details>
        <summary className="min-h-14 cursor-pointer py-3 text-xl font-semibold text-marca">Buscar con más detalle</summary>
        <Elegir
          pregunta="¿Qué buscar?"
          opciones={QUE_BUSCAR.map((q) => ({ id: q.clave, nombre: q.texto }))}
          valor={filtro.que}
          alElegir={(que) => alCambiar({ ...filtro, que })}
          todas="Todo"
        />
        <Elegir pregunta="¿Quién?" opciones={personas} valor={filtro.usuarioId} alElegir={(usuarioId) => alCambiar({ ...filtro, usuarioId })} todas="Todos" />
        <Elegir pregunta="¿En qué sucursal?" opciones={sucursales} valor={filtro.sucursalId} alElegir={(sucursalId) => alCambiar({ ...filtro, sucursalId })} />
        <ElegirCliente cliente={filtro.cliente} buscar={buscarClientes} alCambiar={(cliente) => alCambiar({ ...filtro, cliente })} />
        <CampoTexto etiqueta="Desde" type="date" value={desde} onChange={setDesde} error={error} />
        <CampoTexto etiqueta="Hasta" type="date" value={hasta} onChange={setHasta} />
        <div className="mt-4">
          <Boton type="submit">Ver estas fechas</Boton>
        </div>
      </details>
    </form>
  );
}
