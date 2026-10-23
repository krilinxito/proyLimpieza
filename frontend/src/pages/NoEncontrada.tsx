import { EnlaceBoton } from '../components/EnlaceBoton';
import { Pantalla } from './Pantalla';

/** Una dirección que no existe: qué pasó y un solo camino de vuelta (SPEC-KRILINXI-024). */
export function NoEncontrada() {
  return (
    <Pantalla titulo="Esa página no existe">
      <p className="mt-4 text-xl text-texto-suave">
        Puede que el enlace esté mal escrito. Vuelve al inicio y elige qué quieres hacer.
      </p>
      <div className="mt-8">
        <EnlaceBoton a="/" icono="inicio">
          Volver al inicio
        </EnlaceBoton>
      </div>
    </Pantalla>
  );
}
