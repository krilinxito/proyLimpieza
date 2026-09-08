import { Link } from 'react-router-dom';
import { Pantalla } from './Pantalla';

export function NoEncontrada() {
  return (
    <Pantalla titulo="Esa página no existe">
      <p className="mt-4 text-xl text-slate-700">
        Puede que el enlace esté mal escrito. Volvé al inicio y elegí qué querés hacer.
      </p>
      <Link to="/" className="mt-6 inline-block text-xl font-semibold text-sky-700 underline">
        Volver al inicio
      </Link>
    </Pantalla>
  );
}
