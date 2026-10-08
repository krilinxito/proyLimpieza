import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { testApi } from '../helpers/api.js';
import { ahoraEnLaBase, crearSucursal, crearUsuario, escenario } from '../helpers/baseReal.js';
import { cuerpoDeEntrega } from '../helpers/entregas.js';
import { cuerpoDeOrden } from '../helpers/ordenes.js';
import { cuerpoDePago } from '../helpers/pagos.js';
import { comoAdmin, conSesion, cuerpoDeAltaUsuario } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4): `ahora` tiene que ser el reloj de la BASE, y
// la fecha del hecho sale de un CASE sobre las tablas. Las dos cosas solo se
// pueden comprobar con la base de verdad.

/** Un admin de verdad y una cuenta de empleada que puede entrar con contraseña. */
async function cuentaQueEntra() {
  const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
  const cuerpo = cuerpoDeAltaUsuario({ sucursal_id: await crearSucursal() });
  await testApi().post('/api/usuarios').set(admin).send(cuerpo);
  return { username: String(cuerpo.username), password: String(cuerpo.password) };
}

/** Lo que devuelve la consulta de la auditoría sobre un registro. */
async function auditoriaDe(registroId: string) {
  const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
  const res = await testApi().get('/api/auditoria').query({ registro_id: registroId }).set(admin);
  return res.body.registros as { accion: string; fecha: string; fechaDelHecho: string | null }[];
}

describe('La hora del servidor en el login y la renovación — SPEC-ALE186-015', () => {
  it('el login trae ahora, y es la hora de Postgres, no la de Node', async () => {
    const credenciales = await cuentaQueEntra();

    const res = await testApi().post('/api/auth/login').send(credenciales);
    const base = Date.parse(await ahoraEnLaBase());

    expect(res.status).toBe(200);
    expect(res.body.ahora).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Math.abs(Date.parse(res.body.ahora) - base)).toBeLessThan(1000);
    // Lo de antes sigue igual: el frontend actual no se rompe.
    expect(res.body).toMatchObject({ token: expect.any(String), tokenPowerSync: expect.any(String) });
  });

  it('la renovación también trae ahora', async () => {
    const credenciales = await cuentaQueEntra();
    const { body } = await testApi().post('/api/auth/login').send(credenciales);

    const res = await testApi().post('/api/auth/renovar').set('Authorization', `Bearer ${String(body.token)}`);

    expect(res.status).toBe(200);
    expect(Math.abs(Date.parse(res.body.ahora) - Date.parse(await ahoraEnLaBase()))).toBeLessThan(1000);
  });
});

describe('La fecha del hecho en la auditoría — SPEC-ALE186-015', () => {
  it('una orden cargada sin internet muestra cuándo entró la ropa y, aparte, cuándo llegó', async () => {
    const esc = await escenario();
    const empleado = conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId });
    // 18:00 de Bolivia de un día que ya pasó: la tablet la cargó sin internet y la sube hoy.
    const orden = cuerpoDeOrden({
      cliente_id: esc.clienteId,
      numero_boleta: `H-${randomUUID().slice(0, 6)}`,
      fecha_entrada: '2026-01-15T18:00:00-04:00',
    });
    await testApi().post('/api/ordenes').set(empleado).send(orden);

    const [alta] = await auditoriaDe(String(orden.id));

    expect(alta).toMatchObject({ accion: 'CREAR', fechaDelHecho: '2026-01-15 18:00:00' });
    expect(alta?.fecha.startsWith('2026-01-15')).toBe(false);
  });

  it('un cobro y una entrega muestran su propia fecha; una edición, ninguna', async () => {
    const esc = await escenario();
    const empleado = conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId });
    const orden = cuerpoDeOrden({ cliente_id: esc.clienteId, numero_boleta: `H-${randomUUID().slice(0, 6)}` });
    await testApi().post('/api/ordenes').set(empleado).send(orden);
    const pago = cuerpoDePago({ orden_id: orden.id, fecha_pago: '2026-02-01T09:30:00-04:00' });
    await testApi().post('/api/pagos').set(empleado).send(pago);
    await testApi().patch(`/api/ordenes/${String(orden.id)}`).set(empleado).send({ estado: 'LISTO' });
    const entrega = cuerpoDeEntrega({ orden_id: orden.id, fecha_entrega: '2026-02-03T17:45:00-04:00' });
    await testApi().post('/api/entregas').set(empleado).send(entrega);

    expect((await auditoriaDe(String(pago.id)))[0]?.fechaDelHecho).toBe('2026-02-01 09:30:00');
    expect((await auditoriaDe(String(entrega.id)))[0]?.fechaDelHecho).toBe('2026-02-03 17:45:00');
    const deLaOrden = await auditoriaDe(String(orden.id));
    expect(deLaOrden.find((r) => r.accion === 'EDITAR')?.fechaDelHecho).toBeNull();
  });
});
