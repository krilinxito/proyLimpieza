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
};

/**
 * Separada de `entorno` a propósito: recibe la fuente como argumento, así se puede probar
 * con valores inventados sin tocar las variables reales de la máquina.
 */
export function leerEntorno(fuente: Record<string, string | undefined>): Entorno {
  const apiUrl = fuente.VITE_API_URL?.trim();

  if (!apiUrl) {
    throw new Error(
      'No se puede abrir el sistema: falta configurar la dirección del servidor. ' +
        'Copiá el archivo .env.example a .env y volvé a arrancar.',
    );
  }

  return { apiUrl: apiUrl.replace(/\/+$/, '') };
}

export const entorno = leerEntorno(import.meta.env);
