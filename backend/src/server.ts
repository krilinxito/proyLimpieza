// Punto de entrada: levanta el servidor HTTP.
import { createApp } from './app.js';
import { config } from './config.js';
import { CARPETA_DE_MIGRACIONES, chequeoDeArranque } from './db/migraciones.js';
import { pool } from './db/pool.js';

// Antes de escuchar: si a la base le faltan migraciones, el servidor no arranca
// (SPEC-ALE186-019). Atendería con un schema que el código ya no espera, y los
// errores aparecerían recién cuando alguien use la parte que cambió.
const faltan = await chequeoDeArranque(pool, CARPETA_DE_MIGRACIONES);
if (faltan !== null) {
  console.error(faltan);
  process.exit(1);
}

const app = createApp();

app.listen(config.port, () => {
  console.log(`API escuchando en http://localhost:${config.port} (${config.nodeEnv})`);
});
