import { describe, expect, it } from 'vitest';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { SUCURSAL_DE_PRUEBA } from '../../../test/filasDePrueba';
import { subirAceptando, subirRechazandoPorRuta } from '../../../test/rechazos';
import { buscarMismoCliente, usarMismoCliente } from './corregirLocal';
import { listarParaCorregir } from './paraCorregirLocal';

const ROSA_RECHAZADA = '00000000-0000-4000-8000-0000000000a1';
const ROSA_DE_LA_OTRA_TABLET = '00000000-0000-4000-8000-0000000000b1';
const ORDEN = '00000000-0000-4000-8000-0000000000c9';

/**
 * Esta tablet da de alta a Rosa sin internet y le registra ropa con adelanto. Otra tablet ya la
 * había dado de alta: al subir, el cliente vuelve con 409 y la ropa y el adelanto con 400.
 * Después baja la Rosa de la otra tablet.
 */
async function dosTabletsConLaMismaRosa({ bajaLaOtra = true } = {}) {
  const prueba = await baseLocalDePrueba();
  const { base } = prueba.control;
  await base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (?, 'Rosa Q.', '70123456')", [ROSA_RECHAZADA]);
  await base.ejecutar(
    "INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, descripcion, fecha_entrada, precio_total, estado) VALUES (?, '001234', ?, ?, '2 sacos', '2026-10-16T14:00:00.000Z', '50.00', 'RECIBIDO')",
    [ORDEN, ROSA_RECHAZADA, SUCURSAL_DE_PRUEBA],
  );
  await base.ejecutar(
    "INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo, fecha_pago) VALUES (uuid(), ?, ?, '20.00', 'ADELANTO', 'EFECTIVO', '2026-10-16T14:00:00.000Z')",
    [ORDEN, SUCURSAL_DE_PRUEBA],
  );
  await subirRechazandoPorRuta(prueba.db, {
    '/clientes': [409, 'TELEFONO_DUPLICADO', 'Ese teléfono ya es de Rosa Quispe.'],
    '/ordenes': [400, 'VALIDACION', 'Ese cliente no está registrado. Buscalo por su teléfono o dalo de alta.'],
    '/pagos': [400, 'VALIDACION', 'Esa orden no existe en esta sucursal. Revisá el número de boleta.'],
  });
  if (bajaLaOtra) await prueba.sembrar('clientes', [{ id: ROSA_DE_LA_OTRA_TABLET, nombre: 'Rosa Quispe', telefono: '70123456' }]);
  const [cliente] = (await listarParaCorregir(base)).filter((r) => r.tabla === 'clientes');
  if (!cliente) throw new Error('El cliente no quedó para corregir.');
  return { ...prueba, cliente };
}

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
