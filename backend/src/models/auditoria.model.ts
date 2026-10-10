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
import { salteo, type Paginacion } from '../utils/paginacion.js';
import { ZONA_NEGOCIO, horaDelNegocio, type Periodo } from '../utils/periodo.js';

/** Las tablas que se auditan. Es el valor de `tabla_afectada`. */
export const TABLAS_AUDITADAS = ['clientes', 'ordenes', 'pagos', 'entregas', 'usuarios', 'sucursales'] as const;
export type TablaAuditada = (typeof TABLAS_AUDITADAS)[number];

/** Para el filtro `?tabla=` de la consulta — SPEC-ALE186-012. */
export function esTablaAuditada(valor: unknown): valor is TablaAuditada {
  return TABLAS_AUDITADAS.some((tabla) => tabla === valor);
}

/**
 * Por qué una escritura queda marcada para que el admin la revise —
 * SPEC-ALE186-018. Hoy hay un solo motivo: la hizo una cuenta dada de baja.
 *
 * Vive en la columna `auditoria.revision` (SPEC-ALE186-020, migración 001). Antes
 * iba dentro de `valores_anteriores`, porque no había migraciones; la migración
 * movió las que ya existían.
 */
export type Revision = 'cuenta_dada_de_baja';

export interface Registro {
  /** Quién lo hizo. Siempre el de la sesión, nunca uno que venga en el cuerpo. */
  usuarioId: string;
  accion: AccionAuditoria;
  tabla: TablaAuditada;
  /** Si la escritura queda marcada para revisión. Ausente o `null`: no. */
  revision?: Revision | null;
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
  const revision = registro.revision ?? null;
  const anteriores = registro.conValoresAnteriores === true ? 'escrita.valores_anteriores' : 'NULL';
  // La marca de revisión (SPEC-ALE186-018) va en su columna, `revision`, desde
  // SPEC-ALE186-020. Como parámetro, y solo si hay marca: así una escritura normal
  // arma exactamente el mismo SQL de siempre.
  const columnaRevision = revision === null ? '' : ', revision';
  const valorRevision = revision === null ? '' : `, $${n + 4}::text`;
  const filtro =
    registro.conValoresAnteriores === true ? `WHERE escrita.valores_anteriores <> '{}'::jsonb` : '';
  const previos = escritura.ctesPrevios === undefined ? '' : `${escritura.ctesPrevios},\n`;

