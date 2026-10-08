import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { limitadorLogin } from '../../src/services/limiteLogin.js';
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
// La hora del servidor sale de Postgres (SPEC-ALE186-015). Acá no hay base: una
// hora fija, que además deja comprobar que llega tal cual a la respuesta.
vi.mock('../../src/models/reloj.model.js', () => ({ ahora: vi.fn(async () => '2026-10-08T14:05:03.123Z') }));
// El login anota en la auditoría (SPEC-ALE186-010). Acá no hay base: el doble
// deja comprobar QUÉ se anota sin escribir nada.
vi.mock('../../src/models/auditoria.model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/models/auditoria.model.js')>()),
  registrar: vi.fn(),
}));

const { buscarPorUsername, buscarPorId } = await import('../../src/models/usuarios.model.js');
const registrarAuditoria = vi.mocked((await import('../../src/models/auditoria.model.js')).registrar);
const buscarPorUsernameMock = vi.mocked(buscarPorUsername);
const buscarPorIdMock = vi.mocked(buscarPorId);

function login(body: Record<string, unknown>) {
  return testApi().post('/api/auth/login').send(body);
}

// El límite de intentos (SPEC-ALE186-016) es un objeto que vive todo el proceso, y
// estos tests hacen logins fallidos con el mismo usuario: sin esto, se sumarían
// entre tests y uno terminaría bloqueado por culpa de los anteriores.
beforeEach(() => {
  limitadorLogin.reiniciar();
});

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

describe('El login queda en la auditoría — SPEC-ALE186-010', () => {
  beforeEach(() => {
    buscarPorUsernameMock.mockReset();
    buscarPorIdMock.mockReset();
    registrarAuditoria.mockReset();
  });

  it('anota LOGIN a nombre de quien entró cuando el login sale bien', async () => {
    const usuario = await usuarioDePrueba();
    buscarPorUsernameMock.mockResolvedValue(usuario);

    const res = await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });

    expect(res.status).toBe(200);
    expect(registrarAuditoria).toHaveBeenCalledExactlyOnceWith({
      usuarioId: usuario.id,
      accion: 'LOGIN',
      tabla: 'usuarios',
      registroId: usuario.id,
    });
  });

  it.each([
    ['la contraseña está mal', async () => usuarioDePrueba(), 'otra-cosa'],
    ['el usuario no existe', async () => null, CONTRASENA_DE_PRUEBA],
    ['la cuenta está dada de baja', async () => usuarioDePrueba({ activo: false }), CONTRASENA_DE_PRUEBA],
  ])('no anota nada cuando %s', async (_caso, guardado, password) => {
    buscarPorUsernameMock.mockResolvedValue(await guardado());

    const res = await login({ username: 'maria', password });

    expect(res.status).toBe(401);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  it('no anota la renovación: pasa en cada reconexión y no dice nada nuevo', async () => {
    buscarPorIdMock.mockResolvedValue(await usuarioDePrueba());

    const res = await testApi().post('/api/auth/renovar').set('Authorization', `Bearer ${tokenDePrueba()}`);

    expect(res.status).toBe(200);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe('La hora del servidor en las respuestas — SPEC-ALE186-015', () => {
  beforeEach(() => {
    buscarPorUsernameMock.mockReset();
    buscarPorIdMock.mockReset();
  });

  it('el login y la renovación traen ahora, y conservan todo lo demás', async () => {
    const usuario = await usuarioDePrueba();
    buscarPorUsernameMock.mockResolvedValue(usuario);
    buscarPorIdMock.mockResolvedValue(usuario);

    const entrar = await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });
    const renovar = await testApi().post('/api/auth/renovar').set('Authorization', `Bearer ${tokenDePrueba()}`);

    for (const res of [entrar, renovar]) {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ahora: '2026-10-08T14:05:03.123Z',
        token: expect.any(String),
        tokenPowerSync: expect.any(String),
        usuario: { id: usuario.id },
      });
    }
  });

  it('un error del login no trae ahora: el formato de error no cambia', async () => {
    buscarPorUsernameMock.mockResolvedValue(null);

    const res = await login({ username: 'nadie', password: 'loquesea' });

    expectApiError(res, { status: 401, codigo: 'NO_AUTENTICADO' });
    expect(res.body).not.toHaveProperty('ahora');
  });
});

