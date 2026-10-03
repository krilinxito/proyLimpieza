import { describe, expect, it } from 'vitest';
import { baseLocalDePrueba } from '../../test/baseLocalDePrueba';

describe('Base local: consultas sin internet — SPEC-KRILINXI-004', () => {
  it('responde consultas con lo que ya hay guardado, sin haberse conectado nunca', async () => {
    // Nadie llamó a `conectar`: es la tablet que arranca sin internet.
    const { control } = await baseLocalDePrueba();
    await control.base.ejecutar(
      'INSERT INTO ordenes (id, numero_boleta, precio_total, estado) VALUES (uuid(), ?, ?, ?)',
      ['001234', '85.50', 'RECIBIDO'],
    );

    const filas = await control.base.consultar('SELECT numero_boleta, precio_total, estado FROM ordenes');
    // El monto vuelve como texto exacto: listo para lib/money, sin pasar por un float.
    expect(filas).toEqual([{ numero_boleta: '001234', precio_total: '85.50', estado: 'RECIBIDO' }]);
  });

  it('acepta parámetros: nunca hace falta pegar valores dentro del SQL', async () => {
    const { control } = await baseLocalDePrueba();
    await control.base.ejecutar('INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), ?, ?)', [
      "O'Brien",
      '70000001',
    ]);
    const filas = await control.base.consultar('SELECT nombre FROM clientes WHERE telefono = ?', ['70000001']);
    expect(filas).toEqual([{ nombre: "O'Brien" }]);
  });
});

describe('Base local: borrar al salir — SPEC-KRILINXI-004', () => {
  it('desconectarYBorrar deja la base vacía, con la cola incluida', async () => {
    const { control, db } = await baseLocalDePrueba();
    await control.base.ejecutar('INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), ?, ?)', [
      'Rosa',
      '70123456',
    ]);

    await control.desconectarYBorrar();

    expect(await control.base.consultar('SELECT * FROM clientes')).toEqual([]);
    expect(await db.getCrudBatch()).toBeNull();
  });
});
