import { Link } from 'react-router-dom';

/** Lo que ve un empleado que llega a una pantalla del administrador escribiendo la dirección. */
export function AvisoSoloAdministrador() {
  return (
    <>
      <p className="mt-4 text-xl text-slate-700">
        Esta parte es solo para el administrador. Si necesitás estos datos, pedíselos al encargado.
      </p>
      <Link to="/" className="mt-6 inline-block text-xl font-semibold text-sky-700 underline">
        Volver al inicio
      </Link>
    </>
  );
}
