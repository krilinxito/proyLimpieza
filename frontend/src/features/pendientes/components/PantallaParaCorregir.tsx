import { Link } from 'react-router-dom';
import { useParaCorregir } from '../hooks/useParaCorregir';

/** "2026-10-03T14:05:00.000Z" → "03/10/2026 10:05", en la hora de la tablet. */
function cuando(fecha: string): string {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/**
 * Lo que no se pudo guardar, con el motivo — SPEC-KRILINXI-007. Por ahora solo se muestra:
 * corregirlo y volver a guardarlo es de una spec siguiente.
 */
export function PantallaParaCorregir() {
  const registros = useParaCorregir();

  if (registros === null) return <p className="mt-6 text-xl text-slate-700">Buscando…</p>;

  if (registros.length === 0) {
    return (
      <>
        <p className="mt-6 text-xl text-slate-700">No hay nada para corregir. Todo se guardó bien.</p>
        <Link to="/" className="mt-6 inline-block text-xl font-semibold text-sky-700 underline">
          Volver al inicio
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="mt-4 text-xl text-slate-700">
        Estos registros no se pudieron guardar. Leé el motivo de cada uno y avisale al encargado.
      </p>
      <ul className="mt-6 grid gap-4">
        {registros.map((registro) => (
          <li key={registro.id} className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
            <p className="text-xl font-semibold text-slate-900">{registro.que}</p>
            <p className="mt-2 text-xl text-red-800">{registro.mensaje}</p>
            {registro.fecha && <p className="mt-2 text-lg text-slate-600">{cuando(registro.fecha)}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
