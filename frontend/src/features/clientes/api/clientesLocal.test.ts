import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { buscarPorTelefono, registrarCliente } from './clientesLocal';

// Una persona que ya estaba en el sistema: bajó por la sincronización, no está en la cola.
const ROSA = { id: randomUUID(), nombre: 'Rosa Quispe', telefono: '70123456', carnet: '4455667' };

async function baseConRosa() {
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  return prueba;
}

describe('Buscar cliente en la base local — SPEC-KRILINXI-005', () => {
  it('encuentra al cliente por su teléfono, con nombre, teléfono y carnet', async () => {
    const { control } = await baseConRosa();
    expect(await buscarPorTelefono(control.base, '70123456')).toEqual(ROSA);
  });

  it.each(['7012-3456', '70 12 34 56', ' 701-23-456 '])('lo encuentra aunque se escriba "%s"', async (escrito) => {
    const { control } = await baseConRosa();
    expect(await buscarPorTelefono(control.base, escrito)).toMatchObject({ nombre: 'Rosa Quispe' });
  });

  it('devuelve null si nadie tiene ese teléfono', async () => {
    const { control } = await baseConRosa();
    expect(await buscarPorTelefono(control.base, '79999999')).toBeNull();
  });

  it('devuelve null sin consultar si lo escrito no tiene ningún dígito', async () => {
    const { control } = await baseConRosa();
    expect(await buscarPorTelefono(control.base, 'sin teléfono')).toBeNull();
  });

  it('un cliente sin carnet se ve con carnet null, no como texto vacío', async () => {
    const prueba = await baseLocalDePrueba();
    await prueba.sembrar('clientes', [{ id: randomUUID(), nombre: 'Juan', telefono: '71111111' }]);
    expect(await buscarPorTelefono(prueba.control.base, '71111111')).toMatchObject({ carnet: null });
  });
});

describe('Alta de cliente en la base local — SPEC-KRILINXI-005', () => {
  it('guarda al cliente con un id del dispositivo, y lo deja en la cola con nombre, teléfono y carnet', async () => {
    const { control, db } = await baseLocalDePrueba();

    const resultado = await registrarCliente(control.base, {
      nombre: '  Juan Mamani ',
      telefono: '7111-1111',
      carnet: ' 998877 ',
    });

    expect(resultado.tipo).toBe('registrado');
    if (resultado.tipo !== 'registrado') return;
    // Un UUID v4, como los que genera crypto.randomUUID().
    expect(resultado.cliente.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(resultado.cliente).toMatchObject({ nombre: 'Juan Mamani', telefono: '71111111', carnet: '998877' });

    // La cola es lo que PowerSync le va a entregar a uploadData: un PUT por cliente nuevo,
    // con el mismo id que ya ve la pantalla. Es lo que acepta POST /api/clientes.
    const cola = await db.getCrudBatch();
    expect(cola?.crud.map((c) => [c.op, c.table, c.id, c.opData])).toEqual([
      ['PUT', 'clientes', resultado.cliente.id, { nombre: 'Juan Mamani', telefono: '71111111', carnet: '998877' }],
    ]);
  });

  it('lo que acaba de registrar ya se encuentra al buscar', async () => {
    const { control } = await baseLocalDePrueba();
    await registrarCliente(control.base, { nombre: 'Juan', telefono: '71111111', carnet: '' });
    expect(await buscarPorTelefono(control.base, '71111111')).toMatchObject({ nombre: 'Juan', carnet: null });
  });

  it('el carnet es opcional', async () => {
    const { control } = await baseLocalDePrueba();
    const resultado = await registrarCliente(control.base, { nombre: 'Juan', telefono: '71111111', carnet: '   ' });
    expect(resultado).toMatchObject({ tipo: 'registrado', cliente: { carnet: null } });
  });

  it.each([
    ['sin nombre', { nombre: '   ', telefono: '71111111', carnet: '' }, { nombre: 'Escribí el nombre del cliente.' }],
    [
      'sin teléfono',
      { nombre: 'Juan', telefono: 'no sé', carnet: '' },
      { telefono: 'Escribí el número de teléfono del cliente.' },
    ],
    [
      'sin nada',
      { nombre: '', telefono: '', carnet: '' },
      { nombre: 'Escribí el nombre del cliente.', telefono: 'Escribí el número de teléfono del cliente.' },
    ],
  ])('%s no guarda y dice qué falta', async (_caso, datos, errores) => {
    const { control, db } = await baseLocalDePrueba();
    expect(await registrarCliente(control.base, datos)).toEqual({ tipo: 'invalido', errores });
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('si el teléfono ya es de otro cliente, no guarda y devuelve a ese cliente', async () => {
    const { control, db } = await baseConRosa();
    const resultado = await registrarCliente(control.base, { nombre: 'Otra', telefono: '7012 3456', carnet: '' });
    expect(resultado).toEqual({ tipo: 'telefono-ocupado', cliente: ROSA });
    expect(await db.getCrudBatch()).toBeNull();
  });
});

describe('Clientes sin conexión — SPEC-KRILINXI-005', () => {
  it('busca y da de alta sin una sola petición al servidor, aunque no haya internet', async () => {
    // Cualquier petición fallaría como sin red. Ninguna debe llegar a intentarse.
    const servidor = simularApi(() => 'sin-conexion');
    const { control } = await baseConRosa();

    expect(await buscarPorTelefono(control.base, '70123456')).toMatchObject({ nombre: 'Rosa Quispe' });
    expect(await registrarCliente(control.base, { nombre: 'Juan', telefono: '71111111', carnet: '' })).toMatchObject({
      tipo: 'registrado',
    });
    expect(servidor.pedidos).toEqual([]);
  });
});