  return {
    sql: `WITH ${previos}escrita AS (
  ${escritura.sql}
),
auditada AS (
  INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id, valores_anteriores${columnaRevision})
  SELECT $${n + 1}::uuid, $${n + 2}::accion_auditoria, $${n + 3}, escrita.id, ${anteriores}${valorRevision}
    FROM escrita
  ${filtro}
)
SELECT ${escritura.columnas} FROM escrita`,
    valores: [
      ...escritura.valores,
      registro.usuarioId,
      registro.accion,
      registro.tabla,
      ...(revision === null ? [] : [revision]),
    ],
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

// ------------------------------------------------------------------
//  Consulta para el admin — SPEC-ALE186-012
// ------------------------------------------------------------------

export interface FiltrosAuditoria extends Periodo {
  usuarioId: string | null;
  accion: AccionAuditoria | null;
  tabla: TablaAuditada | null;
  registroId: string | null;
  /** Solo lo marcado para revisión (SPEC-ALE186-018). */
  soloParaRevisar: boolean;
}

// La paginación vive en `utils/paginacion.ts` desde SPEC-ALE186-017; se reexporta
// para quien ya la importaba de acá.
export type { Paginacion };

export interface RegistroAuditoria {
  id: string;
  /** `YYYY-MM-DD HH:MM:SS`, en la hora del negocio. */
  fecha: string;
  accion: AccionAuditoria;
  tablaAfectada: TablaAuditada;
  registroId: string | null;
  /** Dónde ocurrió; `null` si no ocurre en una sucursal (ver `SUCURSAL_DE_LA_ACCION`). */
  sucursalId: string | null;
  /**
   * Cuándo pasó de verdad, según el dispositivo: `YYYY-MM-DD HH:MM:SS` en la hora
   * del negocio, o `null` (ver `FECHA_DEL_HECHO`). `fecha`, en cambio, es cuándo
   * llegó al servidor — SPEC-ALE186-015.
   */
  fechaDelHecho: string | null;
  /**
   * Si el admin tiene que revisarla, y por qué; `null` si no — SPEC-ALE186-018.
   * Hoy vive dentro de `valores_anteriores`, pero sale aparte y se quita de
   * `valoresAnteriores`: cuando pase a una columna propia, esta respuesta no cambia.
   */
  revision: Revision | null;
  valoresAnteriores: Record<string, unknown> | null;
  usuario: { id: string; nombreCompleto: string; username: string };
}

interface FilaAuditoria {
  id: string;
  fecha: string;
  accion: AccionAuditoria;
  tabla_afectada: TablaAuditada;
  registro_id: string | null;
  sucursal_id: string | null;
  fecha_del_hecho: string | null;
  revision: Revision | null;
  valores_anteriores: Record<string, unknown> | null;
  usuario_id: string;
  nombre_completo: string;
  username: string;
}

/**
 * En qué sucursal ocurrió cada acción.
 *
 * `auditoria` no tiene `sucursal_id`, y la sucursal NO sale de la persona: si a
 * alguien lo mueven de sucursal, lo que hizo antes tiene que seguir en la
 * anterior. Sale del registro que tocó, que no cambia nunca de sucursal: la
 * orden, el pago y la entrega tienen la suya, y el cliente, la de su alta. Es el
 * mismo criterio que las estadísticas, que suman por la sucursal del pago o de
 * la orden y no por la de quien lo registró.
 *
 * Lo que no ocurre en una sucursal queda en NULL: editar un cliente (es de todo
 * el sistema y la edición no guarda dónde se hizo), el login, y lo que el admin
 * hace con usuarios y sucursales.
 */
const SUCURSAL_DE_LA_ACCION = `CASE a.tabla_afectada
    WHEN 'ordenes'  THEN (SELECT o.sucursal_id FROM ordenes  o WHERE o.id = a.registro_id)
    WHEN 'pagos'    THEN (SELECT p.sucursal_id FROM pagos    p WHERE p.id = a.registro_id)
    WHEN 'entregas' THEN (SELECT e.sucursal_id FROM entregas e WHERE e.id = a.registro_id)
    WHEN 'clientes' THEN CASE WHEN a.accion = 'CREAR'
                              THEN (SELECT c.sucursal_registro_id FROM clientes c WHERE c.id = a.registro_id)
                         END
  END`;

/**
 * Cuándo pasó de verdad cada acción, según el dispositivo — SPEC-ALE186-015.
 *
 * `auditoria.fecha` es cuándo LLEGÓ al servidor. Para una orden cargada sin
 * internet, eso puede ser horas después de que la ropa entró. La fecha oficial
 * la tiene el registro: la `fecha_entrada` de la orden (solo en su alta: editarla
 * no tiene "fecha del hecho" propia), la `fecha_pago` y la `fecha_entrega`. Se
 * saca igual que la sucursal, con un CASE sobre la tabla. Para el resto, NULL.
 */
const FECHA_DEL_HECHO = `CASE a.tabla_afectada
    WHEN 'ordenes'  THEN CASE WHEN a.accion = 'CREAR'
                              THEN (SELECT o.fecha_entrada FROM ordenes o WHERE o.id = a.registro_id)
                         END
    WHEN 'pagos'    THEN (SELECT p.fecha_pago    FROM pagos    p WHERE p.id = a.registro_id)
    WHEN 'entregas' THEN (SELECT e.fecha_entrega FROM entregas e WHERE e.id = a.registro_id)
  END`;

/**
 * Las filas que cumplen los filtros, con su sucursal ya calculada. Es el mismo
 * CTE para la página y para el total: así no pueden filtrar distinto.
 *
 * Parámetros: $1 desde, $2 hasta, $3 zona, $4 usuario, $5 acción, $6 tabla,
 * $7 registro, $8 sucursal, $9 solo lo marcado para revisión. Un filtro en NULL
 * (o `false`, el $9) no filtra.
 *
 * La marca de revisión (SPEC-ALE186-018) es su propia columna desde
 * SPEC-ALE186-020; el filtro "solo lo marcado" usa su índice parcial.
 */
const FILTRADAS = `filtradas AS (
  SELECT * FROM (
    SELECT a.id, a.fecha, a.accion, a.tabla_afectada, a.registro_id,
           a.revision,
           a.valores_anteriores,
           u.id AS usuario_id, u.nombre_completo, u.username,
           ${SUCURSAL_DE_LA_ACCION} AS sucursal_id,
           ${FECHA_DEL_HECHO} AS fecha_del_hecho
      FROM auditoria a
      JOIN usuarios u ON u.id = a.usuario_id
     WHERE ${horaDelNegocio('a.fecha', '$3')}::date BETWEEN $1::date AND $2::date
       AND ($4::uuid IS NULL OR a.usuario_id = $4)
       AND ($5::accion_auditoria IS NULL OR a.accion = $5)
       AND ($6::text IS NULL OR a.tabla_afectada = $6)
       AND ($7::uuid IS NULL OR a.registro_id = $7)
       AND (NOT $9::boolean OR a.revision IS NOT NULL)
  ) con_sucursal
  WHERE ($8::uuid IS NULL OR con_sucursal.sucursal_id = $8)
)`;

function parametrosDe(filtros: FiltrosAuditoria): unknown[] {
  return [
    filtros.desde,
    filtros.hasta,
    ZONA_NEGOCIO,
    filtros.usuarioId,
    filtros.accion,
    filtros.tabla,
    filtros.registroId,
    filtros.sucursalId,
    filtros.soloParaRevisar,
  ];
}

/**
 * Una página de la auditoría, de lo más nuevo a lo más viejo, y cuántas filas
 * cumplen los filtros en total. Solo lee: no anota nada, ni siquiera la consulta.
 *
 * Son dos consultas y no un `count(*) OVER ()` en la misma: con una página más
 * allá de la última, la ventana no tendría filas sobre las que contar, y el
 * total saldría 0 en vez del real.
 */
export async function consultar(
  filtros: FiltrosAuditoria,
  paginacion: Paginacion,
): Promise<{ total: number; registros: RegistroAuditoria[] }> {
  const parametros = parametrosDe(filtros);

  const { rows: conteo } = await pool.query<{ total: number }>(
    `WITH ${FILTRADAS} SELECT count(*)::int AS total FROM filtradas`,
    parametros,
  );
  const { rows } = await pool.query<FilaAuditoria>(
    `WITH ${FILTRADAS}
     SELECT id,
            to_char(${horaDelNegocio('fecha', '$3')}, 'YYYY-MM-DD HH24:MI:SS') AS fecha,
            to_char(${horaDelNegocio('fecha_del_hecho', '$3')}, 'YYYY-MM-DD HH24:MI:SS') AS fecha_del_hecho,
            accion, tabla_afectada, registro_id, sucursal_id, revision, valores_anteriores,
            usuario_id, nombre_completo, username
       FROM filtradas
      ORDER BY filtradas.fecha DESC, id DESC
      LIMIT $10 OFFSET $11`,
    [...parametros, paginacion.porPagina, salteo(paginacion)],
  );

  return {
    total: conteo[0]?.total ?? 0,
    registros: rows.map((fila) => ({
      id: fila.id,
      fecha: fila.fecha,
      accion: fila.accion,
      tablaAfectada: fila.tabla_afectada,
      registroId: fila.registro_id,
      sucursalId: fila.sucursal_id,
      fechaDelHecho: fila.fecha_del_hecho,
      revision: fila.revision,
      valoresAnteriores: fila.valores_anteriores,
      usuario: { id: fila.usuario_id, nombreCompleto: fila.nombre_completo, username: fila.username },
    })),
  };
}
