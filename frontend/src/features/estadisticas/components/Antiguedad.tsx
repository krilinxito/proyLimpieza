import { TEXTO_TRAMO, type Tramo } from '../types';
import { bs } from './montos';

/** Cuántas hay en cada tramo de antigüedad. Los tres tramos vienen siempre, aunque estén en cero. */
export function Antiguedad({ tramos }: { tramos: { tramo: Tramo; cantidad: number; total?: string }[] }) {
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xl">
      {tramos.map(({ tramo, cantidad, total }) => (
        <div key={tramo} className="contents">
          <dt className="text-slate-700">{TEXTO_TRAMO[tramo]}</dt>
          <dd className="text-slate-900">
            {cantidad} {cantidad === 1 ? 'boleta' : 'boletas'}
            {total !== undefined && ` — ${bs(total)}`}
          </dd>
        </div>
      ))}
    </dl>
  );
}
