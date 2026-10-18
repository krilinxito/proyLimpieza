/**
 * Dónde atiende el ADMIN, guardado en la tablet — SPEC-KRILINXI-029.
 *
 * En `localStorage`, como la sesión (`features/auth/api/almacen.ts`, que explica por qué ahí):
 * un corte de luz o una recarga no lo sacan del mostrador. Va con el id de quien eligió, así
 * que si en la tablet entra otra persona no hereda la sucursal del anterior. Lo borra "Dejar de
 * atender" y también Salir.
 *
 * Es el único archivo que toca esta clave, con try/catch por la misma razón que la sesión.
 */
const CLAVE = 'lavanderia.atencion';

type Guardada = { usuarioId: string; sucursalId: string };

function esGuardada(valor: unknown): valor is Guardada {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'usuarioId' in valor &&
    typeof valor.usuarioId === 'string' &&
    'sucursalId' in valor &&
    typeof valor.sucursalId === 'string' &&
    valor.sucursalId !== ''
  );
}

/** La sucursal donde atiende esa persona, o null si no eligió ninguna (o la eligió otra). */
export function leerAtencion(usuarioId: string): string | null {
  try {
    const guardada = localStorage.getItem(CLAVE);
    if (guardada === null) return null;
    const datos: unknown = JSON.parse(guardada);
    return esGuardada(datos) && datos.usuarioId === usuarioId ? datos.sucursalId : null;
  } catch {
    return null;
  }
}

export function guardarAtencion(usuarioId: string, sucursalId: string): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ usuarioId, sucursalId } satisfies Guardada));
  } catch {
    // Sin almacenamiento, la elección dura lo que dure la pestaña.
  }
}

export function borrarAtencion(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar si no hay almacenamiento.
  }
}
