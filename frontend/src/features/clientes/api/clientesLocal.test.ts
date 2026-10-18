import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { subirAceptando } from '../../../test/rechazos';
import { buscarClientes, buscarPorTelefono, editarCliente, registrarCliente, telefonoDeOtro, validarCliente } from './clientesLocal';

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

describe('Editar un cliente en la base local — SPEC-KRILINXI-014', () => {
  // La de los tests de arriba: ya sincronizada, fuera de la cola.
  const rosa = ROSA;

  it('guarda el cambio y lo encola como edición con solo lo que cambió', async () => {
    const { control, db } = await baseConRosa();

    const resultado = await editarCliente(control.base, rosa, { nombre: 'Rosa Quispe Mamani', telefono: '70123456' });

    expect(resultado).toEqual({ tipo: 'editado', cliente: { ...rosa, nombre: 'Rosa Quispe Mamani' } });
    expect(await control.base.consultar('SELECT nombre FROM clientes')).toEqual([{ nombre: 'Rosa Quispe Mamani' }]);
    // Lo que sube: un PATCH con el nombre y nada más.
    expect(await subirAceptando(db)).toEqual([
      expect.objectContaining({ metodo: 'PATCH', ruta: `/clientes/${rosa.id}`, cuerpo: { nombre: 'Rosa Quispe Mamani' } }),
    ]);
  });

  it('normaliza el teléfono antes de guardarlo y de compararlo', async () => {
    const { control, db } = await baseConRosa();

    // "70 12-34 56" es el mismo teléfono que tiene: no es un cambio.
    expect(await editarCliente(control.base, rosa, { nombre: rosa.nombre, telefono: '70 12-34 56' })).toEqual({
      tipo: 'sin-cambios',
    });
    const resultado = await editarCliente(control.base, rosa, { nombre: rosa.nombre, telefono: '70 99-88 77' });

    expect(resultado).toEqual({ tipo: 'editado', cliente: { ...rosa, telefono: '70998877' } });
    expect((await subirAceptando(db)).map((p) => p.cuerpo)).toEqual([{ telefono: '70998877' }]);
  });

  it('sin ningún cambio no escribe ni encola nada', async () => {
    const { control, db } = await baseConRosa();

    expect(await editarCliente(control.base, rosa, { nombre: '  Rosa Quispe ', telefono: '70123456' })).toEqual({
      tipo: 'sin-cambios',
    });
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('rechaza un teléfono que ya es de otro cliente, diciendo de quién es', async () => {
    const { control, db, sembrar } = await baseConRosa();
    await sembrar('clientes', [{ id: randomUUID(), nombre: 'Juan Mamani', telefono: '70555555' }]);

    expect(await editarCliente(control.base, rosa, { nombre: rosa.nombre, telefono: '70555555' })).toEqual({
      tipo: 'invalido',
      errores: { telefono: telefonoDeOtro('Juan Mamani') },
    });
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('no deja el nombre ni el teléfono vacíos', async () => {
    const { control } = await baseConRosa();

    expect(await editarCliente(control.base, rosa, { nombre: ' ', telefono: '-' })).toEqual({
      tipo: 'invalido',
      errores: { nombre: 'Escribí el nombre del cliente.', telefono: 'Escribí el número de teléfono del cliente.' },
    });
  });
});

describe('Un teléfono repetido en la tablet — SPEC-KRILINXI-021', () => {
  it('validarCliente encuentra al otro dueño del teléfono aunque el propio también esté en la tablet', async () => {
    // El cliente rechazado sigue en la tablet hasta la próxima sincronización, y el de la otra
    // tablet ya bajó: dos filas con el mismo teléfono. La del propio no tiene que tapar a la otra.
    const { control, sembrar } = await baseLocalDePrueba();
    const propio = { id: '00000000-0000-4000-8000-000000000001', nombre: 'Rosa Q.', telefono: '70123456' };
    const otro = { id: '00000000-0000-4000-8000-000000000002', nombre: 'Rosa Quispe', telefono: '70123456' };
    await sembrar('clientes', [propio, otro]);

    const { ocupadoPor } = await validarCliente(control.base, { nombre: 'Rosa Q.', telefono: '70123456' }, propio.id);

    expect(ocupadoPor?.id).toBe(otro.id);
  });
});

describe('Buscar clientes mientras se escribe — SPEC-KRILINXI-032', () => {
  const JOSE = { id: randomUUID(), nombre: 'José Quispe', telefono: '71234567', carnet: '9988776 LP' };
  const NUNEZ = { id: randomUUID(), nombre: 'Ana Núñez', telefono: '60001111', carnet: null };
  const PEDRO = { id: randomUUID(), nombre: 'Pedro Rosales', telefono: '60002222', carnet: null };

  async function baseConVarios(extra: Record<string, unknown>[] = []) {
    const prueba = await baseLocalDePrueba();
    await prueba.sembrar('clientes', [ROSA, JOSE, NUNEZ, PEDRO, ...extra]);
    return prueba.control.base;
  }

  const nombres = async (texto: string, extra?: Record<string, unknown>[]) =>
    (await buscarClientes(await baseConVarios(extra), texto)).resultados.map((c) => c.nombre);

  it('por cualquier parte del nombre, sin importar tildes ni mayúsculas', async () => {
    expect(await nombres('jose qui')).toEqual(['José Quispe']);
    expect(await nombres('NUÑEZ')).toEqual(['Ana Núñez']);
    expect(await nombres('nunez')).toEqual(['Ana Núñez']);
  });

  it('cada palabra tiene que coincidir: "rosa 7012" no trae a todas las Rosas', async () => {
    expect(await nombres('rosa 7012')).toEqual(['Rosa Quispe']);
  });

  it('por parte del teléfono, con la misma normalización que el backend', async () => {
    expect(await nombres('0123-4')).toEqual(['Rosa Quispe']);
    expect(await nombres('6000')).toEqual(['Ana Núñez', 'Pedro Rosales']);
  });

  it('por el carnet', async () => {
    expect(await nombres('998877')).toEqual(['José Quispe']);
    expect(await nombres('776 lp')).toEqual(['José Quispe']);
  });

  it('primero los que empiezan con lo escrito, después los que lo tienen en el medio', async () => {
    // "ros": Rosa empieza así; Pedro Rosales lo tiene al principio de su segunda palabra.
    expect(await nombres('ros')).toEqual(['Rosa Quispe', 'Pedro Rosales']);
  });

  it('con menos de 2 letras o 3 dígitos no busca', async () => {
    expect(await nombres('r')).toEqual([]);
    expect(await nombres('70')).toEqual([]);
  });

  it('muestra como mucho 6, y avisa si hay más', async () => {
    const muchos = Array.from({ length: 8 }, (_, i) => ({ id: randomUUID(), nombre: `Marta ${i}`, telefono: `6100000${i}` }));
    const base = await baseConVarios(muchos);
    const { resultados, hayMas } = await buscarClientes(base, 'marta');
    expect(resultados).toHaveLength(6);
    expect(hayMas).toBe(true);
    expect(await buscarClientes(base, 'jose')).toMatchObject({ hayMas: false });
  });

  it('un % escrito se busca tal cual, no trae a todos', async () => {
    expect(await nombres('%%')).toEqual([]);
  });
});
