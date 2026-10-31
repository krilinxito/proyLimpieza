import { formatearBs, formatearCantidad } from '../../../lib/money';
import type { RenglonVisto } from '../types';

function Lista({ titulo, renglones }: { titulo: string; renglones: RenglonVisto[] }) {
  return (
    <div className="mt-3">
      <h4 className="text-xl font-semibold text-texto-suave">{titulo}</h4>
      <ul aria-label={titulo} className="mt-1 grid gap-2">
        {renglones.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-borde-suave pb-2">
            <span className="text-xl text-texto whitespace-pre-line">
              {formatearCantidad(r.cantidad)} {r.descripcion}
              <span className="block text-lg text-texto-suave">{formatearBs(r.precioUnitario)} cada una</span>
            </span>
            <span className="text-xl font-semibold text-texto">{formatearBs(r.subtotal)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Los renglones de una boleta, para leerlos — SPEC-KRILINXI-068: cada uno con su cantidad, qué es, su precio unitario y su
 * subtotal. Primero lo que dejó el cliente y, aparte, los cargos que se sumaron al entregar. Lo usan el detalle del
 * Mostrador y el del historial; una boleta de antes de los renglones no la usa (muestra su descripción, como siempre).
 */
export function ListaDeRenglones({ renglones }: { renglones: RenglonVisto[] }) {
  const deLaBoleta = renglones.filter((r) => r.momento === 'INGRESO');
  const cargos = renglones.filter((r) => r.momento === 'ENTREGA');
  return (
    <>
      {deLaBoleta.length > 0 && <Lista titulo="Lo que dejó" renglones={deLaBoleta} />}
      {cargos.length > 0 && <Lista titulo="Cargos al entregar" renglones={cargos} />}
    </>
  );
}
