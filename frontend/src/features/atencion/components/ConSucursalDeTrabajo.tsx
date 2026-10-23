import type { ReactNode } from 'react';
import { Aviso } from '../../../components/Aviso';
import { EnlaceBoton } from '../../../components/EnlaceBoton';
import { useSucursalDeTrabajo } from '../hooks/useSucursalDeTrabajo';

/**
 * Portero de las pantallas del mostrador — SPEC-KRILINXI-029. Lo que se registra ahí va siempre a
 * una sucursal (CLAUDE.md §3): sin sucursal de trabajo, en vez de la pantalla, dice cómo empezar.
 *
 * Solo lo ve un ADMIN que no está atendiendo: un EMPLEADO siempre tiene la suya. Antes de esta
 * spec el aviso era "esto es solo para empleados"; ahora el admin también puede, eligiendo dónde.
 */
export function ConSucursalDeTrabajo({ children }: { children: ReactNode }) {
  const sucursalId = useSucursalDeTrabajo();
  if (sucursalId) return children;
  return (
    <div className="mt-6 grid justify-items-start gap-6">
      <Aviso tipo="informacion">
        Para usar esta parte, primero elige en qué sucursal vas a atender. Se elige en el inicio, con «Atender en
        una sucursal».
      </Aviso>
      <EnlaceBoton a="/" icono="sucursales">
        Elegir la sucursal
      </EnlaceBoton>
    </div>
  );
}
