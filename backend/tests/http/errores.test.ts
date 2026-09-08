import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/utils/ApiError.js';
import { appThatThrows, expectApiError, testApi } from '../helpers/api.js';

describe('Formato de error uniforme — SPEC-001', () => {
  it('responde 404 con el formato uniforme para una ruta que no existe', async () => {
    const res = await testApi().get('/api/no-existe');

    expectApiError(res, { status: 404, codigo: 'NO_ENCONTRADO' });
  });

  it('responde 500 sin exponer el stack cuando algo falla sin estar previsto', async () => {
    // El error se registra en el log del servidor; lo silenciamos para que la
    // salida de los tests no parezca rota, pero comprobamos que se registró.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const explota = new Error('la tabla ordenes no existe en el esquema publico');

    const res = await request(appThatThrows(explota)).get('/boom');

    expectApiError(res, { status: 500, codigo: 'ERROR_INTERNO' });

    // Ni el mensaje interno ni el stack salen al cliente: lo que ve quien usa
    // el sistema es una frase que le dice qué hacer.
    const cuerpo = JSON.stringify(res.body);
    expect(cuerpo).not.toContain('ordenes');
    expect(cuerpo).not.toContain('at ');
    expect(cuerpo).not.toContain('Error:');

    // Pero quien mantiene el sistema sí tiene que poder verlo.
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('respeta el status y el código de un ApiError lanzado a propósito', async () => {
    const res = await request(
      appThatThrows(new ApiError(409, 'CONFLICTO', 'Ese dato ya está registrado.')),
    ).get('/boom');

    expectApiError(res, { status: 409, codigo: 'CONFLICTO' });
    expect((res.body as { error: { mensaje: string } }).error.mensaje).toBe(
      'Ese dato ya está registrado.',
    );
  });

  it('incluye los detalles solo cuando el error los trae', async () => {
    const conDetalles = new ApiError(400, 'VALIDACION', 'Revisá los datos.', {
      campo: 'telefono',
    });

    const res = await request(appThatThrows(conDetalles)).get('/boom');

    expectApiError(res, { status: 400, codigo: 'VALIDACION' });
    expect((res.body as { error: { detalles: unknown } }).error.detalles).toEqual({
      campo: 'telefono',
    });
  });
});
