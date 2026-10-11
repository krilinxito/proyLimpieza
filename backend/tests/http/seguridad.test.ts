import pg from 'pg';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { paraElLog } from '../../src/middleware/errorHandler.js';
import { appThatThrows, expectApiError } from '../helpers/api.js';

// Todo con una ruta que no existe (`/api/no-existe`): las cabeceras de CORS y de
// helmet se ponen ANTES de llegar a las rutas, así que valen para cualquier
// respuesta, incluido un 404. No hace falta base de datos.
const PERMITIDO = 'https://mostrador.lavanderia.bo';
const app = () => createApp({ corsOrigenes: [PERMITIDO, 'http://localhost:5173'] });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CORS con lista de orígenes — SPEC-ALE186-023', () => {
  it('a un origen de la lista le devuelve ese mismo origen en Access-Control-Allow-Origin', async () => {
    const res = await request(app()).get('/api/no-existe').set('Origin', PERMITIDO);

    expect(res.headers['access-control-allow-origin']).toBe(PERMITIDO);
  });

  it('a un origen que no está en la lista no le devuelve la cabecera, así el navegador bloquea la lectura', async () => {
    const res = await request(app()).get('/api/no-existe').set('Origin', 'https://pagina-cualquiera.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('la consulta previa (OPTIONS) de un origen ajeno tampoco recibe permiso', async () => {
    const res = await request(app())
      .options('/api/clientes')
      .set('Origin', 'https://pagina-cualquiera.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('un pedido sin Origin (curl, otro servidor) se atiende igual: CORS es cosa del navegador', async () => {
    const res = await request(app()).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Cabeceras de seguridad (helmet) — SPEC-ALE186-023', () => {
  it('pone nosniff y la protección contra iframes, y no dice que es Express', async () => {
    const res = await request(app()).get('/api/no-existe');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

/** Un error como el que tira `pg` cuando choca un UNIQUE, con un teléfono en `detail`. */
function telefonoRepetido(): pg.DatabaseError {
  const error = new pg.DatabaseError(
    'duplicate key value violates unique constraint "clientes_telefono_key"',
    120,
    'error',
  );
  error.code = '23505';
  error.constraint = 'clientes_telefono_key';
  error.table = 'clientes';
  error.detail = 'Key (telefono)=(71234567) already exists.';
  error.where = 'SQL statement con 71234567';
  return error;
}

describe('El log de un error no lleva los datos de la fila — SPEC-ALE186-023', () => {
  it('paraElLog conserva lo que sirve para diagnosticar y descarta detail y where', () => {
    const log = paraElLog(telefonoRepetido());

    expect(log).toMatchObject({
      message: 'duplicate key value violates unique constraint "clientes_telefono_key"',
      code: '23505',
      constraint: 'clientes_telefono_key',
      table: 'clientes',
    });
    expect(log).toHaveProperty('stack');
    expect(JSON.stringify(log)).not.toContain('71234567');
  });

  it('copia solo campos conocidos: uno nuevo y desconocido no se cuela', () => {
    const error = Object.assign(new Error('falló'), { parametros: ['71234567', 'Rosa Mamani'] });

    expect(JSON.stringify(paraElLog(error))).not.toContain('71234567');
  });

  it('lo que no es un Error se escribe como texto', () => {
    expect(paraElLog('algo raro')).toBe('algo raro');
  });

  it('ante un error de Postgres no controlado, el log no tiene el teléfono y la respuesta es el 500 de siempre', async () => {
    const escrito = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(appThatThrows(telefonoRepetido())).get('/boom');

    expectApiError(res, { status: 500, codigo: 'ERROR_INTERNO' });
    expect(escrito).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(escrito.mock.calls)).not.toContain('71234567');
    expect(JSON.stringify(escrito.mock.calls)).toContain('clientes_telefono_key');
  });
});
