import { describe, expect, it } from 'vitest';
import { crearConector, SubidaNoDisponible } from './conector';
import { baseLocalDePrueba } from '../../test/baseLocalDePrueba';
import { simularApi } from '../../test/apiFalsa';

const URL_POWERSYNC = 'http://localhost:8080';

describe('Conector: credenciales — SPEC-KRILINXI-004', () => {
  it('entrega el token de PowerSync de la sesión y la dirección del servicio', async () => {
    const conector = crearConector(URL_POWERSYNC, () => 'token-powersync');
    expect(await conector.fetchCredentials()).toEqual({ endpoint: URL_POWERSYNC, token: 'token-powersync' });
  });

  it('sin sesión no entrega ningún token, y así PowerSync no se conecta', async () => {
    const conector = crearConector(URL_POWERSYNC, () => null);
    expect(await conector.fetchCredentials()).toBeNull();
  });

  it('pregunta por el token en cada conexión: un token renovado se usa sin reconstruir nada', async () => {
    let token = 'viejo';
    const conector = crearConector(URL_POWERSYNC, () => token);
    await conector.fetchCredentials();
    token = 'nuevo';
    expect(await conector.fetchCredentials()).toMatchObject({ token: 'nuevo' });
  });
});

describe('Conector: los cambios esperan en la cola — SPEC-KRILINXI-004', () => {
  it('uploadData no llama a la API ni da nada por subido: lo escrito sigue en la cola', async () => {
    const servidor = simularApi(() => ({ status: 200, data: {} }));
    const { control, db } = await baseLocalDePrueba();

    await control.base.ejecutar('INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), ?, ?)', [
      'Rosa Quispe',
      '70123456',
    ]);

    // Es lo que hace PowerSync cuando hay algo en la cola: llamar a uploadData con la base.
    await expect(crearConector(URL_POWERSYNC, () => 'token').uploadData(db)).rejects.toBeInstanceOf(
      SubidaNoDisponible,
    );

    expect(servidor.pedidos).toEqual([]);
    const cola = await db.getCrudBatch();
    expect(cola?.crud.map((c) => [c.op, c.table, c.opData])).toEqual([
      ['PUT', 'clientes', { nombre: 'Rosa Quispe', telefono: '70123456' }],
    ]);
  });
});
