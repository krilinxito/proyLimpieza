import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as clientes from '../../src/models/clientes.model.js';
import * as pagos from '../../src/models/pagos.model.js';
import * as usuarios from '../../src/models/usuarios.model.js';
import { testApi } from '../helpers/api.js';
import {
  auditoriaDe,
  contar,
  crearCliente,
  crearOrden,
  crearSucursal,
  crearUsuario,
  escenario,
  leerOrden,
} from '../helpers/baseReal.js';
import { cuerpoDeAlta } from '../helpers/clientes.js';
import { cuerpoDeEntrega } from '../helpers/entregas.js';
import { cuerpoDeOrden } from '../helpers/ordenes.js';
import { cuerpoDePago } from '../helpers/pagos.js';
import { comoAdmin, conSesion, cuerpoDeAltaUsuario } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4). Con dobles del pool, un test de auditoría
// solo comprobaría que el SQL contiene `INSERT INTO auditoria`. Lo que importa
// solo lo dice la base: que la fila quede, con lo de antes bien leído, que un
// reintento no la duplique, y sobre todo que la escritura y su auditoría sean
// atómicas — si una falla, no queda ninguna.
//
// Casi todo va por HTTP: así también se comprueba que quien queda anotado es el
// de la SESIÓN, no lo que diga el cuerpo.

/** Un teléfono de 8 dígitos que no use nadie: es único en todo el sistema. */
function telefonoNuevo(): string {
  return String(Math.floor(10_000_000 + Math.random() * 89_999_999));
}

/** La cabecera del empleado del escenario. */
function sesionDe(esc: { usuarioId: string; sucursalId: string }) {
  return conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId });
}

describe('Auditoría de las altas — SPEC-ALE186-010', () => {
  it('el alta de un cliente anota CREAR a nombre de la sesión, y el reintento no anota otra', async () => {
    const esc = await escenario();
    const cuerpo = cuerpoDeAlta({ telefono: telefonoNuevo() });

    expect((await testApi().post('/api/clientes').set(sesionDe(esc)).send(cuerpo)).status).toBe(201);
    expect((await testApi().post('/api/clientes').set(sesionDe(esc)).send(cuerpo)).status).toBe(200);

    expect(await auditoriaDe(String(cuerpo.id))).toEqual([
      { usuarioId: esc.usuarioId, accion: 'CREAR', tablaAfectada: 'clientes', valoresAnteriores: null },
    ]);
  });

  it('el alta de una orden anota CREAR a nombre de quien la recibió', async () => {
    const esc = await escenario();
    const cuerpo = cuerpoDeOrden({ cliente_id: esc.clienteId, numero_boleta: `A-${randomUUID().slice(0, 6)}` });

    expect((await testApi().post('/api/ordenes').set(sesionDe(esc)).send(cuerpo)).status).toBe(201);

    expect(await auditoriaDe(String(cuerpo.id))).toEqual([
      { usuarioId: esc.usuarioId, accion: 'CREAR', tablaAfectada: 'ordenes', valoresAnteriores: null },
    ]);
  });

  it('el alta de una cuenta anota CREAR a nombre del admin', async () => {
    const [adminId, sucursalId] = await Promise.all([
      crearUsuario({ sucursalId: null, rol: 'ADMIN' }),
      crearSucursal(),
    ]);
    const cuerpo = cuerpoDeAltaUsuario({ sucursal_id: sucursalId });

    expect((await testApi().post('/api/usuarios').set(comoAdmin(adminId)).send(cuerpo)).status).toBe(201);

    expect(await auditoriaDe(String(cuerpo.id))).toEqual([
      { usuarioId: adminId, accion: 'CREAR', tablaAfectada: 'usuarios', valoresAnteriores: null },
    ]);
  });

  it('la semilla del primer admin no anota nada', async () => {
    const admin = await usuarios.crear({
      nombreCompleto: 'Admin de semilla',
      username: `semilla_${randomUUID().slice(0, 8)}`,
      passwordHash: 'sin-hash-en-pruebas',
      rol: 'ADMIN',
      sucursalId: null,
    });

    expect(admin).not.toBeNull();
    expect(await auditoriaDe(admin?.id ?? '')).toEqual([]);
  });
});

