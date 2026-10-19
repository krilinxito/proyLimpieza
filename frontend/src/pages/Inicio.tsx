import { AtenderEnUnaSucursal } from '../features/atencion/components/AtenderEnUnaSucursal';
import { useSucursalDeTrabajo } from '../features/atencion/hooks/useSucursalDeTrabajo';
import { ResumenDelInicio } from '../features/estadisticas/components/ResumenDelInicio';
import { HoyEnLaSucursal } from '../features/mostrador/components/HoyEnLaSucursal';
import { useSession } from '../hooks/useSession';
import { Pantalla } from './Pantalla';

/**
 * El Inicio — SPEC-KRILINXI-035. Hasta acá repetía el menú en tarjetas; ahora dice qué hay que hacer:
 *
 *  - quien atiende (un EMPLEADO, o el ADMIN mientras atiende, SPEC-KRILINXI-029): "Hoy en la
 *    sucursal", lo que pide atención en el mostrador, de la base local;
 *  - el ADMIN que no atiende: "Atender en una sucursal" y los números del negocio.
 *
 * Las tareas siguen en el menú, como siempre: el Inicio no las repite.
 */
export function Inicio() {
  const { sesion } = useSession();
  const usuario = sesion?.usuario;
  const conSucursal = useSucursalDeTrabajo() !== null;

  return (
    <Pantalla titulo="Lavandería">
      {usuario && <p className="mt-2 text-2xl text-texto-suave">Hola, {usuario.nombreCompleto}</p>}
      {conSucursal ? (
        <HoyEnLaSucursal />
      ) : (
        usuario?.rol === 'ADMIN' && (
          <>
            <AtenderEnUnaSucursal />
            <ResumenDelInicio />
          </>
        )
      )}
    </Pantalla>
  );
}
