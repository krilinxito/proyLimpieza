// `npm run migrar --workspace backend` — SPEC-ALE186-019.
//
// Aplica las migraciones pendientes de `backend/migraciones/` sobre la base de
// DATABASE_URL. Es el único camino para cambiar el schema de una base que ya
// tiene datos: `lavanderia_schema.sql` es la línea base y no se vuelve a editar.
import pg from 'pg';
import { config } from '../config.js';
import { CARPETA_DE_MIGRACIONES, CarpetaInvalidaError, MigracionFallidaError, migrar } from './migraciones.js';

const conexion = new pg.Client({ connectionString: config.databaseUrl });

try {
  await conexion.connect();
  const aplicadas = await migrar(conexion, CARPETA_DE_MIGRACIONES);
  if (aplicadas.length === 0) {
    console.log('No hay migraciones pendientes: la base está al día.');
  } else {
    for (const nombre of aplicadas) console.log(`Aplicada: ${nombre}`);
    console.log(`Listo: ${aplicadas.length} migración(es) aplicada(s).`);
  }
} catch (error) {
  if (error instanceof MigracionFallidaError) {
    console.error(`Falló ${error.archivo}. No quedó aplicada, ni las que venían después.`);
    console.error(`Postgres dijo: ${error.detalle}`);
  } else if (error instanceof CarpetaInvalidaError) {
    console.error(`No se aplicó ninguna migración: ${error.message}`);
  } else {
    console.error('No se pudo migrar:', error);
  }
  process.exitCode = 1;
} finally {
  await conexion.end();
}
