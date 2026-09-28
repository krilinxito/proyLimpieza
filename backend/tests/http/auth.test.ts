import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError, testApi } from '../helpers/api.js';
import { CONTRASENA_DE_PRUEBA, tokenDePrueba, usuarioDePrueba } from '../helpers/usuarios.js';

// El model se reemplaza por un doble: lo que se prueba acá es el controller
// —qué responde según lo que le diga la base—, no la base. La suite corre en
// cualquier máquina, sin Postgres levantado.
vi.mock('../../src/models/usuarios.model.js', () => ({
  buscarPorUsername: vi.fn(),
  buscarPorId: vi.fn(),
  crear: vi.fn(),
}));

const { buscarPorUsername, buscarPorId } = await import('../../src/models/usuarios.model.js');
const buscarPorUsernameMock = vi.mocked(buscarPorUsername);
const buscarPorIdMock = vi.mocked(buscarPorId);

function login(body: Record<string, unknown>) {
  return testApi().post('/api/auth/login').send(body);
}

describe('POST /api/auth/login — SPEC-ALE186-002', () => {
  beforeEach(() => {
    buscarPorUsernameMock.mockReset();
    buscarPorIdMock.mockReset();
  });

  it('devuelve las dos credenciales y el usuario cuando los datos son correctos', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba());

    const res = await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(typeof res.body.tokenPowerSync).toBe('string');
    expect(res.body.usuario).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      nombreCompleto: 'María Pérez',
      username: 'maria',
      rol: 'EMPLEADO',
      sucursalId: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('nunca devuelve el hash de la contraseña', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba());

    const res = await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });

    // Contra el cuerpo entero serializado, no solo contra las claves que se nos
    // ocurra mirar: si mañana alguien anida el usuario en otro sitio, salta.
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  });

  it('responde lo mismo si el usuario no existe que si la contraseña está mal', async () => {
    buscarPorUsernameMock.mockResolvedValue(null);
    const inexistente = await login({ username: 'nadie', password: 'loquesea' });

    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba());
    const malaContrasena = await login({ username: 'maria', password: 'no-es-esta' });

    expectApiError(inexistente, { status: 401, codigo: 'NO_AUTENTICADO' });
    expectApiError(malaContrasena, { status: 401, codigo: 'NO_AUTENTICADO' });

    // Byte a byte: cualquier diferencia entre las dos respuestas le dice a quien
    // prueba nombres al azar cuáles son usuarios de verdad.
    expect(inexistente.body).toEqual(malaContrasena.body);
  });

  it('rechaza a un usuario dado de baja aunque la contraseña sea correcta', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba({ activo: false }));

    const res = await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
    // Acá el mensaje sí es distinto, y a propósito: solo lo ve quien ya demostró
    // saber la contraseña, así que no revela nada, y le dice qué hacer.
    expect(res.body.error.mensaje).toMatch(/desactivado/);
  });

  it('pide los dos campos cuando falta alguno', async () => {
    expectApiError(await login({ username: 'maria' }), { status: 400, codigo: 'VALIDACION' });
    expectApiError(await login({}), { status: 400, codigo: 'VALIDACION' });
    expectApiError(await login({ username: '   ', password: 'x' }), {
      status: 400,
      codigo: 'VALIDACION',
    });
  });

  it('no consulta la base si la petición viene vacía', async () => {
    await login({});

    // La validación va antes que el model: una petición mal formada no debería
    // costar una consulta.
    expect(buscarPorUsernameMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/renovar — SPEC-ALE186-002', () => {
  beforeEach(() => {
    buscarPorUsernameMock.mockReset();
    buscarPorIdMock.mockReset();
  });

  function renovar(token?: string) {
    const peticion = testApi().post('/api/auth/renovar');
    return token === undefined ? peticion : peticion.set('Authorization', `Bearer ${token}`);
  }

  it('devuelve credenciales nuevas cuando el usuario sigue activo', async () => {
    buscarPorIdMock.mockResolvedValue(await usuarioDePrueba());

    const res = await renovar(tokenDePrueba());

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(typeof res.body.tokenPowerSync).toBe('string');
  });

  it('comprueba `activo` contra la base, no contra el token', async () => {
    // El token se emitió cuando el usuario estaba activo y sigue siendo válido:
    // le quedan días. Que la baja tenga efecto depende enteramente de esta
    // consulta (CLAUDE.md, sección 6).
    buscarPorIdMock.mockResolvedValue(await usuarioDePrueba({ activo: false }));

    const res = await renovar(tokenDePrueba());

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
    expect(buscarPorIdMock).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('rechaza a un usuario que ya no está en la base', async () => {
    buscarPorIdMock.mockResolvedValue(null);

    expectApiError(await renovar(tokenDePrueba()), { status: 401, codigo: 'NO_AUTENTICADO' });
  });

  it('relee el rol de la base, así un cambio de rol entra en la renovación', async () => {
    buscarPorIdMock.mockResolvedValue(await usuarioDePrueba({ rol: 'ADMIN', sucursalId: null }));

    const res = await renovar(tokenDePrueba({ rol: 'EMPLEADO' }));

    expect(res.body.usuario.rol).toBe('ADMIN');
  });

  it('no renueva sin token', async () => {
    expectApiError(await renovar(), { status: 401, codigo: 'NO_AUTENTICADO' });
    expect(buscarPorIdMock).not.toHaveBeenCalled();
  });
});
