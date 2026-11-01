/**
 * Lo que necesita la pantalla para corregir una boleta — SPEC-KRILINXI-071. Los componentes no importan `api/` (CLAUDE.md
 * §5, lo vigila un test de arquitectura): la llamada se ofrece desde acá, como `cambiosDeSucursal`.
 */
import { corregirBoleta } from '../api/correccionApi';

export type { ResultadoCorreccion } from '../api/correccionApi';

export const guardarCorreccion = corregirBoleta;
