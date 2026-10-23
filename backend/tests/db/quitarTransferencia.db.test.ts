import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { CARPETA_DE_MIGRACIONES, migrar } from '../../src/db/migraciones.js';
import { baseDescartable } from '../helpers/baseDescartable.js';

// Contra Postgres real (sección 4): quitar un valor de un ENUM no se puede con un doble. Postgres no tiene
// `ALTER TYPE … DROP VALUE`, así que la migración 005 recrea el tipo y vuelve a apuntar la columna. Lo que hay que
// probar es lo que le pasa a los datos que ya existían, y eso solo lo dice la base — SPEC-KRILINXI-055.
//
// Se hace en una base descartable (`baseDescartable`): la línea base, cobros con la forma de antes, y recién ahí
// `migrar`. La base compartida de la suite ya viene migrada y no sirve para ver el "antes".

const aLimpiar: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (aLimpiar.length > 0) await aLimpiar.pop()?.();
});

/** Una base con la línea base y SIN migrar, con una orden y un cobro por cada forma de pago (incluida la transferencia). */
async function baseConCobrosDeAntes() {
  const base = await baseDescartable({ conLineaBase: true });
  aLimpiar.push(() => base.borrar());
  const conexion = await base.conectar();
  aLimpiar.push(() => conexion.end());

  const sucursal = randomUUID();
  const cliente = randomUUID();
  const usuario = randomUUID();
  const orden = randomUUID();
  await conexion.query('INSERT INTO sucursales (id, nombre, activa) VALUES ($1, $2, true)', [sucursal, 'Centro']);
  await conexion.query("INSERT INTO clientes (id, nombre, telefono) VALUES ($1, 'Rosa', '70123456')", [cliente]);
  await conexion.query(
    `INSERT INTO usuarios (id, sucursal_id, nombre_completo, username, password_hash, rol)
     VALUES ($1, $2, 'Beto', 'beto', 'sin-hash', 'EMPLEADO')`,
    [usuario, sucursal],
  );
  await conexion.query(
    `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id, descripcion, precio_total)
     VALUES ($1, '000001', $2, $3, $4, 'Camisa', 100)`,
    [orden, cliente, sucursal, usuario],
  );
  const cobros = new Map<string, string>();
  for (const [metodo, monto] of [['EFECTIVO', '10.00'], ['QR', '20.00'], ['TARJETA', '30.00'], ['TRANSFERENCIA', '40.00']] as const) {
    const id = randomUUID();
    await conexion.query(
      "INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo, usuario_id) VALUES ($1, $2, $3, $4, 'ADELANTO', $5, $6)",
      [id, orden, sucursal, monto, metodo, usuario],
    );
    cobros.set(metodo, id);
  }
  return { conexion, cobros, orden, sucursal, usuario };
}

async function valoresDelTipo(conexion: pg.Client): Promise<string[]> {
  const { rows } = await conexion.query<{ valor: string }>(
    "SELECT e.enumlabel AS valor FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'metodo_pago' ORDER BY e.enumsortorder",
  );
  return rows.map((fila) => fila.valor);
}

describe('Quitar la transferencia: la migración y los datos de antes — SPEC-KRILINXI-055', () => {
  it('antes de migrar el tipo tiene cuatro valores; después, tres y sin la transferencia', async () => {
    const { conexion } = await baseConCobrosDeAntes();
    expect(await valoresDelTipo(conexion)).toEqual(['EFECTIVO', 'QR', 'TARJETA', 'TRANSFERENCIA']);

    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    expect(await valoresDelTipo(conexion)).toEqual(['EFECTIVO', 'QR', 'TARJETA']);
  });

  it('el cobro que era una transferencia pasa a efectivo con su mismo monto, y no se pierde ninguna fila', async () => {
    const { conexion, cobros } = await baseConCobrosDeAntes();

    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    const { rows } = await conexion.query<{ id: string; metodo: string; monto: string }>('SELECT id, metodo, monto FROM pagos');
    expect(rows).toHaveLength(4);
    const porId = new Map(rows.map((fila) => [fila.id, fila]));
    expect(porId.get(cobros.get('TRANSFERENCIA') ?? '')).toMatchObject({ metodo: 'EFECTIVO', monto: '40.00' });
    // Los demás quedan como estaban.
    expect(porId.get(cobros.get('QR') ?? '')).toMatchObject({ metodo: 'QR', monto: '20.00' });
    expect(porId.get(cobros.get('TARJETA') ?? '')).toMatchObject({ metodo: 'TARJETA', monto: '30.00' });
    // Lo cobrado en total no cambia: 10 + 20 + 30 + 40.
    const { rows: suma } = await conexion.query<{ total: string }>('SELECT sum(monto)::text AS total FROM pagos');
    expect(suma[0]?.total).toBe('100.00');
  });

  it('después de migrar la base rechaza una transferencia nueva, y no queda el tipo viejo suelto (metodo_pago_viejo)', async () => {
    const { conexion, orden, sucursal, usuario } = await baseConCobrosDeAntes();
    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    const error = await conexion
      .query("INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo, usuario_id) VALUES ($1, $2, $3, 5, 'ADELANTO', 'TRANSFERENCIA', $4)", [
        randomUUID(),
        orden,
        sucursal,
        usuario,
      ])
      .catch((causa: unknown) => causa);
    // 22P02: valor inválido para el tipo enumerado.
    expect((error as { code?: string }).code).toBe('22P02');

    const { rows } = await conexion.query("SELECT typname FROM pg_type WHERE typname LIKE 'metodo_pago%'");
    expect(rows.map((fila) => (fila as { typname: string }).typname).sort()).toEqual(['metodo_pago']);
  });

  it('un segundo migrar no vuelve a tocar nada', async () => {
    const { conexion } = await baseConCobrosDeAntes();
    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    expect(await migrar(conexion, CARPETA_DE_MIGRACIONES)).toEqual([]);
  });
});
