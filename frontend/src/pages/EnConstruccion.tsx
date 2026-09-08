import { Link } from 'react-router-dom';
import { Pantalla } from './Pantalla';

/**
 * Hueco de una pantalla que todavía no existe. Que la ruta responda algo honesto desde el
 * primer día evita que cada spec siguiente tenga que tocar el registro de rutas: solo
 * cambia su `elemento`.
 */
export function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <Pantalla titulo={titulo}>
      <p className="mt-4 text-xl text-slate-700">Esta parte todavía no está hecha.</p>
      <Link to="/" className="mt-6 inline-block text-xl font-semibold text-sky-700 underline">
        Volver al inicio
      </Link>
    </Pantalla>
  );
}
