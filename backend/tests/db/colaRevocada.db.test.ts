import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { testApi } from '../helpers/api.js';
import { crearCliente, crearUsuario, escenario, type Escenario } from '../helpers/baseReal.js';
import { cuerpoDeOrden } from '../helpers/ordenes.js';
import { comoAdmin, conSesion, conTokenVencidoHace } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4): la marca de revisión se escribe dentro de la
// misma sentencia que la escritura (en `valores_anteriores`) y la consulta de la
// auditoría la separa. Las dos cosas solo se pueden comprobar con la base.

const DIA = 24 * 60 * 60;

/** Un empleado de verdad, el admin que lo da de baja, y cómo consultar su auditoría. */
async function local() {
  const esc = await escenario();
  const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
  const darDeBaja = () => testApi().patch(`/api/usuarios/${esc.usuarioId}`).set(admin).send({ activo: false });
  const auditoria = async (query: Record<string, string>) =>
    (await testApi().get('/api/auditoria').query(query).set(admin)).body.registros as {
      accion: string;
      revision: string | null;
      valoresAnteriores: Record<string, unknown> | null;
      usuario: { id: string };
    }[];
  return { esc, darDeBaja, auditoria };
}

function orden(esc: Escenario) {
  return cuerpoDeOrden({ cliente_id: esc.clienteId, numero_boleta: `R-${randomUUID().slice(0, 6)}` });
}

const deEmpleado = (esc: Escenario) => ({ id: esc.usuarioId, sucursalId: esc.sucursalId });

describe('Lo que sube una cuenta dada de baja, contra la base real — SPEC-ALE186-018', () => {
  it('con el token vigente: entra a su nombre, y su alta queda marcada sin valores anteriores', async () => {
    const { esc, darDeBaja, auditoria } = await local();
    expect((await darDeBaja()).status).toBe(200);
    const cuerpo = orden(esc);

    const res = await testApi().post('/api/ordenes').set(conSesion(deEmpleado(esc))).send(cuerpo);

    expect(res.status).toBe(201);
    expect(await auditoria({ registro_id: String(cuerpo.id) })).toMatchObject([
      { accion: 'CREAR', revision: 'cuenta_dada_de_baja', valoresAnteriores: null, usuario: { id: esc.usuarioId } },
    ]);
  });

  it('con el token vencido hace un día: entra igual, a su nombre y marcada', async () => {
    const { esc, darDeBaja, auditoria } = await local();
    await darDeBaja();
    const cuerpo = orden(esc);

    const res = await testApi().post('/api/ordenes').set(conTokenVencidoHace(DIA, deEmpleado(esc))).send(cuerpo);

    expect(res.status).toBe(201);
    expect((await auditoria({ registro_id: String(cuerpo.id) }))[0]).toMatchObject({
      revision: 'cuenta_dada_de_baja',
      usuario: { id: esc.usuarioId },
    });
  });

  it('una edición marcada conserva sus valores de antes, aparte de la marca', async () => {
    const { esc, darDeBaja, auditoria } = await local();
    const cliente = await crearCliente();
    await darDeBaja();

    await testApi().patch(`/api/clientes/${cliente}`).set(conSesion(deEmpleado(esc))).send({ nombre: 'Ana María' });

    expect(await auditoria({ registro_id: cliente })).toMatchObject([
      { accion: 'EDITAR', revision: 'cuenta_dada_de_baja', valoresAnteriores: { nombre: 'Cliente de prueba' } },
    ]);
  });

  it('una cuenta activa con el token vencido dentro de la ventana sube sin marca', async () => {
    const { esc, auditoria } = await local();
    const cuerpo = orden(esc);

    const res = await testApi().post('/api/ordenes').set(conTokenVencidoHace(DIA, deEmpleado(esc))).send(cuerpo);

    expect(res.status).toBe(201);
    expect((await auditoria({ registro_id: String(cuerpo.id) }))[0]?.revision).toBeNull();
  });

  it('revisar=true trae solo lo marcado', async () => {
    const { esc, darDeBaja, auditoria } = await local();
    const antes = orden(esc);
    await testApi().post('/api/ordenes').set(conSesion(deEmpleado(esc))).send(antes);
    await darDeBaja();
    const despues = orden(esc);
    await testApi().post('/api/ordenes').set(conSesion(deEmpleado(esc))).send(despues);

    const todo = await auditoria({ usuario_id: esc.usuarioId });
    const marcado = await auditoria({ usuario_id: esc.usuarioId, revisar: 'true' });

    expect(todo).toHaveLength(2);
    expect(marcado).toHaveLength(1);
    expect(marcado[0]?.revision).toBe('cuenta_dada_de_baja');
  });
});
