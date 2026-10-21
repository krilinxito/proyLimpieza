import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { ESTADOS_ORDEN, TEXTO_ESTADO_ORDEN } from '../../../lib/dominio';
import { validarFechas } from '../../estadisticas/periodo';
import { hayFiltros, type FiltroHistorial } from '../filtro';

type Opcion<T extends string> = { id: T | null; nombre: string };

/** Una pregunta con opciones grandes y "Todas" al principio. Se aplica al elegir. */
function Elegir<T extends string>({
  pregunta,
  opciones,
  valor,
  alElegir,
}: {
  pregunta: string;
  opciones: Opcion<T>[];
  valor: T | null;
  alElegir: (valor: T | null) => void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-xl font-semibold text-texto">{pregunta}</legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {opciones.map(({ id, nombre }) => (
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

type Props = {
  filtro: FiltroHistorial;
  /** Solo el admin elige sucursal: sin esta lista no se pregunta. */
  sucursales?: { id: string; nombre: string }[];
  alCambiar: (filtro: FiltroHistorial) => void;
  /** Vuelve todo a como arranca (y la pantalla vuelve a montar este formulario, con las fechas vacías). */
  alLimpiar: () => void;
};

/**
 * Qué boletas mirar — SPEC-KRILINXI-041. El buscador y "con saldo pendiente" siempre a la vista;
 * el resto (estado, sucursal, fechas) dentro de "Buscar con más detalle", para que la pantalla no
 * arranque con cinco preguntas (CLAUDE.md §9). Lo escrito y lo elegido se aplica en el acto; las
 * fechas, con un botón. "Limpiar filtros" aparece en cuanto hay algo elegido, y lo deja todo en blanco.
 */
export function FiltroDelHistorial({ filtro, sucursales, alCambiar, alLimpiar }: Props) {
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
    <form
      onSubmit={verFechas}
      noValidate
      aria-label="Qué boletas mirar"
      className="mt-6 grid gap-2 rounded-2xl border border-borde-suave bg-superficie p-5 shadow-sm"
    >
      <CampoTexto
        etiqueta="Buscar por número de boleta, nombre o teléfono"
        type="search"
        autoComplete="off"
        value={filtro.texto}
        onChange={(texto) => alCambiar({ ...filtro, texto })}
      />
      <label className="flex min-h-14 items-center gap-3 text-xl font-semibold text-texto">
        <input
          type="checkbox"
          className="size-6"
          checked={filtro.conSaldo}
          onChange={(e) => alCambiar({ ...filtro, conSaldo: e.target.checked })}
        />
        Solo las que tienen saldo pendiente
      </label>
      <details>
        <summary className="min-h-14 cursor-pointer py-3 text-xl font-semibold text-marca">Buscar con más detalle</summary>
        <Elegir
          pregunta="¿Cómo va la ropa?"
          opciones={[{ id: null, nombre: 'Todas' }, ...ESTADOS_ORDEN.map((estado) => ({ id: estado, nombre: TEXTO_ESTADO_ORDEN[estado] }))]}
          valor={filtro.estado}
          alElegir={(estado) => alCambiar({ ...filtro, estado })}
        />
        {sucursales && (
          <Elegir
            pregunta="¿En qué sucursal?"
            opciones={[{ id: null, nombre: 'Todas' }, ...sucursales.map((s) => ({ id: s.id, nombre: s.nombre }))]}
            valor={filtro.sucursalId}
            alElegir={(sucursalId) => alCambiar({ ...filtro, sucursalId })}
          />
        )}
        <CampoTexto etiqueta="Desde" type="date" value={desde} onChange={setDesde} error={error} />
        <CampoTexto etiqueta="Hasta" type="date" value={hasta} onChange={setHasta} />
        <div className="mt-4">
          <Boton type="submit" variante="secundario">
            Ver estas fechas
          </Boton>
        </div>
      </details>
      {hayFiltros(filtro) && (
        <div className="mt-2">
          <Boton variante="secundario" tamano="compacto" icono="cerrar" onClick={alLimpiar}>
            Limpiar filtros
          </Boton>
        </div>
      )}
    </form>
  );
}