describe('Auditoría de cobros y entregas — SPEC-ALE186-010', () => {
  it('un cobro anota COBRAR a nombre de la sesión, aunque el cuerpo diga otro usuario', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    const otro = await crearUsuario({ sucursalId: esc.sucursalId });
    const cuerpo = cuerpoDePago({ orden_id: orden.id, usuario_id: otro });

    expect((await testApi().post('/api/pagos').set(sesionDe(esc)).send(cuerpo)).status).toBe(201);
    await testApi().post('/api/pagos').set(sesionDe(esc)).send(cuerpo);

    expect(await auditoriaDe(String(cuerpo.id))).toEqual([
      { usuarioId: esc.usuarioId, accion: 'COBRAR', tablaAfectada: 'pagos', valoresAnteriores: null },
    ]);
  });

  it('una entrega anota ENTREGAR, una sola vez, y nada más sobre la orden', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    const cuerpo = cuerpoDeEntrega({ orden_id: orden.id });

    expect((await testApi().post('/api/entregas').set(sesionDe(esc)).send(cuerpo)).status).toBe(201);
    await testApi().post('/api/entregas').set(sesionDe(esc)).send(cuerpo);

    expect(await auditoriaDe(String(cuerpo.id))).toEqual([
      { usuarioId: esc.usuarioId, accion: 'ENTREGAR', tablaAfectada: 'entregas', valoresAnteriores: null },
    ]);
    // El paso a ENTREGADO es consecuencia de la entrega, no una edición aparte.
    expect(await auditoriaDe(orden.id)).toEqual([]);
  });
});

describe('Auditoría de las ediciones — SPEC-ALE186-010', () => {
  it('editar un cliente guarda el valor de antes de lo que cambió, y nada de lo que no', async () => {
    const esc = await escenario();
    const id = await crearCliente();

    const res = await testApi().patch(`/api/clientes/${id}`).set(sesionDe(esc)).send({ nombre: 'Ana María', carnet: null });

    expect(res.status).toBe(200);
    // El carnet ya era NULL: mandarlo no es un cambio.
    expect(await auditoriaDe(id)).toEqual([
      {
        usuarioId: esc.usuarioId,
        accion: 'EDITAR',
        tablaAfectada: 'clientes',
        valoresAnteriores: { nombre: 'Cliente de prueba' },
      },
    ]);
  });

  it('reenviar el mismo PATCH no anota un cambio que no hubo', async () => {
    const esc = await escenario();
    const id = await crearCliente();

    await testApi().patch(`/api/clientes/${id}`).set(sesionDe(esc)).send({ nombre: 'Ana María' });
    await testApi().patch(`/api/clientes/${id}`).set(sesionDe(esc)).send({ nombre: 'Ana María' });

    expect(await auditoriaDe(id)).toHaveLength(1);
  });

  it('anular una orden anota el estado de antes, y el reintento de la anulación no anota otra', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { estado: 'EN_PROCESO' });
    const anular = () => testApi().patch(`/api/ordenes/${orden.id}`).set(sesionDe(esc)).send({ estado: 'ANULADO' });

    expect((await anular()).status).toBe(200);
    expect((await anular()).status).toBe(200);

    expect(await auditoriaDe(orden.id)).toEqual([
      {
        usuarioId: esc.usuarioId,
        accion: 'EDITAR',
        tablaAfectada: 'ordenes',
        valoresAnteriores: { estado: 'EN_PROCESO' },
      },
    ]);
  });

  it('el precio de antes queda como texto, igual que sale de la API', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc, { precioTotal: '45.50' });

    await testApi().patch(`/api/ordenes/${orden.id}`).set(sesionDe(esc)).send({ precio_total: '60.00' });

    expect((await auditoriaDe(orden.id))[0]?.valoresAnteriores).toEqual({ precio_total: '45.50' });
  });

  it('cambiar la contraseña anota que cambió, nunca el hash', async () => {
    const adminId = await crearUsuario({ sucursalId: null, rol: 'ADMIN' });
    const empleada = await crearUsuario({ sucursalId: await crearSucursal() });

    const res = await testApi()
      .patch(`/api/usuarios/${empleada}`)
      .set(comoAdmin(adminId))
      .send({ password: 'clave-nueva-segura', nombre_completo: 'Rosa Mamani' });

    expect(res.status).toBe(200);
    const [fila] = await auditoriaDe(empleada);
    expect(fila).toEqual({
      usuarioId: adminId,
      accion: 'EDITAR',
      tablaAfectada: 'usuarios',
      valoresAnteriores: { nombre_completo: 'Usuario de prueba', contrasena_cambiada: true },
    });
    // Ni el hash viejo (el de crearUsuario) ni ningún hash bcrypt.
    expect(JSON.stringify(fila)).not.toMatch(/sin-hash-en-pruebas|\$2[aby]\$/);
  });

  it('dar de baja anota que estaba activa', async () => {
    const adminId = await crearUsuario({ sucursalId: null, rol: 'ADMIN' });
    const empleada = await crearUsuario({ sucursalId: await crearSucursal() });

    await testApi().patch(`/api/usuarios/${empleada}`).set(comoAdmin(adminId)).send({ activo: false });

    expect((await auditoriaDe(empleada))[0]?.valoresAnteriores).toEqual({ activo: true });
  });
});

