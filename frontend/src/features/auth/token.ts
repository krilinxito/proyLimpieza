/**
 * Leer cuándo vence un token — SPEC-KRILINXI-010.
 *
 * Un JWT son tres pedazos separados por puntos: cabecera, contenido y firma. El contenido es
 * JSON en base64url, legible por cualquiera; lo que nadie puede falsificar es la firma, y esa
 * la comprueba el servidor. Aquí solo se lee `exp` (segundos desde 1970) para saber si vale
 * la pena presentarse con este token o conviene pedir uno nuevo antes.
 */

/** El momento en que vence, en milisegundos como `Date.now()`, o null si no se puede leer. */
export function venceEn(token: string): number | null {
  const contenido = token.split('.')[1];
  if (!contenido) return null;
  try {
    // base64url usa `-` y `_` donde base64 usa `+` y `/`; `atob` solo entiende el segundo.
    const json: unknown = JSON.parse(atob(contenido.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof json !== 'object' || json === null || !('exp' in json) || typeof json.exp !== 'number') return null;
    return json.exp * 1000;
  } catch {
    return null;
  }
}
