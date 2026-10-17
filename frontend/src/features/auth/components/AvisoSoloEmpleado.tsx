import { Aviso } from '../../../components/Aviso';
import { EnlaceBoton } from '../../../components/EnlaceBoton';

/**
 * Lo que ve el administrador en una pantalla del mostrador — SPEC-KRILINXI-006.
 *
 * El administrador no tiene sucursal, y lo que se registra en el mostrador va siempre a una
 * (CLAUDE.md §3): no hay dónde guardarlo.
 */
export function AvisoSoloEmpleado() {
  return (
    <div className="mt-6 grid justify-items-start gap-6">
      <Aviso tipo="informacion">Esta parte es para quien atiende en una sucursal. Para usarla, ingresá con un usuario de empleado.</Aviso>
      <EnlaceBoton a="/" icono="inicio">
        Volver al inicio
      </EnlaceBoton>
    </div>
  );
}
