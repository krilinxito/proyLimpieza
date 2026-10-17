import { EnlaceBoton } from '../components/EnlaceBoton';
import { Pantalla } from './Pantalla';

/**
 * Hueco de una pantalla que todavía no existe. Que la ruta responda algo honesto desde el
 * primer día evita que cada spec siguiente tenga que tocar el registro de rutas: solo
 * cambia su `elemento`.
 */
export function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <Pantalla titulo={titulo}>
      <p className="mt-4 text-xl text-texto-suave">Esta parte todavía no está hecha.</p>
      <div className="mt-8">
        <EnlaceBoton a="/" icono="inicio">
          Volver al inicio
        </EnlaceBoton>
      </div>
    </Pantalla>
  );
}
