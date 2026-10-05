import { describe, expect, it } from 'vitest';
import { testApi } from '../helpers/api.js';
import { contar, crearSucursal, crearUsuario } from '../helpers/baseReal.js';
import { comoAdmin, conSesion, cuerpoDeAltaUsuario } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4): lo que solo la base puede garantizar es que
// el UNIQUE del username frene un segundo alta, que `ON CONFLICT (id)` absorba el
// reintento sin tropezar con ese mismo UNIQUE, y que la baja que escribe el PATCH
// sea la que lee el login. Con dobles, cada uno de esos pasos lo inventa el test.

/** Un admin de verdad en la base (lo exige la FK de `creado_por`) y una sucursal. */
async function oficina() {
  const [adminId, sucursalId] = await Promise.all([
    crearUsuario({ sucursalId: null, rol: 'ADMIN' }),
    crearSucursal(),
  ]);
  return { admin: comoAdmin(adminId), adminId, sucursalId };
}

describe('Usuarios contra la base real — SPEC-ALE186-009', () => {
  it('el alta guarda la cuenta con creado_por y sin devolver el hash', async () => {
    const { admin, adminId, sucursalId } = await oficina();
    const cuerpo = cuerpoDeAltaUsuario({ sucursal_id: sucursalId });

    const res = await testApi().post('/api/usuarios').set(admin).send(cuerpo);

    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);
    expect(
      await contar('SELECT count(*) FROM usuarios WHERE id = $1 AND creado_por = $2', [cuerpo.id, adminId]),
    ).toBe(1);
  });

  it('el reintento con el mismo id y username responde 200 y no duplica', async () => {
    // Es el caso que importa del ON CONFLICT: id Y username chocan a la vez, y
    // Postgres tiene que resolverlo por el id sin tirar la unicidad del username.
    const { admin, sucursalId } = await oficina();
    const cuerpo = cuerpoDeAltaUsuario({ sucursal_id: sucursalId });

    await testApi().post('/api/usuarios').set(admin).send(cuerpo);
    const reintento = await testApi().post('/api/usuarios').set(admin).send(cuerpo);

    expect(reintento.status).toBe(200);
    expect(await contar('SELECT count(*) FROM usuarios WHERE id = $1', [cuerpo.id])).toBe(1);
  });

  it('un username repetido con otro id responde 409 USERNAME_DUPLICADO', async () => {
    const { admin, sucursalId } = await oficina();
    const primero = cuerpoDeAltaUsuario({ sucursal_id: sucursalId });
    await testApi().post('/api/usuarios').set(admin).send(primero);

    const segundo = cuerpoDeAltaUsuario({ sucursal_id: sucursalId, username: primero.username });
    const res = await testApi().post('/api/usuarios').set(admin).send(segundo);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('USERNAME_DUPLICADO');
  });

  it('de punta a punta: entra, el admin lo da de baja, y ya no entra ni renueva', async () => {
    const { admin, sucursalId } = await oficina();
    const cuerpo = cuerpoDeAltaUsuario({ sucursal_id: sucursalId, password: 'clave-de-rosa' });
    await testApi().post('/api/usuarios').set(admin).send(cuerpo);
    const credenciales = { username: cuerpo.username, password: 'clave-de-rosa' };

    // Con la contraseña que puso el admin, el login la reconoce: mismo bcrypt.
    const antes = await testApi().post('/api/auth/login').send(credenciales);
    expect(antes.status).toBe(200);

    const baja = await testApi().patch(`/api/usuarios/${String(cuerpo.id)}`).set(admin).send({ activo: false });
    expect(baja.status).toBe(200);

    const login = await testApi().post('/api/auth/login').send(credenciales);
    expect(login.status).toBe(401);

    // El token que sacó antes de la baja sigue siendo válido por firma: es la
    // renovación la que vuelve a mirar la base y le dice que no.
    const renovar = await testApi()
      .post('/api/auth/renovar')
      .set(conSesion({ id: String(cuerpo.id), sucursalId }));
    expect(renovar.status).toBe(401);
  });

  it('el cambio de contraseña reemplaza a la anterior', async () => {
    const { admin, sucursalId } = await oficina();
    const cuerpo = cuerpoDeAltaUsuario({ sucursal_id: sucursalId, password: 'la-de-antes' });
    await testApi().post('/api/usuarios').set(admin).send(cuerpo);

    await testApi().patch(`/api/usuarios/${String(cuerpo.id)}`).set(admin).send({ password: 'la-de-ahora' });

    const vieja = await testApi().post('/api/auth/login').send({ username: cuerpo.username, password: 'la-de-antes' });
    const nueva = await testApi().post('/api/auth/login').send({ username: cuerpo.username, password: 'la-de-ahora' });
    expect(vieja.status).toBe(401);
    expect(nueva.status).toBe(200);
  });
});
