/**
 * Los avisos de las pantallas del admin que escriben directo a la API — SPEC-KRILINXI-017.
 * Compartidos por el personal y las sucursales, para que digan lo mismo con las mismas palabras.
 */

/** Sin red: los botones de cambio están deshabilitados y esto dice por qué. */
export function AvisoSinRed() {
  return (
    <p role="status" className="mt-6 rounded-lg border-2 border-amber-600 bg-amber-50 p-4 text-xl text-amber-900">
      Para hacer cambios hace falta internet. Lo que está en la lista se puede mirar igual.
    </p>
  );
}

/** Cómo terminó el último cambio: bien (verde) o mal (rojo). */
export function AvisoResultado({ aviso }: { aviso: { tipo: 'bien' | 'mal'; texto: string } | null }) {
  if (!aviso) return null;
  return aviso.tipo === 'bien' ? (
    <p role="status" className="mt-6 rounded-lg bg-green-50 p-4 text-xl text-green-900">
      {aviso.texto}
    </p>
  ) : (
    <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-xl text-red-800">
      {aviso.texto}
    </p>
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
