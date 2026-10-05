// Factory de usuarios de prueba — creada en SPEC-ALE186-002.
//
// El primer model del proyecto que tiene filas de verdad es `usuarios`, y los
// que vienen después (clientes, órdenes, pagos) van a necesitar lo mismo: una
// fila coherente que el test pueda pedir en una línea y retocar solo en el
// campo que le importa. Por eso esto es una factory y no un objeto suelto
// copiado en cada archivo — cuando la tabla gane una columna, se toca acá.
//
//   const empleada = await usuarioDePrueba({ contrasena: 'secreta' });
//   const baja     = await usuarioDePrueba({ activo: false });
//
import bcrypt from 'bcrypt';
import type { UsuarioConHash } from '../../src/models/usuarios.model.js';
import { emitirCredenciales, type Sesion } from '../../src/utils/jwt.js';

// bcrypt es lento a propósito: con el coste 10 de producción, cada hash cuesta
// ~100 ms y una suite con veinte usuarios se va a dos segundos de puro esperar.
// El 4 es el mínimo de la librería y sirve igual, porque lo que se prueba es
// que comparar funcione, no lo caro que es.
const COSTE_DE_PRUEBA = 4;

export const CONTRASENA_DE_PRUEBA = 'contrasena-de-prueba';

export async function hashDePrueba(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, COSTE_DE_PRUEBA);
}

interface Opciones extends Partial<Omit<UsuarioConHash, 'passwordHash'>> {
  contrasena?: string;
}

export async function usuarioDePrueba(opciones: Opciones = {}): Promise<UsuarioConHash> {
  const { contrasena = CONTRASENA_DE_PRUEBA, ...campos } = opciones;

  return {
    id: '11111111-1111-1111-1111-111111111111',
    nombreCompleto: 'María Pérez',
    username: 'maria',
    rol: 'EMPLEADO',
    sucursalId: '22222222-2222-2222-2222-222222222222',
    telefono: null,
    activo: true,
    passwordHash: await hashDePrueba(contrasena),
    ...campos,
  };
}

/** El token de la API para esa sesión, firmado con la config de la suite. */
export function tokenDePrueba(sesion: Partial<Sesion> = {}): string {
  return emitirCredenciales({
    id: '11111111-1111-1111-1111-111111111111',
    rol: 'EMPLEADO',
    sucursalId: '22222222-2222-2222-2222-222222222222',
    ...sesion,
  }).token;
}

/**
 * La cabecera de una petición autenticada, lista para `.set()` — SPEC-ALE186-003.
 *
 *   await testApi().post('/api/clientes').set(conSesion()).send({ ... });
 *   await testApi().get('/api/x').set(conSesion({ rol: 'ADMIN', sucursalId: null }));
 *
 * Todo endpoint del negocio va detrás de `requireAuth`, así que cada test de
 * recurso va a necesitar esto. Sin el helper, la misma línea de
 * `Authorization: Bearer ...` se copiaba en cada test.
 */
export function conSesion(sesion: Partial<Sesion> = {}): { Authorization: string } {
  return { Authorization: `Bearer ${tokenDePrueba(sesion)}` };
}
