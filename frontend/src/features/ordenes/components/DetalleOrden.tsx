import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import type { NombreIcono } from '../../../components/iconos';
import { Insignia } from '../../../components/Insignia';
import { Tarjeta } from '../../../components/Tarjeta';
import { ModalConfirmacion } from '../../../components/ModalConfirmacion';
import { TEXTO_ESTADO_ORDEN, TEXTO_METODO_PAGO, TEXTO_TIPO_PAGO, type EstadoOrden } from '../../../lib/dominio';
import { formatearBs } from '../../../lib/money';
import { avancesDesde, estaCerrada, TONO_ESTADO, type Avance } from '../estado';
import { useRopa } from '../hooks/useRopa';
import type { OrdenVista } from '../types';
import { textoDelRetiro } from '../retiro';
import { diaDe, fechaCorta } from './fechas';
import { FormularioCobro } from './FormularioCobro';

type Props = {
  ordenId: string;
  alVolver: () => void;
  /**
   * Para que otra tarea agregue su acción al detalle, como entregar (SPEC-KRILINXI-009).
   * Recibe la orden, una función para volver a leerla después de cambiarla, y si su acción es la
   * principal de la boleta (SPEC-KRILINXI-037): lo es cuando ya no queda ningún avance.
   */
  accionesExtra?: (orden: OrdenVista, recargar: () => Promise<void>, como: { principal: boolean }) => ReactNode;
  /** Lo que dice el botón de volver: "Volver a la lista", o adónde vuelve (SPEC-KRILINXI-033). */
  textoVolver?: string;
};

/** El ícono de cada avance, al lado de su palabra (SPEC-KRILINXI-038). */
const ICONO_AVANCE: Record<Avance['destino'], NombreIcono> = { EN_PROCESO: 'lavar', LISTO: 'listo' };

/**
 * La fila de acciones de una boleta — SPEC-KRILINXI-038. En pantalla angosta, dos columnas; desde
 * `sm`, una fila que se acomoda sola. Nunca una barra por renglón: con cuatro acciones apiladas a
 * todo el ancho no se ve cuál es cuál. Lo que se abre dentro (el formulario de entrega) ocupa la
 * fila entera con `col-span-2 sm:basis-full` (ver `AccionEntregar`).
 */
const CLASE_FILA = 'mt-2 grid grid-cols-2 items-start gap-3 sm:flex sm:flex-wrap sm:items-center';

