import { Aviso } from '../../../components/Aviso';
import { EnlaceBoton } from '../../../components/EnlaceBoton';

/** Lo que ve un empleado que llega a una pantalla del administrador escribiendo la dirección. */
export function AvisoSoloAdministrador() {
  return (
    <div className="mt-6 grid justify-items-start gap-6">
      <Aviso tipo="informacion">Esta parte es solo para el administrador. Si necesitás estos datos, pedíselos al encargado.</Aviso>
      <EnlaceBoton a="/" icono="inicio">
        Volver al inicio
      </EnlaceBoton>
    </div>
  );
}
