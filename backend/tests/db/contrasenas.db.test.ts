import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { testApi } from '../helpers/api.js';
import { crearSucursal, crearUsuario } from '../helpers/baseReal.js';
import { comoAdmin, cuerpoDeAltaUsuario } from '../helpers/usuarios.js';

// Contra Postgres real (sección 4): que el hash que se GUARDA tenga el costo
// esperado, y que una cuenta guardada con el costo de producción siga entrando
// aunque el servidor corra con el de los tests. Eso último es lo que asegura que
// cambiar el costo nunca deja a nadie afuera.

async function cuentaConHash(hash: string): Promise<{ username: string }> {
  const username = `costo_${randomUUID().slice(0, 8)}`;
  await pool.query(
    `INSERT INTO usuarios (id, sucursal_id, nombre_completo, username, password_hash, rol)
     VALUES ($1, $2, 'Cuenta vieja', $3, $4, 'EMPLEADO')`,
    [randomUUID(), await crearSucursal(), username, hash],
  );
  return { username };
}

describe('Las contraseñas con el costo de bcrypt de cada entorno — SPEC-ALE186-022', () => {
  it('una cuenta creada por la API durante los tests queda con costo 4', async () => {
    const admin = comoAdmin(await crearUsuario({ sucursalId: null, rol: 'ADMIN' }));
    const cuerpo = cuerpoDeAltaUsuario({ sucursal_id: await crearSucursal() });

    expect((await testApi().post('/api/usuarios').set(admin).send(cuerpo)).status).toBe(201);

    const { rows } = await pool.query<{ password_hash: string }>('SELECT password_hash FROM usuarios WHERE id = $1', [
      cuerpo.id,
    ]);
    expect(rows[0]?.password_hash).toMatch(/^\$2b\$04\$/);
  });

  it('una cuenta guardada con costo 10 entra igual, aunque el servidor use 4', async () => {
    // `bcrypt.compare` lee el costo del hash guardado, no el del servidor.
    const { username } = await cuentaConHash(await bcrypt.hash('clave-de-produccion', 10));

    const bien = await testApi().post('/api/auth/login').send({ username, password: 'clave-de-produccion' });
    const mal = await testApi().post('/api/auth/login').send({ username, password: 'otra-cosa' });

    expect(bien.status).toBe(200);
    expect(mal.status).toBe(401);
  });

  it('un usuario que no existe recibe el mismo 401 que una contraseña equivocada', async () => {
    const { username } = await cuentaConHash(await bcrypt.hash('la-de-verdad', 4));

    const noExiste = await testApi()
      .post('/api/auth/login')
      .send({ username: `nadie_${randomUUID().slice(0, 8)}`, password: 'la-de-verdad' });
    const equivocada = await testApi().post('/api/auth/login').send({ username, password: 'otra-cosa' });

    expect(noExiste.status).toBe(401);
    expect(noExiste.body).toEqual(equivocada.body);
  });
});
