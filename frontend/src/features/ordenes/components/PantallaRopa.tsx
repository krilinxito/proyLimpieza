import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { useRopa } from '../hooks/useRopa';
import type { OrdenVista } from '../types';
import { DetalleOrden } from './DetalleOrden';
import { TarjetaOrden } from './TarjetaOrden';

type Props = {
  /** Lo que se le agrega al detalle de cada ropa (SPEC-KRILINXI-009: entregar). */
  accionesExtra?: (orden: OrdenVista, recargar: () => Promise<void>) => ReactNode;
};

/**
 * La ropa de la sucursal: la que está en el local, o la que se busque por boleta o
 * teléfono, y el detalle de cada una — SPEC-KRILINXI-008. La usan /ropa y /cobrar.
 */
export function PantallaRopa({ accionesExtra }: Props = {}) {
  const ropa = useRopa();
  const [buscado, setBuscado] = useState('');
  // null: se muestra la ropa en el local. Un texto: los resultados de esa búsqueda.
  const [busqueda, setBusqueda] = useState<string | null>(null);
  const [ordenes, setOrdenes] = useState<OrdenVista[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!ropa.lista) return;
    setOrdenes(busqueda === null ? await ropa.abiertas() : await ropa.buscar(busqueda));
  }, [ropa, busqueda]);

  useEffect(() => {
    // Al volver del detalle también se recarga: algo pudo haber cambiado.
    if (abierta === null) cargar().catch((error: unknown) => console.error('No se pudo leer la ropa.', error));
  }, [cargar, abierta]);

  if (abierta !== null) {
    return <DetalleOrden ordenId={abierta} alVolver={() => setAbierta(null)} accionesExtra={accionesExtra} />;
  }

  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setBusqueda(buscado.trim() === '' ? null : buscado);
  }

  return (
    <div className="mt-6">
      <form onSubmit={buscar} noValidate aria-label="Buscar ropa" className="grid gap-2">
        <CampoTexto
          etiqueta="Número de boleta o teléfono del cliente"
          value={buscado}
          onChange={setBuscado}
          inputMode="numeric"
          autoComplete="off"
        />
        <div className="mt-2">
          <Boton type="submit" ocupado={!ropa.lista} textoOcupado="Preparando…">
            Buscar
          </Boton>
        </div>
      </form>

      <h2 className="mt-8 text-2xl font-bold text-slate-900">
        {busqueda === null ? 'Ropa en el local' : `Resultados para "${busqueda.trim()}"`}
      </h2>

      {ordenes === null && <p className="mt-4 text-xl text-slate-700">Buscando…</p>}
      {ordenes?.length === 0 && (
        <p className="mt-4 text-xl text-slate-700">
          {busqueda === null ? 'No hay ropa en el local.' : 'No se encontró ninguna boleta con ese número o teléfono.'}
        </p>
      )}
      {ordenes && ordenes.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {ordenes.map((orden) => (
            <li key={orden.id}>
              <TarjetaOrden orden={orden} alElegir={() => setAbierta(orden.id)} />
            </li>
          ))}
        </ul>
      )}

      {busqueda !== null && (
        <div className="mt-6">
          <Boton
            variante="secundario"
            onClick={() => {
              setBuscado('');
              setBusqueda(null);
            }}
          >
            Ver toda la ropa en el local
          </Boton>
        </div>
      )}
    </div>
  );
}
