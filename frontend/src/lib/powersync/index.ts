/**
 * La puerta de `lib/powersync/` para el resto de la app. Nadie fuera de esta carpeta
 * importa `@powersync/*` (lo vigila `test/arquitectura.test.ts`).
 */
import type { ControlBaseLocal } from './control';

export type { BaseLocal, ControlBaseLocal, Fila } from './control';
export { ContextoBaseLocal, useBaseLocal } from './contexto';

/**
 * Abre la base del navegador. El `import()` dinámico es a propósito: el SDK web solo se
 * carga cuando alguien entra, y los tests —que inyectan su propio doble— no lo cargan nunca.
 */
export async function abrirBaseLocal(): Promise<ControlBaseLocal> {
  const web = await import('./web');
  return web.abrir();
}
