import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { crearConector } from './conector';
import { baseLocalDePrueba } from '../../test/baseLocalDePrueba';
import { cuerpoError, simularApi, type PedidoFalso, type RespuestaFalsa } from '../../test/apiFalsa';

const URL_POWERSYNC = 'http://localhost:8080';

describe('Conector: credenciales — SPEC-KRILINXI-004', () => {
  it('entrega el token de PowerSync de la sesión y la dirección del servicio', async () => {
    const conector = crearConector(URL_POWERSYNC, () => 'token-powersync');
    expect(await conector.fetchCredentials()).toEqual({ endpoint: URL_POWERSYNC, token: 'token-powersync' });
  });

  it('sin sesión no entrega ningún token, y así PowerSync no se conecta', async () => {
    const conector = crearConector(URL_POWERSYNC, () => null);
    expect(await conector.fetchCredentials()).toBeNull();
  });

  it('pregunta por el token en cada conexión: un token renovado se usa sin reconstruir nada', async () => {
    let token = 'viejo';
    const conector = crearConector(URL_POWERSYNC, () => token);
    await conector.fetchCredentials();
    token = 'nuevo';
    expect(await conector.fetchCredentials()).toMatchObject({ token: 'nuevo' });
  });
});

/**
 * La subida — SPEC-KRILINXI-007. Todo sobre la base local de verdad: se escribe como lo haría
 * una pantalla, y se le pasa la base a `uploadData` como lo hace PowerSync cuando hay algo en
 * la cola. Del otro lado, el servidor falso anota cada petición.
 */
async function prepararSubida(responder: (pedido: PedidoFalso) => RespuestaFalsa = () => ({ status: 201, data: {} })) {
  const servidor = simularApi(responder);
  const prueba = await baseLocalDePrueba();
  const subir = () => crearConector(URL_POWERSYNC, () => 'token').uploadData(prueba.db);
  const cola = async () => (await prueba.db.getCrudBatch(100))?.crud ?? [];
  const paraCorregir = () =>
    prueba.control.base.consultar('SELECT tabla, registro_id, operacion, datos, codigo, mensaje FROM para_corregir');
  return { ...prueba, servidor, subir, cola, paraCorregir };
}

const ID_CLIENTE = randomUUID();
const ID_ORDEN = randomUUID();

describe('Subida: cada cambio a su endpoint — SPEC-KRILINXI-007', () => {
  it('manda las altas como POST con el id y las columnas, en el orden de la cola, y la deja vacía', async () => {
    const { control, subir, servidor, cola } = await prepararSubida();
    const { ejecutar } = control.base;
    await ejecutar('INSERT INTO clientes (id, nombre, telefono) VALUES (?, ?, ?)', [ID_CLIENTE, 'Rosa', '70123456']);
    await ejecutar('INSERT INTO ordenes (id, numero_boleta, precio_total, estado) VALUES (?, ?, ?, ?)', [
      ID_ORDEN, '001234', '50.00', 'RECIBIDO',
    ]);
    await ejecutar('INSERT INTO pagos (id, orden_id, monto, tipo, metodo) VALUES (?, ?, ?, ?, ?)', [
      'p-1', ID_ORDEN, '20.00', 'ADELANTO', 'QR',
    ]);
    await ejecutar('INSERT INTO entregas (id, orden_id, tipo_retiro) VALUES (?, ?, ?)', ['e-1', ID_ORDEN, 'CON_BOLETA']);

    await subir();

    expect(servidor.pedidos.map(({ metodo, ruta, cuerpo }) => [metodo, ruta, cuerpo])).toEqual([
      ['POST', '/clientes', { id: ID_CLIENTE, nombre: 'Rosa', telefono: '70123456' }],
      ['POST', '/ordenes', { id: ID_ORDEN, numero_boleta: '001234', precio_total: '50.00', estado: 'RECIBIDO' }],
      ['POST', '/pagos', { id: 'p-1', orden_id: ID_ORDEN, monto: '20.00', tipo: 'ADELANTO', metodo: 'QR' }],
      ['POST', '/entregas', { id: 'e-1', orden_id: ID_ORDEN, tipo_retiro: 'CON_BOLETA' }],
    ]);
    // Con el token de la API, no el de PowerSync: lo pone lib/api.
    expect(await cola()).toEqual([]);
  });

  it('manda las ediciones de clientes y órdenes como PATCH /:id con solo lo que cambió', async () => {
    const { control, sembrar, subir, servidor } = await prepararSubida(() => ({ status: 200, data: {} }));
    await sembrar('clientes', [{ id: ID_CLIENTE, nombre: 'Rosa', telefono: '70123456' }]);
    await sembrar('ordenes', [{ id: ID_ORDEN, numero_boleta: '001234', estado: 'RECIBIDO' }]);
    await control.base.ejecutar('UPDATE clientes SET nombre = ? WHERE id = ?', ['Rosa Quispe', ID_CLIENTE]);
    await control.base.ejecutar('UPDATE ordenes SET estado = ? WHERE id = ?', ['EN_PROCESO', ID_ORDEN]);

    await subir();

    expect(servidor.pedidos.map(({ metodo, ruta, cuerpo }) => [metodo, ruta, cuerpo])).toEqual([
      ['PATCH', `/clientes/${ID_CLIENTE}`, { nombre: 'Rosa Quispe' }],
      ['PATCH', `/ordenes/${ID_ORDEN}`, { estado: 'EN_PROCESO' }],
    ]);
  });

  it('el 200 de un reintento cuenta como subido', async () => {
    const { control, subir, cola } = await prepararSubida(() => ({ status: 200, data: {} }));
    await control.base.ejecutar('INSERT INTO clientes (id, nombre, telefono) VALUES (?, ?, ?)', [ID_CLIENTE, 'Rosa', '1']);
    await subir();
    expect(await cola()).toEqual([]);
  });
});

