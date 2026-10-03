/**
 * El único sitio donde se leen las variables de entorno del navegador.
 *
 * Vite reemplaza `import.meta.env.VITE_*` por su valor literal al compilar, así que si la
 * variable falta el bug no aparece aquí: aparece más tarde, como una petición a
 * `undefined/api/ordenes` que falla sin explicar por qué. Por eso se valida al arrancar y
 * se falla con un mensaje que dice qué hacer.
 */

export type Entorno = {
  /** Dirección del servidor de la API, sin barra final. */
  apiUrl: string;
  /** Dirección del servicio de PowerSync, sin barra final (SPEC-KRILINXI-004). */
  powersyncUrl: string;
};

const COPIAR_ENV = 'Copiá el archivo .env.example a .env y volvé a arrancar.';

function leerUrl(fuente: Record<string, string | undefined>, nombre: string, falta: string): string {
  const valor = fuente[nombre]?.trim();
  if (!valor) {
    throw new Error(`No se puede abrir el sistema: falta configurar ${falta}. ${COPIAR_ENV}`);
  }
  return valor.replace(/\/+$/, '');
}

/**
 * Separada de `entorno` a propósito: recibe la fuente como argumento, así se puede probar
 * con valores inventados sin tocar las variables reales de la máquina.
 */
export function leerEntorno(fuente: Record<string, string | undefined>): Entorno {
  return {
    apiUrl: leerUrl(fuente, 'VITE_API_URL', 'la dirección del servidor'),
    powersyncUrl: leerUrl(fuente, 'VITE_POWERSYNC_URL', 'la dirección del servicio de sincronización'),
  };
}

export const entorno = leerEntorno(import.meta.env);
