// Helpers de test para la API HTTP — creados en SPEC-001.
//
// Qué cubren y cuándo usarlos:
//
//   testApi()                 Un cliente HTTP contra la app real, sin abrir
//                             ningún puerto. Es el punto de partida de todo
//                             test de controller o de ruta.
//
//   expectApiError(res, ...)  Comprueba que una respuesta de error cumple el
//                             formato uniforme de la sección 10: el status, el
//                             `codigo` esperado, un `mensaje` en texto para la
//                             persona usuaria, y NADA más (ni stack, ni
//                             nombres de tablas, ni detalles internos).
//                             Úsalo en cada caso de error en vez de repetir a
//                             mano las mismas cuatro aserciones.
//
//   appThatThrows(error)      Una app mínima cuya única ruta lanza el error que
//                             le pases. Sirve para probar el manejador central
//                             sin depender de ningún endpoint real.
//
// Ejemplo de uso en una spec futura:
//
//   const res = await testApi().post('/api/ordenes').send({ numero_boleta: '001' });
//   expectApiError(res, { status: 409, codigo: 'BOLETA_DUPLICADA' });
import express, { type Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../../src/app.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

/** Cliente HTTP contra la aplicación completa. No ocupa ningún puerto. */
export function testApi() {
  return request(createApp());
}

/** App mínima cuya única ruta (GET /boom) lanza el error indicado. */
export function appThatThrows(error: unknown): Express {
  const app = express();

  app.get('/boom', () => {
    throw error;
  });

  app.use(errorHandler);

  return app;
}

interface ErrorEsperado {
  status: number;
  codigo: string;
}

/** Verifica que la respuesta cumpla el formato de error uniforme del proyecto. */
export function expectApiError(res: request.Response, esperado: ErrorEsperado): void {
  expect(res.status).toBe(esperado.status);

  // El cuerpo tiene exactamente una clave, `error`. Si alguien agrega otra
  // (un `stack`, un `sql`, un `trace`), este test lo caza.
  expect(Object.keys(res.body as object)).toEqual(['error']);

  const cuerpo = (res.body as { error: Record<string, unknown> }).error;

  expect(cuerpo.codigo).toBe(esperado.codigo);
  expect(typeof cuerpo.mensaje).toBe('string');
  expect(cuerpo.mensaje as string).not.toHaveLength(0);

  // Solo estas tres claves están permitidas dentro de `error`.
  for (const clave of Object.keys(cuerpo)) {
    expect(['codigo', 'mensaje', 'detalles']).toContain(clave);
  }
}
