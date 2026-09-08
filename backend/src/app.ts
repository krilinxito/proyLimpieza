// Construcción de la aplicación Express.
//
// Separada de `server.ts` a propósito: acá se arma la app y allá se la pone a
// escuchar. Así los tests pueden pedir una app entera y hacerle peticiones sin
// ocupar ningún puerto — que es lo que permite correr la suite completa en
// paralelo y sin depender de que el 4000 esté libre.
import cors from 'cors';
import express, { type Express } from 'express';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api', apiRouter);

  // El orden importa y no es negociable: primero las rutas, después el 404
  // (nadie respondió) y al final el manejador de errores, que Express reconoce
  // por tener cuatro parámetros.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
