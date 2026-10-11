// El costo de bcrypt, en un solo lugar — SPEC-ALE186-022.
//
// Antes estaba escrito dos veces (el alta de usuarios y la semilla del admin):
// si alguien cambiaba uno, una cuenta podía quedar más barata de atacar que otra.
//
// Qué es el costo: bcrypt repite su cálculo 2^costo veces. Con 10 tarda ~50 ms,
// que nadie nota al entrar pero que vuelve carísimo probar millones de
// contraseñas contra un hash robado. Cada +1 duplica el tiempo.
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { config } from '../config.js';

/** El de verdad: producción, desarrollo, la semilla. */
export const COSTE_PRODUCCION = 10;

/**
 * Solo para los tests (~1 ms). Las contraseñas de los tests son de mentira y
 * no protegen nada; con costo 10, la suite contra la base real hacía fila en
 * bcrypt y se pasaba de tiempo cuando la máquina estaba cargada. 4 es el mínimo
 * que acepta bcrypt.
 */
export const COSTE_TESTS = 4;

/**
 * El costo para un `NODE_ENV` dado. Baja SOLO con `test` exacto, que lo ponen
 * las configs de Vitest: cualquier otro valor —o ninguno, o un typo como
 * "Test"— da el de producción. Equivocarse acá tiene que salir caro en tiempo,
 * nunca barato en seguridad.
 */
export function costeBcrypt(nodeEnv: string | undefined): number {
  return nodeEnv === 'test' ? COSTE_TESTS : COSTE_PRODUCCION;
}

export const COSTE_BCRYPT = costeBcrypt(config.nodeEnv);

/** El hash de una contraseña nueva, con el costo de este proceso. */
export function hashearContrasena(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, COSTE_BCRYPT);
}

/**
 * Un hash que no es de nadie, para el login de un usuario que no existe (ver
 * `verificarContrasena` en `auth.controller.ts`). Tiene que tener el MISMO costo
 * que los hashes reales: si fuera más barato, un usuario inexistente
 * respondería más rápido y el tiempo delataría quién existe. Se arma una vez,
 * al cargar el módulo, sobre un texto al azar que nadie conoce.
 */
export const HASH_SENUELO = bcrypt.hashSync(randomUUID(), COSTE_BCRYPT);
