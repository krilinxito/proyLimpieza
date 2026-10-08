import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { testApi } from '../helpers/api.js';
import { ahoraEnLaBase, auditoriaDe, contar, crearUsuario, escenario, type Escenario } from '../helpers/baseReal.js';
import { cuerpoDeOrden } from '../helpers/ordenes.js';
import { comoAdmin, conSesion } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4). La regla depende de dos fechas que pone la
// base —el cierre, que es `auditoria.fecha`, y `now()`— y vive dentro del INSERT:
// solo se puede comprobar con la base de verdad. Todas las fechas de estos tests
// salen de `ahoraEnLaBase`, nunca del reloj de Node (ver el helper).

const MINUTO = 60_000;

/** Un escenario con un admin de verdad y las acciones de este archivo. */
async function local() {
  const esc = await escenario();
  const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
  const empleado = conSesion({ id: esc.usuarioId, sucursalId: esc.sucursalId });
  const activa = (valor: boolean) =>
    testApi().patch(`/api/sucursales/${esc.sucursalId}`).set(admin).send({ activa: valor });
  const registrar = (cuerpo: Record<string, unknown>) =>
    testApi().post('/api/ordenes').set(empleado).send(cuerpo);
  return { esc, admin, activa, registrar };
}

function orden(esc: Escenario, campos: Record<string, unknown> = {}) {
  return cuerpoDeOrden({ cliente_id: esc.clienteId, numero_boleta: `C-${randomUUID().slice(0, 6)}`, ...campos });
}

describe('Sucursal cerrada: la ropa de antes del cierre entra, la de después no — SPEC-ALE186-014', () => {
  it('acepta la ropa que la tablet cargó sin internet antes del cierre y sube después', async () => {
    const { esc, activa, registrar } = await local();
    const antesDelCierre = await ahoraEnLaBase(-MINUTO);
    expect((await activa(false)).status).toBe(200);

    const res = await registrar(orden(esc, { fecha_entrada: antesDelCierre }));

    expect(res.status).toBe(201);
    expect(res.body.sucursalId).toBe(esc.sucursalId);
  });

  it('rechaza con 409 la ropa de después del cierre, sin guardar ni anotar nada', async () => {
    const { esc, activa, registrar } = await local();
    await activa(false);
    const cuerpo = orden(esc, { fecha_entrada: await ahoraEnLaBase(MINUTO / 60) });

    const res = await registrar(cuerpo);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('SUCURSAL_CERRADA');
    expect(await contar('SELECT count(*) FROM ordenes WHERE id = $1', [cuerpo.id])).toBe(0);
    expect(await auditoriaDe(String(cuerpo.id))).toEqual([]);
  });

  it('sin fecha de entrada no se puede saber si fue antes: se rechaza', async () => {
    const { esc, activa, registrar } = await local();
    await activa(false);

    const res = await registrar(orden(esc));

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('SUCURSAL_CERRADA');
  });

  it('reabierta, vuelve a aceptar cualquier orden', async () => {
    const { esc, activa, registrar } = await local();
    await activa(false);
    await activa(true);

    expect((await registrar(orden(esc))).status).toBe(201);
  });

  it('si se cerró, se reabrió y se volvió a cerrar, cuenta el último cierre', async () => {
    const { esc, activa, registrar } = await local();
    await activa(false);
    await activa(true);
    // Después del primer cierre, pero antes del segundo: con el primero se
    // rechazaría; con el último, entra.
    const entreLosDos = await ahoraEnLaBase();
    await activa(false);

    expect((await registrar(orden(esc, { fecha_entrada: entreLosDos }))).status).toBe(201);
  });

  it('el reintento de una orden ya guardada responde 200 aunque la sucursal se haya cerrado después', async () => {
    const { esc, admin, activa, registrar } = await local();
    const cuerpo = orden(esc);
    expect((await registrar(cuerpo)).status).toBe(201);
    // Para cerrar no puede quedar ropa en el local (SPEC-ALE186-011): se anula.
    await testApi().patch(`/api/ordenes/${String(cuerpo.id)}`).set(admin).send({ estado: 'ANULADO' });
    expect((await activa(false)).status).toBe(200);

    const reintento = await registrar(cuerpo);

    expect(reintento.status).toBe(200);
    expect(await contar('SELECT count(*) FROM ordenes WHERE id = $1', [cuerpo.id])).toBe(1);
  });
});

describe('Fechas en el futuro — SPEC-ALE186-014', () => {
  it('rechaza con 400 una fecha de entrada más de 5 minutos adelante de la hora del servidor', async () => {
    const { esc, registrar } = await local();
    const cuerpo = orden(esc, { fecha_entrada: await ahoraEnLaBase(10 * MINUTO) });

    const res = await registrar(cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('FECHA_FUTURA');
    expect(await contar('SELECT count(*) FROM ordenes WHERE id = $1', [cuerpo.id])).toBe(0);
  });

  it('acepta una tablet con el reloj apenas adelantado, dentro del margen', async () => {
    const { esc, registrar } = await local();

    expect((await registrar(orden(esc, { fecha_entrada: await ahoraEnLaBase(2 * MINUTO) }))).status).toBe(201);
  });

  it('la fecha futura se rechaza también en una sucursal abierta, para cualquier rol', async () => {
    const { esc, admin } = await local();
    const cuerpo = orden(esc, { fecha_entrada: await ahoraEnLaBase(60 * MINUTO), sucursal_id: esc.sucursalId });

    const res = await testApi().post('/api/ordenes').set(admin).send(cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('FECHA_FUTURA');
  });
});
