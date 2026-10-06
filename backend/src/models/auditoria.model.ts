// Model de auditoría: el único sitio que escribe en `auditoria` — SPEC-ALE186-010.
//
// La regla es que una escritura y su fila de auditoría ocurren las dos o ninguna.
// No hay triggers (CLAUDE.md, sección 6), así que eso se consigue igual que en
// entregas (SPEC-ALE186-006): las dos van en UNA sentencia, encadenadas con un
// CTE. Este archivo no ejecuta esas sentencias —las ejecuta cada model, que es
// el dueño de su tabla—: arma las piezas de SQL para que los cinco models no
// repitan la misma plomería con pequeñas diferencias.
//
//   WITH escrita  AS (INSERT / UPDATE … RETURNING …),
//        auditada AS (INSERT INTO auditoria … SELECT … FROM escrita)
//   SELECT <columnas> FROM escrita
//
// Si `escrita` no devuelve filas (un reintento que chocó con ON CONFLICT DO
// NOTHING, una orden que no cumplía las condiciones), `auditada` no tiene de
// dónde sacar la suya y no inserta nada. Por eso un reintento no deja una
// segunda fila, sin un solo `if`.
import { pool } from '../db/pool.js';
import type { AccionAuditoria } from '../utils/dominio.js';

/** Las tablas que se auditan. Es el valor de `tabla_afectada`. */
export type TablaAuditada = 'clientes' | 'ordenes' | 'pagos' | 'entregas' | 'usuarios';

export interface Registro {
  /** Quién lo hizo. Siempre el de la sesión, nunca uno que venga en el cuerpo. */
  usuarioId: string;
  accion: AccionAuditoria;
  tabla: TablaAuditada;
}

/**
 * Encadena la escritura con su fila de auditoría, en una sola sentencia.
 *
 * - `escritura` es un INSERT o UPDATE con `RETURNING`, que tiene que devolver
 *   `id` (es el `registro_id`) y, si `conValoresAnteriores`, una columna
 *   `valores_anteriores` (ver `valoresAnteriores`).
 * - `valores` son sus parámetros; los de la auditoría van a continuación, así
 *   que la escritura no tiene que saber cuántos son.
 * - `ctesPrevios` es para una escritura que ya necesitaba su propio CTE, como
 *   la entrega: un CTE que modifica datos tiene que estar en el nivel de arriba
 *   del WITH, no anidado dentro de otro.
 *
 * Con `conValoresAnteriores`, una edición que no cambió nada (`'{}'`) no deja
 * fila: no hay nada que contar.
 */
export function conAuditoria(
  escritura: { sql: string; valores: unknown[]; columnas: string; ctesPrevios?: string },
  registro: Registro & { conValoresAnteriores?: boolean },
): { sql: string; valores: unknown[] } {
  const n = escritura.valores.length;
  const anteriores = registro.conValoresAnteriores === true ? 'escrita.valores_anteriores' : 'NULL';
  const filtro =
    registro.conValoresAnteriores === true ? `WHERE escrita.valores_anteriores <> '{}'::jsonb` : '';
  const previos = escritura.ctesPrevios === undefined ? '' : `${escritura.ctesPrevios},\n`;

  return {
    sql: `WITH ${previos}escrita AS (
  ${escritura.sql}
),
auditada AS (
  INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id, valores_anteriores)
  SELECT $${n + 1}::uuid, $${n + 2}::accion_auditoria, $${n + 3}, escrita.id, ${anteriores}
    FROM escrita
  ${filtro}
)
SELECT ${escritura.columnas} FROM escrita`,
    valores: [...escritura.valores, registro.usuarioId, registro.accion, registro.tabla],
  };
}

export interface ColumnaAuditada {
  columna: string;
  /** Se guarda como texto. Para el dinero: un número en JSON es un float al leerlo. */
  comoTexto?: boolean;
  /**
   * No se guarda el valor, solo `{ <marca>: true }`. Para `password_hash`: la
   * auditoría no puede ser otro sitio de donde sacar el hash. La clave la elige
   * el model, y no repite el nombre de la columna a propósito.
   */
  soloMarca?: string;
}

