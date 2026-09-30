import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, conectarSesion, ErrorApi, ErrorSinConexion } from './api';
import { cuerpoError, simularApi } from '../test/apiFalsa';
import { archivosFuente } from '../test/arquitectura';

// Cada test que conecta una sesión la desconecta al terminar: el cliente es un módulo
// compartido y un token olvidado aquí se colaría en el test siguiente.
let desconectar: () => void = () => {};
afterEach(() => desconectar());

function conSesion(token: string | null) {
  const alRechazarSesion = vi.fn();
  desconectar = conectarSesion({ obtenerToken: () => token, alRechazarSesion });
  return { alRechazarSesion };
}

/** Espera que la promesa falle y devuelve el error, para poder mirarlo. */
async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('se esperaba que la petición fallara');
}

describe('lib/api: token en cada petición — SPEC-KRILINXI-003', () => {
  it('agrega Authorization: Bearer <token> cuando hay sesión', async () => {
    conSesion('abc.def.ghi');
    const servidor = simularApi(() => ({ status: 200, data: {} }));
    await api.get('/clientes');
    expect(servidor.pedidos[0]?.autorizacion).toBe('Bearer abc.def.ghi');
  });

  it('no manda Authorization cuando no hay sesión', async () => {
    conSesion(null);
    const servidor = simularApi(() => ({ status: 200, data: {} }));
    await api.post('/auth/login', { username: 'rosa', password: 'x' });
    expect(servidor.pedidos[0]?.autorizacion).toBeNull();
  });

  it('pide el token en cada petición, no una sola vez al arrancar', async () => {
    let token = 'viejo';
    desconectar = conectarSesion({ obtenerToken: () => token, alRechazarSesion: () => {} });
    const servidor = simularApi(() => ({ status: 200, data: {} }));
    await api.get('/a');
    token = 'nuevo';
    await api.get('/b');
    expect(servidor.pedidos.map((p) => p.autorizacion)).toEqual(['Bearer viejo', 'Bearer nuevo']);
  });
});

describe('lib/api: errores traducidos — SPEC-KRILINXI-003', () => {
  it('convierte el formato de error uniforme en un ErrorApi con código, mensaje y status', async () => {
    simularApi(() => ({ status: 409, data: cuerpoError('TELEFONO_DUPLICADO', 'Ese teléfono ya está.') }));
    const error = await errorDe(api.post('/clientes', {}));
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({ status: 409, codigo: 'TELEFONO_DUPLICADO', message: 'Ese teléfono ya está.' });
  });

  it('una respuesta que no es del formato uniforme da un ErrorApi con mensaje genérico', async () => {
    simularApi(() => ({ status: 502, data: '<html>Bad Gateway</html>' }));
    const error = await errorDe(api.get('/clientes'));
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({ status: 502, codigo: 'ERROR_INTERNO' });
  });

  it('sin respuesta del servidor da un ErrorSinConexion, distinto de ErrorApi', async () => {
    simularApi(() => 'sin-conexion');
    const error = await errorDe(api.get('/clientes'));
    expect(error).toBeInstanceOf(ErrorSinConexion);
    expect(error).not.toBeInstanceOf(ErrorApi);
  });
});

describe('lib/api: sesión rechazada — SPEC-KRILINXI-003', () => {
  it('avisa que la sesión fue rechazada cuando una petición con token recibe 401', async () => {
    const { alRechazarSesion } = conSesion('vencido');
    simularApi(() => ({ status: 401, data: cuerpoError('NO_AUTENTICADO', 'Tu sesión venció.') }));
    await errorDe(api.get('/clientes'));
    expect(alRechazarSesion).toHaveBeenCalledOnce();
  });

  it('un 401 sin token (contraseña incorrecta al entrar) no cuenta como sesión rechazada', async () => {
    const { alRechazarSesion } = conSesion(null);
    simularApi(() => ({ status: 401, data: cuerpoError('NO_AUTENTICADO', 'No coinciden.') }));
    await errorDe(api.post('/auth/login', {}));
    expect(alRechazarSesion).not.toHaveBeenCalled();
  });

  it('otros errores con token no cierran la sesión', async () => {
    const { alRechazarSesion } = conSesion('valido');
    simularApi(() => ({ status: 403, data: cuerpoError('SIN_PERMISO', 'Solo el administrador.') }));
    await errorDe(api.get('/estadisticas'));
    expect(alRechazarSesion).not.toHaveBeenCalled();
  });
});

describe('lib/api: único dueño de VITE_API_URL — SPEC-KRILINXI-003', () => {
  // `lib/env` es quien la LEE; `lib/api` es el único que la USA. Nadie más la nombra.
  const PERMITIDOS = ['lib/env.ts', 'lib/api.ts'];

  it('ningún otro archivo usa VITE_API_URL ni entorno.apiUrl', () => {
    const intrusos = archivosFuente()
      .filter(({ ruta }) => !PERMITIDOS.includes(ruta))
      .filter(({ fuente }) => /VITE_API_URL|apiUrl/.test(fuente))
      .map(({ ruta }) => ruta);
    expect(intrusos).toEqual([]);
  });
});
