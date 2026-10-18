import { useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { validarFechas, type Filtro } from '../periodo';
import type { SucursalElegible } from '../types';

type Props = {
  filtro: Filtro;
  sucursales: SucursalElegible[];
  alCambiar: (filtro: Filtro) => void;
};

/**
 * Qué mirar: unas fechas y una sucursal. La sucursal se aplica al elegirla; las fechas, con
 * "Ver estas fechas", para no pedir el panel a cada número que se escribe.
 */
export function FiltroPanel({ filtro, sucursales, alCambiar }: Props) {
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

  function volverAHoy() {
    setDesde('');
    setHasta('');
    setError(undefined);
    alCambiar({ ...filtro, fechas: null });
  }

  return (
    <form onSubmit={verFechas} noValidate aria-label="Qué mirar" className="mt-6 grid gap-2 rounded-2xl border border-borde-suave bg-superficie p-5 shadow-sm">
      <fieldset>
        <legend className="text-xl font-semibold text-texto">Sucursal</legend>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {[{ id: null, nombre: 'Todas' }, ...sucursales].map(({ id, nombre }) => (
            <label
              key={id ?? 'todas'}
              className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
                filtro.sucursalId === id ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
              }`}
            >
              <input
                type="radio"
                name="sucursal"
                className="size-6"
                checked={filtro.sucursalId === id}
                onChange={() => alCambiar({ ...filtro, sucursalId: id })}
              />
              {nombre}
            </label>
          ))}
        </div>
      </fieldset>
      <CampoTexto etiqueta="Desde" type="date" value={desde} onChange={setDesde} error={error} />
      <CampoTexto etiqueta="Hasta" type="date" value={hasta} onChange={setHasta} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Boton type="submit">Ver estas fechas</Boton>
        <Boton variante="secundario" onClick={volverAHoy} disabled={filtro.fechas === null}>
          Volver a hoy
        </Boton>
      </div>
    </form>
  );
}
