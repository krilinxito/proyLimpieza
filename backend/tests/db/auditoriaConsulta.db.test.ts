import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { testApi } from '../helpers/api.js';
import {
  anotarAuditoria,
  contar,
  crearCliente,
  crearSucursal,
  crearUsuario,
  escenario,
} from '../helpers/baseReal.js';
import { cuerpoDeAlta } from '../helpers/clientes.js';
import { cuerpoDeOrden } from '../helpers/ordenes.js';
import { comoAdmin, conSesion } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4). La consulta calcula la sucursal de cada
// acción con subconsultas sobre el registro tocado, y pasa las fechas a la hora
// de Bolivia: las dos cosas solo se pueden comprobar con datos de verdad.
//
// La base de pruebas es compartida por todos los tests de la suite, que también
// escriben auditoría. Por eso cada test filtra por algo suyo —un usuario o una
// sucursal recién creados— y nunca cuenta "todo lo que hay".

async function consultar(query: Record<string, string>, admin?: Record<string, string>) {
  const sesion = admin ?? comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
  return testApi().get('/api/auditoria').query(query).set(sesion);
}

function telefonoNuevo(): string {
  return String(Math.floor(10_000_000 + Math.random() * 89_999_999));
}

describe('Auditoría por sucursal: sale del registro, no de la persona — SPEC-ALE186-012', () => {
  it('después de mover a un empleado de A a B, lo de antes sigue en A y lo nuevo sale en B', async () => {
    const adminId = await crearUsuario({ sucursalId: null, rol: 'ADMIN' });
    const admin = comoAdmin(adminId);
    const esc = await escenario(); // sucursal A, empleado en A, un cliente
    const sucursalB = await crearSucursal();

    const enA = cuerpoDeOrden({ cliente_id: esc.clienteId, numero_boleta: `A-${randomUUID().slice(0, 6)}` });
    await testApi().post('/api/ordenes').set(conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId })).send(enA);

    await testApi().patch(`/api/usuarios/${esc.usuarioId}`).set(admin).send({ sucursal_id: sucursalB });

    const enB = cuerpoDeOrden({ cliente_id: esc.clienteId, numero_boleta: `B-${randomUUID().slice(0, 6)}` });
    await testApi().post('/api/ordenes').set(conSesion({ id: esc.usuarioId, sucursalId: sucursalB })).send(enB);

    const deA = await consultar({ usuario_id: esc.usuarioId, sucursal_id: esc.sucursalId }, admin);
    const deB = await consultar({ usuario_id: esc.usuarioId, sucursal_id: sucursalB }, admin);
    const todas = await consultar({ usuario_id: esc.usuarioId }, admin);

    expect(deA.body.registros.map((r: { registroId: string }) => r.registroId)).toEqual([enA.id]);
    expect(deB.body.registros.map((r: { registroId: string }) => r.registroId)).toEqual([enB.id]);
    // Solo por persona: todo lo que hizo, en las dos sucursales, de lo más nuevo a lo más viejo.
    expect(todas.body.registros.map((r: { registroId: string }) => r.registroId)).toEqual([enB.id, enA.id]);
    expect(todas.body.registros.map((r: { sucursalId: string }) => r.sucursalId)).toEqual([sucursalB, esc.sucursalId]);
  });

  it('el alta de un cliente es de su sucursal; editarlo no es de ninguna, y solo sale sin filtro', async () => {
    const esc = await escenario();
    const sesion = conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId });
    const cliente = cuerpoDeAlta({ telefono: telefonoNuevo() });
    await testApi().post('/api/clientes').set(sesion).send(cliente);
    await testApi().patch(`/api/clientes/${String(cliente.id)}`).set(sesion).send({ nombre: 'Ana María' });
    const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));

    const sinFiltro = await consultar({ registro_id: String(cliente.id) }, admin);
    const conFiltro = await consultar({ registro_id: String(cliente.id), sucursal_id: esc.sucursalId }, admin);

    expect(sinFiltro.body.registros).toMatchObject([
      // Quién, cuándo y qué cambió: dónde no importa.
      { accion: 'EDITAR', sucursalId: null, valoresAnteriores: { nombre: 'Ana Quispe' }, usuario: { id: esc.usuarioId } },
      { accion: 'CREAR', sucursalId: esc.sucursalId },
    ]);
    expect(conFiltro.body.registros.map((r: { accion: string }) => r.accion)).toEqual(['CREAR']);
  });
});

