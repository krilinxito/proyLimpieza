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

// ------------------------------------------------------------------
//  Configuración de la autenticación
// ------------------------------------------------------------------
// Va en su propia función, y no dentro de `readConfig`, porque son dos cosas
// con vidas distintas: `readConfig` describe cómo arranca el proceso (puerto,
// base de datos) y esto describe cómo se firman los tokens. Separadas, cada
// una se puede testear con su propio entorno de mentira.

export interface ConfigAuth {
  /** El secreto YA decodificado a bytes. Ver el comentario de abajo. */
  secreto: Buffer;
  audiencia: string;
  expiraEn: string;
}

/** 32 bytes es el tamaño de la salida de HS256: por debajo, la clave es el eslabón débil. */
const BYTES_MINIMOS_DEL_SECRETO = 32;

/**
 * Lee el secreto compartido con PowerSync y cómo se firman los tokens.
 *
 * El secreto viaja en base64url y se usa **en bytes**, no como texto. No es un
 * capricho: `docker/powersync/powersync.yaml` lo declara como una clave JWKS
 * (`kty: oct`, `k: !env PS_JWT_SECRET_B64`), y en JWKS el campo `k` es
 * base64url de los bytes crudos. Si el backend firmara usando la cadena tal
 * cual, firmaría con una clave distinta de la que PowerSync verifica y todos
 * los tokens serían rechazados — sin más pista que un 401.
 */
export function readAuthConfig(env: NodeJS.ProcessEnv): ConfigAuth {
  const enBase64 = env.PS_JWT_SECRET_B64?.trim();

  if (!enBase64) {
    throw new Error(
      'Falta la variable PS_JWT_SECRET_B64. Generá un secreto con:\n' +
        "  openssl rand -base64 32 | tr '+/' '-_' | tr -d '='\n" +
        'y ponelo en el .env de la raíz del repositorio.',
    );
  }

  const secreto = Buffer.from(enBase64, 'base64url');

  if (secreto.length < BYTES_MINIMOS_DEL_SECRETO) {
    throw new Error(
      `PS_JWT_SECRET_B64 decodifica a ${secreto.length} bytes y hacen falta al menos ` +
        `${BYTES_MINIMOS_DEL_SECRETO}. Si todavía tiene el texto de ejemplo del .env.example, ` +
        "generá uno de verdad: openssl rand -base64 32 | tr '+/' '-_' | tr -d '='",
    );
  }

  const audiencia = env.PS_JWT_AUDIENCE?.trim();

  if (!audiencia) {
    throw new Error(
      'Falta la variable PS_JWT_AUDIENCE. Tiene que valer lo mismo acá que en ' +
        'docker/powersync/powersync.yaml, o PowerSync rechazará los tokens.',
    );
  }

  return { secreto, audiencia, expiraEn: env.JWT_EXPIRES_IN?.trim() || '3d' };
}

export const authConfig = readAuthConfig(process.env);