/**
 * La expresión SQL de `valores_anteriores` de un UPDATE: un objeto JSON con las
 * columnas que cambiaron y el valor que tenían antes.
 *
 * Espera la forma `UPDATE <tabla> AS c … FROM (SELECT … FOR UPDATE) AS antes`:
 * en el `RETURNING`, `antes` es la fila como estaba y `c` como quedó. Una
 * columna que se mandó con el mismo valor que ya tenía no aparece
 * (`IS DISTINCT FROM`, que trata bien los NULL), así que reenviar un PATCH
 * idéntico no inventa un cambio.
 *
 * Los nombres de columna salen de la lista cerrada de cada model, nunca del
 * cuerpo de la petición: son lo único que se escribe dentro del SQL.
 */
export function valoresAnteriores(columnas: readonly ColumnaAuditada[]): string {
  if (columnas.length === 0) return `'{}'::jsonb`;

  const partes = columnas.map(({ columna, comoTexto, soloMarca }) => {
    // Un hash nuevo es siempre distinto del anterior (lleva sal), así que una
    // contraseña que se mandó es siempre una contraseña que cambió.
    if (soloMarca !== undefined) return `jsonb_build_object('${soloMarca}', true)`;
    const valor = comoTexto === true ? `antes.${columna}::text` : `antes.${columna}`;
    return `CASE WHEN antes.${columna} IS DISTINCT FROM c.${columna}
               THEN jsonb_build_object('${columna}', ${valor}) ELSE '{}'::jsonb END`;
  });
  return `(${partes.join(' || ')})`;
}

/** `'id, nombre'` → `'c.id, c.nombre'`, para el RETURNING de un UPDATE con `antes`. */
function calificar(columnas: string, alias: string): string {
  return columnas
    .split(',')
    .map((columna) => `${alias}.${columna.trim()}`)
    .join(', ');
}

/**
 * Un UPDATE que devuelve, además de la fila nueva, `valores_anteriores`.
 *
 * `antes` es un SELECT de la misma fila con `FOR UPDATE`: la bloquea, así que
 * lo que se lee como "antes" es exactamente lo que el UPDATE pisa. Si otra
 * petición la estaba cambiando, esta espera y lee la versión que dejó la otra.
 * Las `condiciones` (las del model: id, estado, sucursal…) van dentro de ese
 * SELECT, sobre la tabla sin alias; si la fila no las cumple, `antes` sale
 * vacío y el UPDATE no toca nada.
 *
 * `tabla` y `columnas` son constantes de cada model; `asignaciones`, las
 * `columna = $n` que ya armaba cada uno desde su lista cerrada.
 */
export function updateConAntes(partes: {
  tabla: TablaAuditada;
  asignaciones: readonly string[];
  condiciones: string;
  columnas: string;
  auditadas: readonly ColumnaAuditada[];
}): string {
  return `UPDATE ${partes.tabla} AS c SET ${partes.asignaciones.join(', ')}
    FROM (SELECT ${partes.columnas} FROM ${partes.tabla} WHERE ${partes.condiciones} FOR UPDATE) AS antes
   WHERE c.id = antes.id
  RETURNING ${calificar(partes.columnas, 'c')}, ${valoresAnteriores(partes.auditadas)} AS valores_anteriores`;
}

/**
 * Anota algo que no es una escritura de otra tabla. Hoy, solo el login.
 *
 * Va suelta y no encadenada porque el login no escribe nada más: no hay con
 * qué hacerla atómica.
 */
export async function registrar(registro: Registro & { registroId: string | null }): Promise<void> {
  await pool.query(
    `INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [registro.usuarioId, registro.accion, registro.tabla, registro.registroId],
  );
}
