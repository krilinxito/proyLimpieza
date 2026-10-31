import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { CARPETA_DE_MIGRACIONES, migrar } from '../../src/db/migraciones.js';
import { baseDescartable } from '../helpers/baseDescartable.js';

// Contra Postgres real (sección 4): quitar valores de un ENUM no se puede con un doble. Postgres no tiene
// `ALTER TYPE … DROP VALUE`, así que la migración 006 recrea `estado_orden`, y para eso tiene que soltar las dos vistas
// que leen `ordenes.estado` y el DEFAULT de la columna. Lo que hay que probar es lo que le pasa a las boletas que ya
// existían, y eso solo lo dice la base — SPEC-KRILINXI-067.
//
// Se hace en una base descartable: la línea base (que todavía tiene los cinco estados), una boleta en cada estado
// viejo, y recién ahí `migrar`. La base compartida de la suite ya viene migrada y no sirve para ver el "antes".

const aLimpiar: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (aLimpiar.length > 0) await aLimpiar.pop()?.();
});

type EstadoViejo = 'RECIBIDO' | 'EN_PROCESO' | 'LISTO' | 'ENTREGADO' | 'ANULADO';

/** Una base con la línea base y SIN migrar, con una boleta por cada estado de antes. */
async function baseConBoletasDeAntes() {
  const base = await baseDescartable({ conLineaBase: true });
  aLimpiar.push(() => base.borrar());
  const conexion = await base.conectar();
  aLimpiar.push(() => conexion.end());

  const sucursal = randomUUID();
  const cliente = randomUUID();
  const usuario = randomUUID();
  await conexion.query('INSERT INTO sucursales (id, nombre, activa) VALUES ($1, $2, true)', [sucursal, 'Centro']);
  await conexion.query("INSERT INTO clientes (id, nombre, telefono) VALUES ($1, 'Rosa', '70123456')", [cliente]);
  await conexion.query(
    `INSERT INTO usuarios (id, sucursal_id, nombre_completo, username, password_hash, rol)
     VALUES ($1, $2, 'Beto', 'beto', 'sin-hash', 'EMPLEADO')`,
    [usuario, sucursal],
  );

  const boletas = new Map<EstadoViejo, string>();
  const estados: EstadoViejo[] = ['RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'ANULADO'];
  for (const [i, estado] of estados.entries()) {
    const id = randomUUID();
    await conexion.query(
      `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id, descripcion, precio_total, estado)
       VALUES ($1, $2, $3, $4, $5, 'Camisa', 100, $6)`,
      [id, `00000${i + 1}`, cliente, sucursal, usuario, estado],
    );
    boletas.set(estado, id);
  }
  // Un adelanto en la que estaba LISTO, y la entrega de la ENTREGADO: las vistas tienen algo que sumar.
  await conexion.query(
    "INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo, usuario_id) VALUES ($1, $2, $3, 30, 'ADELANTO', 'EFECTIVO', $4)",
    [randomUUID(), boletas.get('LISTO'), sucursal, usuario],
  );
  await conexion.query(
    `INSERT INTO entregas (id, orden_id, sucursal_id, tipo_retiro, usuario_entrega_id, precio_final)
     VALUES ($1, $2, $3, 'CON_BOLETA', $4, 100)`,
    [randomUUID(), boletas.get('ENTREGADO'), sucursal, usuario],
  );
  return { conexion, boletas, sucursal, cliente, usuario };
}

async function valoresDelTipo(conexion: pg.Client): Promise<string[]> {
  const { rows } = await conexion.query<{ valor: string }>(
    "SELECT e.enumlabel AS valor FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'estado_orden' ORDER BY e.enumsortorder",
  );
  return rows.map((fila) => fila.valor);
}

async function estadoDe(conexion: pg.Client, id: string | undefined): Promise<string | undefined> {
  const { rows } = await conexion.query<{ estado: string }>('SELECT estado::text AS estado FROM ordenes WHERE id = $1', [id]);
  return rows[0]?.estado;
}

/** Lo que dicen las vistas, sin la columna `estado` (que es justo lo que la migración cambia). */
async function lecturaDeLasVistas(conexion: pg.Client) {
  const { rows: saldos } = await conexion.query(
    `SELECT orden_id, numero_boleta, precio_total, precio_final, monto_a_cobrar, total_pagado, saldo_pendiente
     FROM vw_saldos ORDER BY numero_boleta`,
  );
  const { rows: pendientes } = await conexion.query('SELECT id, numero_boleta, precio_total FROM vw_pendientes_recoger ORDER BY numero_boleta');
  return { saldos, pendientes };
}

describe('Estados simplificados: la migración 006 y las boletas de antes — SPEC-KRILINXI-067', () => {
  it('antes de migrar el tipo tiene cinco valores; después, cuatro y sin EN_PROCESO ni LISTO', async () => {
    const { conexion } = await baseConBoletasDeAntes();
    expect(await valoresDelTipo(conexion)).toEqual(['RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'ANULADO']);

    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    expect(await valoresDelTipo(conexion)).toEqual(['RECIBIDO', 'ENTREGADO', 'REEMBOLSADO', 'ANULADO']);
  });

  it('la ropa que estaba EN_PROCESO o LISTO pasa a RECIBIDO; las demás quedan como estaban; no se pierde ninguna', async () => {
    const { conexion, boletas } = await baseConBoletasDeAntes();

    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    expect(await estadoDe(conexion, boletas.get('RECIBIDO'))).toBe('RECIBIDO');
    expect(await estadoDe(conexion, boletas.get('EN_PROCESO'))).toBe('RECIBIDO');
    expect(await estadoDe(conexion, boletas.get('LISTO'))).toBe('RECIBIDO');
    expect(await estadoDe(conexion, boletas.get('ENTREGADO'))).toBe('ENTREGADO');
    expect(await estadoDe(conexion, boletas.get('ANULADO'))).toBe('ANULADO');
    const { rows } = await conexion.query<{ cantidad: string }>('SELECT count(*)::text AS cantidad FROM ordenes');
    expect(rows[0]?.cantidad).toBe('5');
  });

  it('las vistas se recrean y dicen lo mismo que antes para las mismas boletas', async () => {
    const { conexion } = await baseConBoletasDeAntes();
    const antes = await lecturaDeLasVistas(conexion);
    expect(antes.saldos).toHaveLength(5);
    // Sin entrega y no anuladas: RECIBIDO, EN_PROCESO y LISTO (la ENTREGADO tiene entrega y la ANULADO está fuera).
    expect(antes.pendientes).toHaveLength(3);

    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    expect(await lecturaDeLasVistas(conexion)).toEqual(antes);
  });

  it('vw_saldos sigue trayendo el estado, ahora con el tipo nuevo', async () => {
    const { conexion, boletas } = await baseConBoletasDeAntes();
    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    const { rows } = await conexion.query<{ estado: string }>('SELECT estado::text AS estado FROM vw_saldos WHERE orden_id = $1', [
      boletas.get('LISTO'),
    ]);

    expect(rows[0]?.estado).toBe('RECIBIDO');
  });

  it('una boleta nueva nace RECIBIDO (el DEFAULT se repuso), acepta REEMBOLSADO y rechaza los estados viejos', async () => {
    const { conexion, sucursal, cliente, usuario } = await baseConBoletasDeAntes();
    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    const insertar = (numero: string, estado?: string) =>
      conexion.query<{ estado: string }>(
        estado === undefined
          ? `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id, descripcion, precio_total)
             VALUES ($1, $2, $3, $4, $5, 'Camisa', 10) RETURNING estado::text AS estado`
          : `INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, usuario_recepcion_id, descripcion, precio_total, estado)
             VALUES ($1, $2, $3, $4, $5, 'Camisa', 10, '${estado}') RETURNING estado::text AS estado`,
        [randomUUID(), numero, cliente, sucursal, usuario],
      );

    expect((await insertar('000100')).rows[0]?.estado).toBe('RECIBIDO');
    expect((await insertar('000101', 'REEMBOLSADO')).rows[0]?.estado).toBe('REEMBOLSADO');
    for (const viejo of ['EN_PROCESO', 'LISTO']) {
      const error = await insertar(`X-${viejo}`, viejo).catch((causa: unknown) => causa);
      // 22P02: valor inválido para el tipo enumerado.
      expect((error as { code?: string }).code).toBe('22P02');
    }
  });

  it('no queda el tipo viejo suelto (estado_orden_viejo) y un segundo migrar no vuelve a tocar nada', async () => {
    const { conexion } = await baseConBoletasDeAntes();
    await migrar(conexion, CARPETA_DE_MIGRACIONES);

    const { rows } = await conexion.query("SELECT typname FROM pg_type WHERE typname LIKE 'estado_orden%'");
    expect(rows.map((fila) => (fila as { typname: string }).typname).sort()).toEqual(['estado_orden']);
    expect(await migrar(conexion, CARPETA_DE_MIGRACIONES)).toEqual([]);
  });
});
