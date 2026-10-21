import { Link } from 'react-router-dom';
import { Aviso } from '../../../components/Aviso';
import { EnlaceBoton } from '../../../components/EnlaceBoton';
import { Paginas } from '../../../components/Paginas';
import { ESTILO_TARJETA, SenalTocable, Tarjeta } from '../../../components/Tarjeta';
import { useConexion } from '../../../hooks/useConexion';
import { usePaginado } from '../../../hooks/usePaginado';
import { TEXTO_METODO_PAGO } from '../../../lib/dominio';
import { formatearBs } from '../../../lib/money';
import { fechaCorta } from '../../ordenes/components/fechas';
import type { OrdenVista } from '../../ordenes/types';
import { useHoy } from '../hooks/useHoy';
import { enlaceABoleta } from './PantallaMostrador';

/** "1 boleta" / "3 boletas". */
function boletas(n: number): string {
  return n === 1 ? '1 boleta' : `${n} boletas`;
}

/**
 * Una boleta de la lista: entera tocable, lleva a esa boleta en el Mostrador. Un enlace, no un
 * botón: lleva a otra pantalla (SPEC-KRILINXI-024). Su nombre es la boleta y el cliente. Se ve
 * como una tarjeta que se toca, con su flecha (SPEC-KRILINXI-037).
 */
function FilaBoleta({ orden, detalle }: { orden: OrdenVista; detalle: string }) {
  return (
    <li>
      <Link
        to={enlaceABoleta(orden)}
        aria-label={`Boleta ${orden.numeroBoleta}, ${orden.clienteNombre}`}
        className={`flex min-h-14 items-center gap-3 text-xl ${ESTILO_TARJETA.toca}`}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span>
            <span className="font-semibold text-texto">Boleta {orden.numeroBoleta}</span>
            <span className="text-texto-suave"> · {orden.clienteNombre}</span>
          </span>
          <span className="text-lg text-texto-suave">{detalle}</span>
        </span>
        <SenalTocable />
      </Link>
    </li>
  );
}

/** Una de las listas del día, con su número en el título y qué decir si está vacía. */
function ListaDelDia({ titulo, ordenes, vacia, detalle }: {
  titulo: string;
  ordenes: OrdenVista[];
  vacia: string;
  detalle: (orden: OrdenVista) => string;
}) {
  const paginas = usePaginado(ordenes);
  return (
    <Tarjeta titulo={`${titulo} (${boletas(ordenes.length)})`}>
      {ordenes.length === 0 ? (
        <p className="text-xl text-texto-suave">{vacia}</p>
      ) : (
        <>
          <ul className="grid gap-2">
            {(paginas.visibles ?? []).map((orden) => (
              <FilaBoleta key={orden.id} orden={orden} detalle={detalle(orden)} />
            ))}
          </ul>
          <Paginas pagina={paginas.pagina} total={paginas.total} porPagina={paginas.porPagina} irAPagina={paginas.irAPagina} nombre={`Páginas de ${titulo.toLowerCase()}`} />
        </>
      )}
    </Tarjeta>
  );
}

const saldo = (orden: OrdenVista) => (orden.saldo > 0 ? `Falta pagar ${formatearBs(orden.saldo)}` : 'Pagado');

/**
 * El Inicio de quien atiende: "Hoy en la sucursal" — SPEC-KRILINXI-035. Lo que pide atención, en
 * listas cortas con su número, y cada boleta lleva directo a ella en el Mostrador. Todo de la base
 * local, también sin internet. Una lista vacía lo dice en palabras: nunca queda en blanco.
 */
export function HoyEnLaSucursal() {
  const hoy = useHoy();
  const paraCorregir = useConexion()?.paraCorregir ?? 0;

  if (!hoy) return <p className="mt-8 text-xl text-texto-suave">Buscando lo de hoy…</p>;
  const { paraRecoger, atrasadas, cobrado } = hoy;

  return (
    <div className="mt-8 grid gap-6">
      <h2 className="text-2xl font-bold text-texto">Hoy en la sucursal</h2>

      {paraCorregir > 0 && (
        <div className="grid justify-items-start gap-3">
          <Aviso tipo="advertencia">
            {paraCorregir === 1
              ? 'Hay 1 registro que no se pudo guardar y hay que revisar.'
              : `Hay ${paraCorregir} registros que no se pudieron guardar y hay que revisar.`}
          </Aviso>
          {/* Lo único que pide hacer algo ya: la acción principal del Inicio (SPEC-KRILINXI-037). */}
          <EnlaceBoton a="/para-corregir">
            Revisar los registros
          </EnlaceBoton>
        </div>
      )}

      <ListaDelDia
        titulo="Lista para recoger"
        ordenes={paraRecoger}
        vacia="No hay ropa lista esperando que la recojan."
        detalle={saldo}
      />

      <ListaDelDia
        titulo="Atrasada"
        ordenes={atrasadas}
        vacia="No hay ropa atrasada."
        detalle={(orden) => `Era para el ${fechaCorta(orden.fechaEstimada ?? '')}`}
      />

      <Tarjeta titulo="Cobrado hoy" tipo="destaca">
        <p className="text-4xl font-bold text-texto">{formatearBs(cobrado.total)}</p>
        {cobrado.porMetodo.length === 0 ? (
          <p className="mt-2 text-xl text-texto-suave">Todavía no se cobró nada hoy.</p>
        ) : (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xl">
            {cobrado.porMetodo.map(({ metodo, monto }) => (
              <div key={metodo} className="contents">
                <dt className="font-semibold text-texto-suave">{TEXTO_METODO_PAGO[metodo]}</dt>
                <dd className="text-texto">{formatearBs(monto)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Tarjeta>
    </div>
  );
}