describe('Auditoría: la escritura y su fila, las dos o ninguna — SPEC-ALE186-010', () => {
  // Un autor que no existe hace fallar la FK de `auditoria.usuario_id`. Es la
  // forma más simple de que la parte de auditoría falle de verdad dentro de la
  // sentencia, y de ver si la escritura se deshace con ella.
  const NADIE = '00000000-0000-0000-0000-000000000000';

  it('si la auditoría de un alta falla, el cliente no queda guardado', async () => {
    const id = randomUUID();

    await expect(
      clientes.crear({ id, nombre: 'Sin rastro', telefono: telefonoNuevo(), carnet: null, sucursalRegistroId: null }, NADIE),
    ).rejects.toThrow();

    expect(await contar('SELECT count(*) FROM clientes WHERE id = $1', [id])).toBe(0);
  });

  it('si la auditoría de una edición falla, el cliente queda como estaba', async () => {
    const id = await crearCliente();

    await expect(clientes.actualizar(id, { nombre: 'No debería quedar' }, NADIE)).rejects.toThrow();

    expect(await contar(`SELECT count(*) FROM clientes WHERE id = $1 AND nombre = 'Cliente de prueba'`, [id])).toBe(1);
    expect(await auditoriaDe(id)).toEqual([]);
  });

  it('si el cobro falla, no queda una fila de auditoría huérfana', async () => {
    const esc = await escenario();
    const orden = await crearOrden(esc);
    const id = randomUUID();

    // El que falla ahora es el INSERT del pago (FK de usuario_id). La auditoría
    // usaría el mismo autor, así que se prueba el otro sentido: sin pago, sin fila.
    await expect(
      pagos.crear(
        { id, ordenId: orden.id, monto: 100, tipo: 'ADELANTO', metodo: 'EFECTIVO', usuarioId: NADIE, fechaPago: null },
        { sucursalId: null },
      ),
    ).rejects.toThrow();

    expect(await auditoriaDe(id)).toEqual([]);
    expect((await leerOrden(orden.id)).estado).toBe('LISTO');
  });
});

describe('Auditoría del login — SPEC-ALE186-010', () => {
  it('anota LOGIN cuando entra, y nada cuando la contraseña está mal', async () => {
    const [adminId, sucursalId] = await Promise.all([
      crearUsuario({ sucursalId: null, rol: 'ADMIN' }),
      crearSucursal(),
    ]);
    const cuerpo = cuerpoDeAltaUsuario({ sucursal_id: sucursalId });
    await testApi().post('/api/usuarios').set(comoAdmin(adminId)).send(cuerpo);
    const id = String(cuerpo.id);

    const mal = await testApi().post('/api/auth/login').send({ username: cuerpo.username, password: 'no-es-esta' });
    const bien = await testApi().post('/api/auth/login').send({ username: cuerpo.username, password: cuerpo.password });

    expect(mal.status).toBe(401);
    expect(bien.status).toBe(200);
    // El CREAR del alta (a nombre del admin) y un único LOGIN, a nombre de ella.
    expect(await auditoriaDe(id)).toEqual([
      { usuarioId: adminId, accion: 'CREAR', tablaAfectada: 'usuarios', valoresAnteriores: null },
      { usuarioId: id, accion: 'LOGIN', tablaAfectada: 'usuarios', valoresAnteriores: null },
    ]);
  });
});