describe('Límite de intentos en el login — SPEC-ALE186-016', () => {
  beforeEach(() => {
    buscarPorUsernameMock.mockReset();
    buscarPorIdMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** `veces` logins fallidos seguidos con ese usuario. */
  async function fallar(username: string, veces: number) {
    for (let i = 0; i < veces; i++) await login({ username, password: 'no-es-esta' });
  }

  it('al sexto intento responde 429 con Retry-After, aunque la contraseña sea la correcta', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba());
    await fallar('maria', 5);

    const res = await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });

    expectApiError(res, { status: 429, codigo: 'DEMASIADOS_INTENTOS' });
    expect(res.body.error.mensaje).toMatch(/Esperá 5 minutos/);
    expect(res.headers['retry-after']).toBe('300');
  });

  it('mientras está bloqueado no consulta la base ni anota nada', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba());
    await fallar('maria', 5);
    buscarPorUsernameMock.mockClear();
    registrarAuditoria.mockClear();

    await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });

    expect(buscarPorUsernameMock).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  it('a los 4:59 sigue bloqueado y a los 5:00 vuelve a dejar entrar', async () => {
    // El limitador usa el reloj del proceso (`Date.now`): con este reloj falso se
    // prueban 5 minutos sin esperarlos.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba());
    await fallar('maria', 5);

    vi.setSystemTime(new Date('2026-10-08T10:04:59Z'));
    const casi = await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });
    vi.setSystemTime(new Date('2026-10-08T10:05:00Z'));
    const ya = await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });

    expect(casi.status).toBe(429);
    expect(casi.headers['retry-after']).toBe('1');
    expect(ya.status).toBe(200);
  });

  it('entrar bien reinicia el contador: 4 fallos, entrar, 4 fallos más no bloquea', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba());
    await fallar('maria', 4);
    expect((await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA })).status).toBe(200);
    await fallar('maria', 4);

    expect((await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA })).status).toBe(200);
  });

  it('los fallos de un usuario no bloquean a otro', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba({ username: 'rosa' }));
    await fallar('maria', 5);

    expect((await login({ username: 'rosa', password: CONTRASENA_DE_PRUEBA })).status).toBe(200);
  });

  it('bloquea igual un usuario que no existe, con la misma respuesta', async () => {
    buscarPorUsernameMock.mockResolvedValue(null);
    await fallar('nadie', 5);

    const res = await login({ username: 'nadie', password: 'loquesea' });

    expectApiError(res, { status: 429, codigo: 'DEMASIADOS_INTENTOS' });
    expect(res.body.error.mensaje).toMatch(/Esperá 5 minutos/);
  });

  it('una cuenta dada de baja con su contraseña correcta cuenta como fallo, y también se bloquea', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba({ activo: false }));
    for (let i = 0; i < 5; i++) await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA });

    expectApiError(await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA }), {
      status: 429,
      codigo: 'DEMASIADOS_INTENTOS',
    });
  });

  it('una petición sin contraseña responde 400 y no cuenta como intento', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba());
    for (let i = 0; i < 10; i++) expect((await login({ username: 'maria' })).status).toBe(400);

    expect((await login({ username: 'maria', password: CONTRASENA_DE_PRUEBA })).status).toBe(200);
  });

  it('la renovación no se limita', async () => {
    buscarPorUsernameMock.mockResolvedValue(await usuarioDePrueba());
    buscarPorIdMock.mockResolvedValue(await usuarioDePrueba());
    await fallar('maria', 5);

    const res = await testApi().post('/api/auth/renovar').set('Authorization', `Bearer ${tokenDePrueba()}`);

    expect(res.status).toBe(200);
  });
});
