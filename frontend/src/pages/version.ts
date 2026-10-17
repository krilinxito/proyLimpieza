/**
 * La versión de la app, la de `frontend/package.json` — SPEC-KRILINXI-023.
 *
 * `__VERSION_APP__` no existe en tiempo de ejecución: Vite lo reemplaza por el texto al compilar
 * (`define` en `vite.config.ts`), en el build y en los tests. Para subirla, se cambia `version`
 * en `frontend/package.json`.
 */
declare const __VERSION_APP__: string;

export const VERSION_APP: string = __VERSION_APP__;
