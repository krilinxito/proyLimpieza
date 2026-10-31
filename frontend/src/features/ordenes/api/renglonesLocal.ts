/**
 * Los renglones de la boleta en la base local — SPEC-KRILINXI-068: leerlos y la sentencia que guarda uno.
 *
 * Mismo patrón que `pagosLocal.ts`: la base llega como argumento y nada habla con la API. Un renglón sube como
 * `POST /api/orden-items` (lo manda la cola, `lib/powersync/conector.ts`), y quien lo escribe lo pone en la misma
 * transacción que su orden (al registrar) o que su entrega (un cargo), **antes** que la entrega: el servidor calcula el
 * precio final con los cargos que ya tiene.
 *
 * La lógica pura (validar, sumar, describir) vive en `../renglones.ts`; esto es solo SQL.
 */
import type { BaseLocal, Fila, Sentencia } from '../../../lib/powersync';
import { esMomentoItem, type MomentoItem } from '../../../lib/dominio';
import { aDecimal, desdeDecimal, subtotal, type Centavos } from '../../../lib/money';
import { sumaDeCargos, type RenglonValido } from '../renglones';
import type { RenglonVisto } from '../types';

export type { RenglonVisto };

/** Un renglón para guardar: el renglón ya validado, de qué orden es y en qué lugar va. */
export type RenglonParaGuardar = {
  renglon: RenglonValido;
  ordenId: string;
  sucursalId: string;
  momento: MomentoItem;
  posicion: number;
};

/**
 * La sentencia que guarda un renglón. Su id es la `clave` con la que se escribió: la genera el dispositivo, así un
 * renglón corregido en Para corregir sigue siendo el mismo (CLAUDE.md §6). La cantidad y el precio van como texto
 * decimal ("2.50"), como los montos, para no pasar por un float.
 */
export function sentenciaRenglon({ renglon, ordenId, sucursalId, momento, posicion }: RenglonParaGuardar): Sentencia {
  return {
    sql: `INSERT INTO orden_items (id, orden_id, sucursal_id, momento, posicion, descripcion, cantidad, precio_unitario)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    parametros: [
      renglon.clave,
      ordenId,
      sucursalId,
      momento,
      posicion,
      renglon.descripcion,
      aDecimal(renglon.cantidad),
      aDecimal(renglon.precioUnitario),
    ],
  };
}

function aRenglon(fila: Fila): RenglonVisto | null {
  const { id, momento, descripcion, cantidad, precio_unitario } = fila;
  if (typeof id !== 'string' || !esMomentoItem(momento) || typeof descripcion !== 'string') return null;
  if (typeof cantidad !== 'string' || typeof precio_unitario !== 'string') return null;
  try {
    const enCentesimas = desdeDecimal(cantidad);
    const precio = desdeDecimal(precio_unitario);
    return { id, momento, descripcion, cantidad: enCentesimas, precioUnitario: precio, subtotal: subtotal(enCentesimas, precio) };
  } catch {
    // Un dato roto no rompe la boleta entera: ese renglón no se muestra.
    console.error(`Renglón guardado inválido: ${id}.`);
    return null;
  }
}

/**
 * Los renglones de varias órdenes en una sola consulta, agrupados por orden: primero los de la boleta y después los
 * cargos, cada grupo en el orden en que se escribieron. Mismo recurso que `pagosPorOrden` en `ropaLocal.ts`.
 */
export async function renglonesPorOrden(base: BaseLocal, ordenIds: readonly string[]): Promise<Map<string, RenglonVisto[]>> {
  const porOrden = new Map<string, RenglonVisto[]>();
  if (ordenIds.length === 0) return porOrden;
  const filas = await base.consultar(
    `SELECT id, orden_id, momento, posicion, descripcion, cantidad, precio_unitario FROM orden_items
      WHERE orden_id IN (${ordenIds.map(() => '?').join(', ')})
      ORDER BY CASE momento WHEN 'INGRESO' THEN 0 ELSE 1 END, posicion, id`,
    [...ordenIds],
  );
  for (const fila of filas) {
    const renglon = aRenglon(fila);
    if (!renglon || typeof fila.orden_id !== 'string') continue;
    porOrden.set(fila.orden_id, [...(porOrden.get(fila.orden_id) ?? []), renglon]);
  }
  return porOrden;
}

/**
 * El precio final de una orden según la tablet: su `precio_total` más los cargos al entregar que tiene. Es la misma cuenta
 * que hace el servidor al recibir la entrega; null si la orden no está en la tablet o su precio no se entiende.
 */
export async function precioFinalLocal(base: BaseLocal, ordenId: string): Promise<Centavos | null> {
  const [orden] = await base.consultar('SELECT precio_total FROM ordenes WHERE id = ?', [ordenId]);
  if (!orden || typeof orden.precio_total !== 'string') return null;
  try {
    const total = desdeDecimal(orden.precio_total);
    const renglones = (await renglonesPorOrden(base, [ordenId])).get(ordenId) ?? [];
    return total + sumaDeCargos(renglones);
  } catch {
    return null;
  }
}

