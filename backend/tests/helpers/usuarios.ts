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
import { randomUUID } from 'node:crypto';
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

/**
 * El id de quien está adentro en `tokenDePrueba` / `conSesion` si el test no
 * pide otro — SPEC-ALE186-010. Para comprobar que algo se anota a nombre de la
 * SESIÓN (la auditoría, quién cobró…) sin repetir el UUID en cada test.
 */
export const ID_DE_SESION = '11111111-1111-1111-1111-111111111111';

/** El token de la API para esa sesión, firmado con la config de la suite. */
export function tokenDePrueba(sesion: Partial<Sesion> = {}): string {
  return emitirCredenciales({
    id: ID_DE_SESION,
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

/**
 * Lo que manda el admin para dar de alta un EMPLEADO — SPEC-ALE186-009.
 *
 *   await testApi().post('/api/usuarios').set(comoAdmin()).send(cuerpoDeAltaUsuario());
 *   cuerpoDeAltaUsuario({ rol: 'ADMIN', sucursal_id: undefined })
 *
 * Igual que `cuerpoDeAlta` de clientes: el id lo genera el cliente, así que cada
 * llamada trae uno nuevo, y el username también, para que dos altas de un mismo
 * test no choquen. Un campo puesto en `undefined` desaparece del JSON.
 */
export function cuerpoDeAltaUsuario(campos: Record<string, unknown> = {}): Record<string, unknown> {
  const id = randomUUID();
  return {
    id,
    nombre_completo: 'Rosa Mamani',
    username: `rosa_${id.slice(0, 8)}`,
    password: 'clave-segura-123',
    sucursal_id: '22222222-2222-2222-2222-222222222222',
    ...campos,
  };
}

/** La cabecera de un ADMIN (sin sucursal, sección 3) — SPEC-ALE186-009. */
export function comoAdmin(id = '33333333-3333-3333-3333-333333333333'): { Authorization: string } {
  return conSesion({ id, rol: 'ADMIN', sucursalId: null });
}
