import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Boton } from '../../../components/Boton';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { TEXTO_ESTADO_ORDEN, TEXTO_METODO_PAGO, TEXTO_TIPO_PAGO, type EstadoOrden } from '../../../lib/dominio';
import { formatearBs } from '../../../lib/money';
import { avancesDesde, estaCerrada } from '../estado';
import { useRopa } from '../hooks/useRopa';
import type { OrdenVista } from '../types';
import { diaDe, fechaCorta } from './fechas';
import { FormularioCobro } from './FormularioCobro';

type Props = {
  ordenId: string;
  alVolver: () => void;
  /**
   * Para que otra tarea agregue su acción al detalle, como entregar (SPEC-KRILINXI-009).
   * Recibe la orden y una función para volver a leerla después de cambiarla.
   */
  accionesExtra?: (orden: OrdenVista, recargar: () => Promise<void>) => ReactNode;
};

/**
 * Todo sobre una ropa: sus datos, lo que pagó y lo que se puede hacer con ella —
 * SPEC-KRILINXI-008. Solo ofrece lo que el estado permite: una cerrada no se toca.
 */
export function DetalleOrden({ ordenId, alVolver, accionesExtra }: Props) {
  const ropa = useRopa();
  const [orden, setOrden] = useState<OrdenVista | null | undefined>(undefined);
  const [cobrando, setCobrando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!ropa.lista) return;
    setOrden(await ropa.obtener(ordenId));
  }, [ropa, ordenId]);

  useEffect(() => {
    recargar().catch((error: unknown) => console.error('No se pudo leer la ropa.', error));
  }, [recargar]);

  if (orden === undefined) return <p className="mt-6 text-xl text-slate-700">Buscando…</p>;
  if (orden === null || !ropa.lista) {
    return (
      <>
        <p className="mt-6 text-xl text-slate-700">No se encontró esa boleta en esta sucursal.</p>
        <div className="mt-4">
          <Boton variante="secundario" onClick={alVolver}>
            Volver a la lista
          </Boton>
        </div>
      </>
    );
  }

  const cerrada = estaCerrada(orden.estado);

  async function pasarA(destino: EstadoOrden) {
    if (!ropa.lista || !orden) return;
    const resultado = await ropa.cambiarEstado(orden.id, destino);
    setAviso(resultado.tipo === 'hecho' ? null : resultado.mensaje);
    await recargar();
  }

  const datos: [string, string][] = [
    ['Cliente', `${orden.clienteNombre}${orden.clienteTelefono ? ` (${orden.clienteTelefono})` : ''}`],
    ['Ropa', orden.descripcion],
    ['Cómo va', TEXTO_ESTADO_ORDEN[orden.estado]],
    ['Entró', orden.fechaEntrada ? diaDe(orden.fechaEntrada) : '—'],
    ['Estará lista', orden.fechaEstimada ? fechaCorta(orden.fechaEstimada) : 'Sin fecha'],
    ['Precio', formatearBs(orden.precioTotal)],
    ...(orden.precioFinal !== null ? [['Precio al entregar', formatearBs(orden.precioFinal)] as [string, string]] : []),
    ['Pagó', formatearBs(orden.pagado)],
    ['Falta pagar', formatearBs(orden.saldo)],
  ];

  return (
    <section className="mt-6" aria-label={`Boleta ${orden.numeroBoleta}`}>
      <h2 className="text-2xl font-bold text-slate-900">Boleta {orden.numeroBoleta}</h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border-2 border-slate-300 bg-white p-4 text-xl">
        {datos.map(([dato, valor]) => (
          <div key={dato} className="contents">
            <dt className="font-semibold text-slate-700">{dato}</dt>
            <dd className="text-slate-900">{valor}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-xl font-bold text-slate-900">Pagos</h3>
      {orden.pagos.length === 0 ? (
        <p className="mt-2 text-xl text-slate-700">Todavía no pagó nada.</p>
      ) : (
        <ul className="mt-2 grid gap-2 text-xl" aria-label="Pagos">
          {orden.pagos.map((pago) => (
            <li key={pago.id} className="rounded-lg bg-slate-100 px-4 py-2">
              {TEXTO_TIPO_PAGO[pago.tipo]} — {TEXTO_METODO_PAGO[pago.metodo]} — {formatearBs(pago.monto)}
            </li>
          ))}
        </ul>
      )}

      {aviso && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-xl text-red-800">
          {aviso}
        </p>
      )}

      {cerrada && (
        <p className="mt-6 rounded-lg bg-slate-100 p-4 text-xl text-slate-800">
          {orden.estado === 'ANULADO'
            ? 'Esta ropa fue anulada: no se puede entregar ni cobrar.'
            : 'Esta ropa ya fue entregada.'}
        </p>
      )}

      {!cerrada && !cobrando && (
        <div className="mt-6 grid gap-3">
          {avancesDesde(orden.estado).map(({ destino, texto }) => (
            <Boton key={destino} onClick={() => pasarA(destino)}>
              {texto}
            </Boton>
          ))}
          {orden.saldo > 0 && (
            <Boton variante="secundario" onClick={() => setCobrando(true)}>
              Cobrar
            </Boton>
          )}
          {accionesExtra?.(orden, recargar)}
          <Boton variante="peligro" onClick={() => setAnulando(true)}>
            Anular
          </Boton>
        </div>
      )}

      {!cerrada && cobrando && (
        <FormularioCobro
          saldo={orden.saldo}
          cobrar={(datosCobro) => ropa.cobrar(orden.id, datosCobro)}
          alCobrar={() => {
            setCobrando(false);
            void recargar();
          }}
          alCancelar={() => setCobrando(false)}
        />
      )}

      <div className="mt-6">
        <Boton variante="secundario" onClick={alVolver}>
          Volver a la lista
        </Boton>
      </div>

      <ModalConfirmacion
        abierto={anulando}
        titulo={`¿Anular la boleta ${orden.numeroBoleta}?`}
        mensaje="Esta acción no se puede deshacer."
        textoConfirmar="Sí, anular"
        peligroso
        onConfirmar={async () => {
          await pasarA('ANULADO');
          setAnulando(false);
        }}
        onCancelar={() => setAnulando(false)}
      />
    </section>
  );
}
