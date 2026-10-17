import { Aviso } from './Aviso';

/**
 * Los avisos de las pantallas del admin que escriben directo a la API — SPEC-KRILINXI-017.
 * Compartidos por el personal y las sucursales, para que digan lo mismo con las mismas palabras.
 */

/**
 * Sin red: los botones de cambio están deshabilitados y esto dice por qué. Es información y no
 * advertencia (SPEC-KRILINXI-022): no pasó nada malo, y un `alert` interrumpiría al lector de
 * pantalla cada vez que la pantalla se abre sin internet.
 */
export function AvisoSinRed() {
  return (
    <div className="mt-6">
      <Aviso tipo="informacion">Para hacer cambios hace falta internet. Lo que está en la lista se puede mirar igual.</Aviso>
    </div>
  );
}

/** Cómo terminó el último cambio: bien (verde) o mal (rojo). */
export function AvisoResultado({ aviso }: { aviso: { tipo: 'bien' | 'mal'; texto: string } | null }) {
  if (!aviso) return null;
  return (
    <div className="mt-6">
      <Aviso tipo={aviso.tipo === 'bien' ? 'exito' : 'error'}>{aviso.texto}</Aviso>
    </div>
  );
}

export const TEXTOS_ADMIN = {
  guardado: 'Guardado. Puede tardar unos segundos en verse en la lista.',
  sinCambios: 'No cambiaste ningún dato: quedó como estaba.',
  sinConexion: 'No hay internet: no se guardó. Probá de nuevo cuando vuelva la conexión.',
} as const;

/** Lo que dice el aviso para un resultado de `enviar` ya traducido por la feature. */
export function avisoDe(
  resultado: { tipo: 'guardado' } | { tipo: 'sin-cambios' } | { tipo: 'rechazado'; mensaje: string } | { tipo: 'sin-conexion' },
): { tipo: 'bien' | 'mal'; texto: string } {
  switch (resultado.tipo) {
    case 'guardado':
      return { tipo: 'bien', texto: TEXTOS_ADMIN.guardado };
    case 'sin-cambios':
      return { tipo: 'bien', texto: TEXTOS_ADMIN.sinCambios };
    case 'rechazado':
      return { tipo: 'mal', texto: resultado.mensaje };
    case 'sin-conexion':
      return { tipo: 'mal', texto: TEXTOS_ADMIN.sinConexion };
  }
}
