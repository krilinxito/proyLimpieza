import { Link } from 'react-router-dom';

/**
 * Lo que ve el administrador en una pantalla del mostrador — SPEC-KRILINXI-006.
 *
 * El administrador no tiene sucursal, y lo que se registra en el mostrador va siempre a una
 * (CLAUDE.md §3): no hay dónde guardarlo.
 */
export function AvisoSoloEmpleado() {
  return (
    <>
      <p className="mt-4 text-xl text-slate-700">
        Esta parte es para quien atiende en una sucursal. Para usarla, ingresá con un usuario de empleado.
      </p>
      <Link to="/" className="mt-6 inline-block text-xl font-semibold text-sky-700 underline">
        Volver al inicio
      </Link>
    </>
  );
}
