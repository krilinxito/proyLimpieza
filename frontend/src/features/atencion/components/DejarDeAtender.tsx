import { useNavigate } from 'react-router-dom';
import { Boton } from '../../../components/Boton';
import { useAtencion } from '../hooks/useAtencion';

/**
 * "Dejar de atender", en la cabecera mientras el ADMIN atiende — SPEC-KRILINXI-029.
 *
 * Sin confirmación: no se pierde nada. La tablet deja de bajar la ropa de esa sucursal, pero lo
 * que se registró y todavía no subió sigue en la cola y sube igual. Vuelve al Inicio, porque la
 * pantalla del mostrador donde estaba ya no tiene sucursal.
 */
export function DejarDeAtender() {
  const atencion = useAtencion();
  const navigate = useNavigate();
  if (!atencion.puedeElegir || !atencion.sucursalId) return null;
  return (
    <div className="w-auto">
      <Boton
        variante="secundario"
        icono="sucursales"
        onClick={() => {
          atencion.dejar();
          navigate('/');
        }}
      >
        Dejar de atender
      </Boton>
    </div>
  );
}
