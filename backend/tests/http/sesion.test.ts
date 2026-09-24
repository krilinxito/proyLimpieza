import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { appConCapas, expectApiError } from '../helpers/api.js';
import { tokenDePrueba } from '../helpers/usuarios.js';
import { requireAuth } from '../../src/middleware/auth.js';
import { requireRol } from '../../src/middleware/roles.js';
import { emitirCredenciales } from '../../src/utils/jwt.js';
import { readAuthConfig } from '../../src/config.js';

// Los middlewares se prueban sobre una app mínima, no sobre un endpoint del
// negocio. Así el test dice exactamente lo que le importa —deja pasar o corta—
// y no se rompe el día que ese endpoint cambie por otro motivo.
const protegida = () => request(appConCapas(requireAuth));

describe('requireAuth — SPEC-ALE186-002', () => {
  it('deja pasar con un token válido y publica la sesión en la petición', async () => {
    const res = await protegida().get('/probar').set('Authorization', `Bearer ${tokenDePrueba()}`);

    expect(res.status).toBe(200);
    expect(res.body.usuario).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      rol: 'EMPLEADO',
      sucursalId: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('corta cuando no viene la cabecera', async () => {
    expectApiError(await protegida().get('/probar'), {
      status: 401,
      codigo: 'NO_AUTENTICADO',
    });
  });

  it('corta cuando la cabecera no tiene el formato Bearer', async () => {
    const res = await protegida().get('/probar').set('Authorization', tokenDePrueba());

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
  });

  it('corta cuando el token está alterado', async () => {
    const alterado = `${tokenDePrueba().slice(0, -3)}xyz`;
    const res = await protegida().get('/probar').set('Authorization', `Bearer ${alterado}`);

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
  });

  it('corta cuando el token está vencido, y lo dice', async () => {
    const cfg = readAuthConfig({
      PS_JWT_SECRET_B64: 'c2VjcmV0by1kZS1wcnVlYmEtZGUtbGEtc3VpdGUtMzI',
      PS_JWT_AUDIENCE: 'lavanderia-test',
      JWT_EXPIRES_IN: '-1s',
    });
    const vencido = emitirCredenciales(
      { id: '11111111-1111-1111-1111-111111111111', rol: 'EMPLEADO', sucursalId: null },
      cfg,
    ).token;

    const res = await protegida().get('/probar').set('Authorization', `Bearer ${vencido}`);

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
    // Vencido no es lo mismo que inválido: acá la app sabe que tiene que pedir
    // la contraseña otra vez, y la persona entiende por qué.
    expect(res.body.error.mensaje).toMatch(/venció/);
  });
});

describe('requireRol — SPEC-ALE186-002', () => {
  const soloAdmin = () => request(appConCapas(requireAuth, requireRol('ADMIN')));

  it('deja pasar al ADMIN', async () => {
    const token = tokenDePrueba({ rol: 'ADMIN', sucursalId: null });
    const res = await soloAdmin().get('/probar').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('responde 403 a un EMPLEADO, no 401', async () => {
    const res = await soloAdmin()
      .get('/probar')
      .set('Authorization', `Bearer ${tokenDePrueba({ rol: 'EMPLEADO' })}`);

    // 403 = sabemos quién sos y no te toca. Un 401 le diría que vuelva a
    // iniciar sesión, y volver a iniciarla no le daría el permiso.
    expectApiError(res, { status: 403, codigo: 'SIN_PERMISO' });
  });

  it('sin sesión responde 401, porque primero hay que saber quién es', async () => {
    const res = await request(appConCapas(requireRol('ADMIN'))).get('/probar');

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
  });
});
