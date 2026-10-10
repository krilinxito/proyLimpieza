import { describe, expect, it } from 'vitest';
import { testApi } from '../helpers/api.js';
import { auditoriaDe, contar, crearOrden, crearUsuario, escenario } from '../helpers/baseReal.js';
import { cuerpoDeSucursal } from '../helpers/sucursales.js';
import { comoAdmin, cuerpoDeAltaUsuario } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4). Las dos reglas de esta spec —nombre único y
// no cerrar con ropa en el local— las hace cumplir la base: la segunda, como
// condición dentro de la sentencia que escribe; la primera, desde SPEC-ALE186-020,
// un índice único. Con un doble del pool, el test solo vería el SQL; acá se ve
// que frenan.
//
// Todo va por HTTP con un admin de verdad (lo exige la FK de la auditoría).

async function unAdmin() {
  return comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
}

describe('Sucursales contra la base real: alta — SPEC-ALE186-011', () => {
  it('crea la sucursal abierta y anota CREAR a nombre del admin', async () => {
    const adminId = await crearUsuario({ sucursalId: null, rol: 'ADMIN' });
    const cuerpo = cuerpoDeSucursal();

    const res = await testApi().post('/api/sucursales').set(comoAdmin(adminId)).send(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: cuerpo.id, nombre: cuerpo.nombre, activa: true });
    expect(await auditoriaDe(String(cuerpo.id))).toEqual([
      { usuarioId: adminId, accion: 'CREAR', tablaAfectada: 'sucursales', valoresAnteriores: null },
    ]);
  });

  it('el reintento con el mismo id y nombre responde 200 y no duplica ni vuelve a anotar', async () => {
    // El caso fino: el id Y el nombre chocan a la vez. `ON CONFLICT (id)` arbitra
    // sobre el id, así que gana él y el índice del nombre no llega a quejarse.
    const admin = await unAdmin();
    const cuerpo = cuerpoDeSucursal();

    await testApi().post('/api/sucursales').set(admin).send(cuerpo);
    const reintento = await testApi().post('/api/sucursales').set(admin).send(cuerpo);

    expect(reintento.status).toBe(200);
    expect(await contar('SELECT count(*) FROM sucursales WHERE id = $1', [cuerpo.id])).toBe(1);
    expect(await auditoriaDe(String(cuerpo.id))).toHaveLength(1);
  });

  it('el mismo nombre con otras mayúsculas y espacios responde 409 y no crea nada', async () => {
    const admin = await unAdmin();
    const primera = cuerpoDeSucursal();
    await testApi().post('/api/sucursales').set(admin).send(primera);

    const segunda = cuerpoDeSucursal({ nombre: `  ${String(primera.nombre).toUpperCase()} ` });
    const res = await testApi().post('/api/sucursales').set(admin).send(segunda);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('NOMBRE_SUCURSAL_DUPLICADO');
    expect(await contar('SELECT count(*) FROM sucursales WHERE id = $1', [segunda.id])).toBe(0);
    expect(await auditoriaDe(String(segunda.id))).toEqual([]);
  });
});

describe('Sucursales contra la base real: edición y cierre — SPEC-ALE186-011', () => {
  it('renombrar con el nombre de otra responde 409; con el suyo propio, no', async () => {
    const admin = await unAdmin();
    const norte = cuerpoDeSucursal();
    const sur = cuerpoDeSucursal();
    await testApi().post('/api/sucursales').set(admin).send(norte);
    await testApi().post('/api/sucursales').set(admin).send(sur);

    const choca = await testApi().patch(`/api/sucursales/${sur.id}`).set(admin).send({ nombre: norte.nombre });
    const suyo = await testApi()
      .patch(`/api/sucursales/${norte.id}`)
      .set(admin)
      .send({ nombre: String(norte.nombre).toLowerCase() });

    expect(choca.status).toBe(409);
    expect(choca.body.error.codigo).toBe('NOMBRE_SUCURSAL_DUPLICADO');
    expect(suyo.status).toBe(200);
  });

  it('no se cierra con ropa en el local; al anular esa orden, sí, y queda anotado', async () => {
    const adminId = await crearUsuario({ sucursalId: null, rol: 'ADMIN' });
    const admin = comoAdmin(adminId);
    const esc = await escenario();
    const orden = await crearOrden(esc, { estado: 'EN_PROCESO' });
    await crearOrden(esc, { estado: 'ENTREGADO' }); // esta no cuenta: ya se retiró
    const cerrar = () => testApi().patch(`/api/sucursales/${esc.sucursalId}`).set(admin).send({ activa: false });

    const conRopa = await cerrar();

    expect(conRopa.status).toBe(409);
    expect(conRopa.body.error.codigo).toBe('SUCURSAL_CON_ROPA');
    expect(conRopa.body.error.mensaje).toContain('Queda 1 orden');
    expect(await contar('SELECT count(*) FROM sucursales WHERE id = $1 AND activa', [esc.sucursalId])).toBe(1);
    expect(await auditoriaDe(esc.sucursalId)).toEqual([]);

    await testApi()
      .patch(`/api/ordenes/${orden.id}`)
      .set(admin)
      .send({ estado: 'ANULADO' });

    expect((await cerrar()).status).toBe(200);
    expect(await auditoriaDe(esc.sucursalId)).toEqual([
      { usuarioId: adminId, accion: 'EDITAR', tablaAfectada: 'sucursales', valoresAnteriores: { activa: true } },
    ]);
  });

  it('una sucursal cerrada no recibe personal nuevo ni movido; reabierta, sí', async () => {
    const admin = await unAdmin();
    const sucursal = cuerpoDeSucursal();
    await testApi().post('/api/sucursales').set(admin).send(sucursal);
    const otra = cuerpoDeSucursal();
    await testApi().post('/api/sucursales').set(admin).send(otra);
    const empleada = cuerpoDeAltaUsuario({ sucursal_id: otra.id });
    await testApi().post('/api/usuarios').set(admin).send(empleada);

    await testApi().patch(`/api/sucursales/${sucursal.id}`).set(admin).send({ activa: false });

    const alta = await testApi().post('/api/usuarios').set(admin).send(cuerpoDeAltaUsuario({ sucursal_id: sucursal.id }));
    const mover = await testApi().patch(`/api/usuarios/${empleada.id}`).set(admin).send({ sucursal_id: sucursal.id });
    expect(alta.status).toBe(404);
    expect(mover.status).toBe(404);

    await testApi().patch(`/api/sucursales/${sucursal.id}`).set(admin).send({ activa: true });

    const altaReabierta = await testApi()
      .post('/api/usuarios')
      .set(admin)
      .send(cuerpoDeAltaUsuario({ sucursal_id: sucursal.id }));
    expect(altaReabierta.status).toBe(201);
  });
});