describe('Subida: sin conexión o con el servidor caído, la cola espera — SPEC-KRILINXI-007', () => {
  it.each<[string, RespuestaFalsa]>([
    ['sin internet', 'sin-conexion'],
    ['con un 500', { status: 500, data: cuerpoError('ERROR_INTERNO', 'Falla') }],
    ['con un 503', { status: 503 }],
    ['con la sesión vencida (401)', { status: 401, data: cuerpoError('NO_AUTENTICADO', 'Venció') }],
  ])('%s: lanza para que PowerSync reintente, y no pierde ni marca nada', async (_caso, respuesta) => {
    const { control, subir, cola, paraCorregir } = await prepararSubida(() => respuesta);
    await control.base.ejecutar('INSERT INTO clientes (id, nombre, telefono) VALUES (?, ?, ?)', [ID_CLIENTE, 'Rosa', '1']);

    await expect(subir()).rejects.toThrow();

    expect((await cola()).map((c) => c.id)).toEqual([ID_CLIENTE]);
    expect(await paraCorregir()).toEqual([]);
  });
});

describe('Subida: lo rechazado se guarda para corregir — SPEC-KRILINXI-007', () => {
  const BOLETA_REPETIDA = cuerpoError(
    'BOLETA_DUPLICADA',
    'Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo.',
  );

  it.each([400, 404, 409])('un %i se guarda con el mensaje del servidor, y la cola sigue con lo de atrás', async (status) => {
    const { control, subir, servidor, cola, paraCorregir } = await prepararSubida((pedido) =>
      pedido.ruta === '/ordenes' ? { status, data: BOLETA_REPETIDA } : { status: 201, data: {} },
    );
    await control.base.ejecutar('INSERT INTO ordenes (id, numero_boleta, precio_total) VALUES (?, ?, ?)', [
      ID_ORDEN, '001234', '50.00',
    ]);
    await control.base.ejecutar('INSERT INTO clientes (id, nombre, telefono) VALUES (?, ?, ?)', [ID_CLIENTE, 'Juan', '2']);

    await subir();

    expect(await paraCorregir()).toEqual([
      {
        tabla: 'ordenes',
        registro_id: ID_ORDEN,
        operacion: 'PUT',
        datos: JSON.stringify({ numero_boleta: '001234', precio_total: '50.00' }),
        codigo: 'BOLETA_DUPLICADA',
        mensaje: 'Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo.',
      },
    ]);
    // Lo de atrás no quedó trabado.
    expect(servidor.pedidos.map((p) => p.ruta)).toEqual(['/ordenes', '/clientes']);
    expect(await cola()).toEqual([]);
  });

  it('guardar para corregir no vuelve a entrar en la cola: la tabla es solo del dispositivo', async () => {
    const { control, subir, cola } = await prepararSubida(() => ({ status: 409, data: BOLETA_REPETIDA }));
    await control.base.ejecutar('INSERT INTO ordenes (id, numero_boleta) VALUES (?, ?)', [ID_ORDEN, '001234']);
    await subir();
    expect(await cola()).toEqual([]);
  });

  it.each<[string, string, unknown[]]>([
    ['un borrado', 'DELETE FROM clientes WHERE id = ?', [ID_CLIENTE]],
    ['editar un pago', 'UPDATE pagos SET monto = ? WHERE id = ?', ['1.00', 'p-1']],
  ])('%s no tiene endpoint: se guarda para corregir sin llamar al servidor', async (_caso, sql, parametros) => {
    const { control, sembrar, subir, servidor, paraCorregir } = await prepararSubida();
    await sembrar('clientes', [{ id: ID_CLIENTE, nombre: 'Rosa', telefono: '1' }]);
    await sembrar('pagos', [{ id: 'p-1', monto: '20.00' }]);
    await control.base.ejecutar(sql, parametros);

    await subir();

    expect(servidor.pedidos).toEqual([]);
    expect(await paraCorregir()).toEqual([expect.objectContaining({ codigo: 'NO_ADMITIDA' })]);
  });
});