describe('Auditoría: período, hora de Bolivia y páginas — SPEC-ALE186-012', () => {
  it('una acción de las 21:00 en Bolivia cuenta en ese día, aunque en UTC ya sea el siguiente', async () => {
    const usuarioId = await crearUsuario({ sucursalId: await crearSucursal() });
    await anotarAuditoria({ usuarioId, fecha: '2026-03-10T21:00:00-04:00' });

    const ese = await consultar({ usuario_id: usuarioId, desde: '2026-03-10', hasta: '2026-03-10' });
    const siguiente = await consultar({ usuario_id: usuarioId, desde: '2026-03-11', hasta: '2026-03-11' });

    expect(ese.body.total).toBe(1);
    expect(ese.body.registros[0].fecha).toBe('2026-03-10 21:00:00');
    expect(siguiente.body.total).toBe(0);
  });

  it('sin fechas, son los últimos 30 días contando hoy', async () => {
    const usuarioId = await crearUsuario({ sucursalId: await crearSucursal() });
    const haceDias = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
    await anotarAuditoria({ usuarioId, fecha: haceDias(10) });
    await anotarAuditoria({ usuarioId, fecha: haceDias(40) });

    const res = await consultar({ usuario_id: usuarioId });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it('pagina de lo más nuevo a lo más viejo, y el total cuenta todo aunque la página esté vacía', async () => {
    const usuarioId = await crearUsuario({ sucursalId: await crearSucursal() });
    for (const dia of ['01', '02', '03', '04', '05']) {
      await anotarAuditoria({ usuarioId, fecha: `2026-04-${dia}T10:00:00-04:00` });
    }
    const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
    const pagina = (n: string) =>
      consultar({ usuario_id: usuarioId, desde: '2026-04-01', hasta: '2026-04-30', por_pagina: '2', pagina: n }, admin);

    const primera = await pagina('1');
    const tercera = await pagina('3');
    const cuarta = await pagina('4');

    expect(primera.body.registros.map((r: { fecha: string }) => r.fecha)).toEqual([
      '2026-04-05 10:00:00',
      '2026-04-04 10:00:00',
    ]);
    expect(tercera.body).toMatchObject({ pagina: 3, porPagina: 2, total: 5 });
    expect(tercera.body.registros).toHaveLength(1);
    expect(cuarta.body).toMatchObject({ total: 5, registros: [] });
  });
});

describe('Auditoría: lo que nunca hace la consulta — SPEC-ALE186-012', () => {
  it('una contraseña cambiada sale como marca, nunca como hash', async () => {
    const adminId = await crearUsuario({ sucursalId: null, rol: 'ADMIN' });
    const admin = comoAdmin(adminId);
    const empleada = await crearUsuario({ sucursalId: await crearSucursal() });
    await testApi().patch(`/api/usuarios/${empleada}`).set(admin).send({ password: 'clave-nueva-segura' });

    const res = await consultar({ registro_id: empleada, accion: 'EDITAR' }, admin);

    expect(res.body.registros).toMatchObject([{ valoresAnteriores: { contrasena_cambiada: true } }]);
    expect(JSON.stringify(res.body)).not.toMatch(/sin-hash-en-pruebas|\$2[aby]\$/);
  });

  it('consultar no escribe nada: la auditoría queda con las mismas filas', async () => {
    // Se cuenta solo lo de ESTE admin y ESTE cliente: otros archivos de la suite
    // corren en paralelo y escriben auditoría, así que contar "todo" fallaría al azar.
    const adminId = await crearUsuario({ sucursalId: null, rol: 'ADMIN' });
    const admin = comoAdmin(adminId);
    const cliente = await crearCliente();
    const filas = () =>
      contar('SELECT count(*) FROM auditoria WHERE usuario_id = $1 OR registro_id = $2', [adminId, cliente]);
    const antes = await filas();

    await consultar({ registro_id: cliente }, admin);
    await consultar({}, admin);

    expect(await filas()).toBe(antes);
  });
});
