import { describe, expect, it } from 'vitest';
import { dosTabletsConLaMismaRosa, ORDEN, ROSA_DE_LA_OTRA_TABLET } from '../../../test/clienteRepetido';
import { subirAceptando } from '../../../test/rechazos';
import { buscarMismoCliente, usarMismoCliente } from './corregirLocal';
import { listarParaCorregir } from './paraCorregirLocal';

describe('Es el mismo cliente: encontrarlo — SPEC-KRILINXI-021', () => {
  it('ofrece al cliente que ya existe con ese teléfono, sin confundirlo con el rechazado', async () => {
    const { control, cliente } = await dosTabletsConLaMismaRosa();
    expect(await buscarMismoCliente(control.base, cliente)).toEqual(
      expect.objectContaining({ id: ROSA_DE_LA_OTRA_TABLET, nombre: 'Rosa Quispe' }),
    );
  });

  it('no ofrece nada si la tablet todavía no conoce al otro cliente', async () => {
    const { control, cliente } = await dosTabletsConLaMismaRosa({ bajaLaOtra: false });
    expect(await buscarMismoCliente(control.base, cliente)).toBeNull();
  });
});

describe('Es el mismo cliente: pasar la ropa — SPEC-KRILINXI-021', () => {
  it('vuelve a mandar la ropa con el cliente que existe y el mismo id, y después su adelanto tal cual', async () => {
    const { control, db, cliente } = await dosTabletsConLaMismaRosa();
    const existente = await buscarMismoCliente(control.base, cliente);
    if (!existente) throw new Error('Falta el cliente existente.');

    expect(await usarMismoCliente(control.base, cliente, existente)).toEqual({ boletas: 1 });

    expect(await listarParaCorregir(control.base)).toEqual([]);
    const pedidos = await subirAceptando(db);
    // Primero la ropa, después el cobro que le apunta. El cliente repetido no se vuelve a mandar.
    expect(pedidos.map((p) => p.ruta)).toEqual(['/ordenes', '/pagos']);
    expect(pedidos[0]?.cuerpo).toEqual(expect.objectContaining({ id: ORDEN, cliente_id: ROSA_DE_LA_OTRA_TABLET }));
    expect(pedidos[1]?.cuerpo).toEqual(expect.objectContaining({ orden_id: ORDEN, monto: '20.00' }));
  });

  it('la ropa queda en la tablet a nombre del cliente que existe', async () => {
    const { control, cliente } = await dosTabletsConLaMismaRosa();
    const existente = await buscarMismoCliente(control.base, cliente);
    if (!existente) throw new Error('Falta el cliente existente.');
    await usarMismoCliente(control.base, cliente, existente);

    expect(await control.base.consultar('SELECT cliente_id FROM ordenes WHERE id = ?', [ORDEN])).toEqual([
      { cliente_id: ROSA_DE_LA_OTRA_TABLET },
    ]);
  });

  it('si algo falla a mitad de camino, no cambia nada', async () => {
    const { control, db, cliente } = await dosTabletsConLaMismaRosa();
    const existente = await buscarMismoCliente(control.base, cliente);
    if (!existente) throw new Error('Falta el cliente existente.');
    // Una base que falla en la última sentencia de la transacción.
    const rota = {
      ...control.base,
      ejecutarJuntas: (sentencias: readonly { sql: string; parametros?: unknown[] }[]) =>
        control.base.ejecutarJuntas([...sentencias, { sql: 'INSERT INTO tabla_que_no_existe VALUES (1)' }]),
    };

    await expect(usarMismoCliente(rota, cliente, existente)).rejects.toThrow();

    expect(await listarParaCorregir(control.base)).toHaveLength(3);
    expect(await db.getCrudBatch()).toBeNull();
  });
});