/** Pares dato/valor, uno debajo del otro. */
function Datos({ pares }: { pares: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2 text-xl">
      {pares.map(([dato, valor]) => (
        <div key={dato} className="contents">
          <dt className="font-semibold text-texto-suave">{dato}</dt>
          <dd className="text-texto whitespace-pre-line">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Todo sobre una ropa: sus datos, lo que pagó y lo que se puede hacer con ella —
 * SPEC-KRILINXI-008. Solo ofrece lo que el estado permite: una cerrada no se toca.
 */
export function DetalleOrden({ ordenId, alVolver, accionesExtra, textoVolver = 'Volver a la lista' }: Props) {
  const ropa = useRopa();
  const [orden, setOrden] = useState<OrdenVista | null | undefined>(undefined);
  const [cobrando, setCobrando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Lo que se acaba de hacer, para decirlo (SPEC-KRILINXI-033): después de cobrar, la persona
  // tiene que ver que quedó guardado sin tener que fijarse si el saldo bajó.
  const [hecho, setHecho] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!ropa.lista) return;
    setOrden(await ropa.obtener(ordenId));
  }, [ropa, ordenId]);

  useEffect(() => {
    recargar().catch((error: unknown) => console.error('No se pudo leer la ropa.', error));
  }, [recargar]);

  if (orden === undefined) return <p className="mt-6 text-xl text-texto-suave">Buscando…</p>;
  if (orden === null || !ropa.lista) {
    return (
      <>
        <p className="mt-6 text-xl text-texto-suave">No se encontró esa boleta en esta sucursal.</p>
        <div className="mt-4">
          <Boton variante="navegacion" onClick={alVolver}>
            {textoVolver}
          </Boton>
        </div>
      </>
    );
  }

  const cerrada = estaCerrada(orden.estado);
  // Una sola acción principal a la vista (SPEC-KRILINXI-037): el próximo avance, o lo que agregue
  // quien usa el detalle (entregar) cuando la ropa ya no tiene a dónde avanzar.
  const [siguiente, ...otrosAvances] = avancesDesde(orden.estado);

  async function pasarA(destino: EstadoOrden) {
    if (!ropa.lista || !orden) return;
    setHecho(null);
    const resultado = await ropa.cambiarEstado(orden.id, destino);
    setAviso(resultado.tipo === 'hecho' ? null : resultado.mensaje);
    await recargar();
  }

  // Dos grupos: qué ropa es y cómo va, y las cuentas. Cada dato es un par <dt>/<dd>: así se lee
  // de a pares con un lector de pantalla, y así lo buscan los tests.
  const laRopa: [string, ReactNode][] = [
    ['Cliente', `${orden.clienteNombre}${orden.clienteTelefono ? ` (${orden.clienteTelefono})` : ''}`],
    ['Ropa', orden.descripcion],
    ['Cómo va', <Insignia tono={TONO_ESTADO[orden.estado]}>{TEXTO_ESTADO_ORDEN[orden.estado]}</Insignia>],
    ['Entró', orden.fechaEntrada ? diaDe(orden.fechaEntrada) : '—'],
    ['Estará lista', orden.fechaEstimada ? fechaCorta(orden.fechaEstimada) : 'Sin fecha'],
    ...(orden.retiro ? ([['Retiró', textoDelRetiro(orden.retiro)]] as [string, ReactNode][]) : []),
  ];
  const cuentas: [string, ReactNode][] = [
    ['Precio', formatearBs(orden.precioTotal)],
    ...(orden.precioFinal !== null
      ? [['Precio al entregar', formatearBs(orden.precioFinal)] as [string, ReactNode]]
      : []),
    ['Pagó', formatearBs(orden.pagado)],
  ];

  return (
    <section className="mt-6 grid gap-4" aria-label={`Boleta ${orden.numeroBoleta}`}>
      <h2 className="text-2xl font-bold text-texto">Boleta {orden.numeroBoleta}</h2>

      <Tarjeta titulo="La ropa" nivel={3}>
        <Datos pares={laRopa} />
      </Tarjeta>

      <Tarjeta titulo="Cuentas" nivel={3}>
        <Datos pares={cuentas} />
        {/* Lo que más se pregunta en el mostrador: grande, y en rojo solo si hay algo que cobrar. */}
        <dl className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 border-t border-borde-suave pt-3">
          <dt className="text-xl font-semibold text-texto-suave">Falta pagar</dt>
          <dd className={`text-3xl font-bold ${orden.saldo > 0 ? 'text-peligro-texto' : 'text-exito-texto'}`}>
            {formatearBs(orden.saldo)}
          </dd>
        </dl>
      </Tarjeta>

      {/* Lo que se viene a hacer va justo debajo de lo que falta pagar (SPEC-KRILINXI-049): los pagos, que
          se miran menos, quedan después. */}
      {aviso && <Aviso tipo="error">{aviso}</Aviso>}
      {hecho && <Aviso tipo="exito">{hecho}</Aviso>}

      {cerrada && (
        <Aviso tipo="informacion">
          {orden.estado === 'ANULADO'
            ? 'Esta ropa fue anulada: no se puede entregar ni cobrar.'
            : 'Esta ropa ya fue entregada.'}
        </Aviso>
      )}

      {!cerrada && !cobrando && (
        <div role="group" aria-label="Qué hacer con esta ropa" className={CLASE_FILA}>
          {siguiente && (
            <Boton tamano="compacto" icono={ICONO_AVANCE[siguiente.destino]} onClick={() => pasarA(siguiente.destino)}>
              {siguiente.texto}
            </Boton>
          )}
          {otrosAvances.map(({ destino, texto }) => (
            <Boton
              key={destino}
              variante="secundario"
              tamano="compacto"
              icono={ICONO_AVANCE[destino]}
              onClick={() => pasarA(destino)}
            >
              {texto}
            </Boton>
          ))}
          {orden.saldo > 0 && (
            <Boton
              variante="secundario"
              tamano="compacto"
              icono="cobrar"
              onClick={() => {
                setHecho(null);
                setCobrando(true);
              }}
            >
              Cobrar
            </Boton>
          )}
          {accionesExtra?.(orden, recargar, { principal: !siguiente })}
        </div>
      )}

      {!cerrada && cobrando && (
        <FormularioCobro
          saldo={orden.saldo}
          cobrar={(datosCobro) => ropa.cobrar(orden.id, datosCobro)}
          alCobrar={() => {
            setCobrando(false);
            setHecho('Cobro guardado.');
            void recargar();
          }}
          alCancelar={() => setCobrando(false)}
        />
      )}

      <Tarjeta titulo="Pagos" nivel={3}>
        {orden.pagos.length === 0 ? (
          <p className="text-xl text-texto-suave">Todavía no pagó nada.</p>
        ) : (
          <ul className="grid gap-2 text-xl" aria-label="Pagos">
            {orden.pagos.map((pago) => (
              <li key={pago.id} className="rounded-xl bg-fondo px-4 py-2">
                {TEXTO_TIPO_PAGO[pago.tipo]} — {TEXTO_METODO_PAGO[pago.metodo]} — {formatearBs(pago.monto)}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {/* Anular, lo único que no tiene vuelta atrás, aparte de las acciones de todos los días y al final. */}
      {!cerrada && (
        <div className="mt-2">
          <Boton variante="peligro" tamano="compacto" icono="anular" onClick={() => setAnulando(true)}>
            Anular
          </Boton>
        </div>
      )}

      <div className="mt-2">
        <Boton variante="navegacion" onClick={alVolver}>
          {textoVolver}
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
