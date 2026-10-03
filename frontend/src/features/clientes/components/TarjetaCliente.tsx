import type { Cliente } from '../types';

/** Los datos de un cliente, grandes y en una lista que se lee de un vistazo. */
export function TarjetaCliente({ cliente }: { cliente: Cliente }) {
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border-2 border-slate-300 bg-white p-4 text-xl">
      <dt className="font-semibold text-slate-700">Nombre</dt>
      <dd className="text-slate-900">{cliente.nombre}</dd>
      <dt className="font-semibold text-slate-700">Teléfono</dt>
      <dd className="text-slate-900">{cliente.telefono}</dd>
      <dt className="font-semibold text-slate-700">Carnet</dt>
      <dd className="text-slate-900">{cliente.carnet ?? 'No lo dio'}</dd>
    </dl>
  );
}
