import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as entregas from '../../src/models/entregas.model.js';
import { contar, crearOrden, escenario, leerOrden, mientrasSeAnula } from '../helpers/baseReal.js';

// Contra Postgres real. El test de `tests/unit/entregas.model.test.ts` comprueba
// que el UPDATE de la orden y el INSERT de la entrega van en la misma sentencia;
// este comprueba lo que eso garantiza: que pasan las dos cosas o ninguna.

function nuevaEntrega(ordenId: string, usuarioId: string, id: string = randomUUID()) {
  return {
    id,
    ordenId,
    tipoRetiro: 'CON_BOLETA',
    retiradoPorNombre: null,
    retiradoPorCarnet: null,
    usuarioEntregaId: usuarioId,
    precioFinal: null,
    fechaEntrega: null,
  } as const;
}

const entregasDe = (ordenId: string) =>
  contar('SELECT count(*) FROM entregas WHERE orden_id = $1', [ordenId]);

describe('Entregas contra la base real — SPEC-ALE186-007', () => {
  it('guarda la entrega, deja la orden ENTREGADO y sin precio final usa el precio_total', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });

    const resultado = await entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), {
      sucursalId: esc.sucursalId,
    });

    expect(resultado).toMatchObject({
      tipo: 'creada',
      entrega: { sucursalId: esc.sucursalId, precioFinal: '45.50' },
    });
    expect((await leerOrden(orden.id)).estado).toBe('ENTREGADO');
  });

  it('un reintento con el mismo id no duplica', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    const entrega = nuevaEntrega(orden.id, esc.usuarioId);

    await entregas.crear(entrega, { sucursalId: null });
    const reintento = await entregas.crear(entrega, { sucursalId: null });

    expect(reintento.tipo).toBe('existente');
    expect(await entregasDe(orden.id)).toBe(1);
  });

  it('es atómica: un id ya usado sobre OTRA orden falla sin dejarla ENTREGADO', async () => {
    // El caso que justifica que la sentencia NO tenga ON CONFLICT DO NOTHING
    // (SPEC-ALE186-006): con él, el UPDATE de la otra orden quedaría aplicado.
    const esc = await escenario();
    const primera = await crearOrden(esc);
    const otra = await crearOrden(esc);
    const id = randomUUID();
    await entregas.crear(nuevaEntrega(primera.id, esc.usuarioId, id), { sucursalId: null });

    const resultado = await entregas.crear(nuevaEntrega(otra.id, esc.usuarioId, id), { sucursalId: null });

    // Responde con la entrega que ya existía (es un reintento por id)...
    expect(resultado).toMatchObject({ tipo: 'existente', entrega: { ordenId: primera.id } });
    // ...y la otra orden quedó exactamente como estaba.
    expect((await leerOrden(otra.id)).estado).toBe('LISTO');
    expect(await entregasDe(otra.id)).toBe(0);
  });

  it('con una anulación sin confirmar, la entrega espera y termina en orden-anulada', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    const { resultado, espero } = await mientrasSeAnula(orden.id, () =>
      entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), { sucursalId: esc.sucursalId }),
    );

    expect(espero).toBe(true);
    expect(resultado.tipo).toBe('orden-anulada');
    expect(await entregasDe(orden.id)).toBe(0);
  });

  it('dos entregas simultáneas a la misma orden dejan exactamente una', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);

    const resultados = await Promise.all([
      entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), { sucursalId: null }),
      entregas.crear(nuevaEntrega(orden.id, esc.usuarioId), { sucursalId: null }),
    ]);

    expect(resultados.map((r) => r.tipo).sort()).toEqual(['creada', 'orden-ya-entregada']);
    expect(await entregasDe(orden.id)).toBe(1);
  });
});
