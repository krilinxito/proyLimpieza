// Construcción de la aplicación Express.
//
// Separada de `server.ts` a propósito: acá se arma la app y allá se la pone a
// escuchar. Así los tests pueden pedir una app entera y hacerle peticiones sin
// ocupar ningún puerto — que es lo que permite correr la suite completa en
// paralelo y sin depender de que el 4000 esté libre.
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export interface OpcionesApp {
  /** Desde qué orígenes puede llamar un navegador. Por defecto, los del .env. */
  corsOrigenes?: string[];
}

export function createApp(opciones: OpcionesApp = {}): Express {
  const app = express();

  // Cabeceras de seguridad estándar (SPEC-ALE186-023): que el navegador no
  // adivine tipos de archivo, que la API no se pueda meter en un iframe, y sin
  // `X-Powered-By`, que le cuenta a cualquiera que esto es Express.
  app.use(helmet());

  // CORS (SPEC-ALE186-023): solo los orígenes de la lista. Un pedido desde otra
  // página web sale sin `Access-Control-Allow-Origin`, y el NAVEGADOR no le deja
  // leer la respuesta. Es una protección del navegador, no del servidor: curl o
  // otro servidor, que no mandan `Origin`, se atienden igual, y para eso está la
  // autenticación.
  app.use(cors({ origin: opciones.corsOrigenes ?? config.corsOrigenes }));
  app.use(express.json());

  app.use('/api', apiRouter);

  // El orden importa y no es negociable: primero las rutas, después el 404
  // (nadie respondió) y al final el manejador de errores, que Express reconoce
  // por tener cuatro parámetros.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
