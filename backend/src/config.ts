// Lectura y validación de las variables de entorno.
//
// El .env vive en la RAÍZ del repositorio, no en backend/: es el mismo archivo
// que usan docker-compose y el frontend, y tener tres copias del mismo secreto
// es la forma más rápida de que dejen de coincidir.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(currentDir, '../../.env'), quiet: true });

export interface Config {
  port: number;
  databaseUrl: string;
  nodeEnv: string;
}

/**
 * Construye la config a partir de un entorno dado.
 *
 * Recibe el entorno como argumento en vez de leer `process.env` por dentro para
 * poder testearla sin ensuciar el proceso: se la llama con un objeto cualquiera
 * y se comprueba qué devuelve o qué error tira.
 */
export function readConfig(env: NodeJS.ProcessEnv): Config {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      'Falta la variable DATABASE_URL. Copiá .env.example a .env en la raíz del ' +
        'repositorio y completá los datos de conexión a Postgres.',
    );
  }

  const port = Number(env.PORT ?? 4000);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT tiene que ser un número de puerto válido, y llegó "${env.PORT}".`);
  }

  return { port, databaseUrl, nodeEnv: env.NODE_ENV ?? 'development' };
}

export const config = readConfig(process.env);
