import { describe, expect, it, vi } from 'vitest';
import { baseLocalDePrueba } from '../../test/baseLocalDePrueba';
import { simularApi } from '../../test/apiFalsa';
import { subirCola } from './conector';
import type { EstadoSubida } from './control';

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

describe('Base local: el estado de la subida — SPEC-KRILINXI-007', () => {
  /** Observa y devuelve una función para esperar el último estado avisado. */
  async function observar(control: Awaited<ReturnType<typeof baseLocalDePrueba>>['control']) {
    const alCambiar = vi.fn<(estado: EstadoSubida) => void>();
    const dejar = control.base.observarEstado(alCambiar);
    const ultimo = () => alCambiar.mock.calls.at(-1)?.[0];
    return { dejar, ultimo, alCambiar };
  }

  it('avisa enseguida: sin conexión y sin nada pendiente', async () => {
    const { control } = await baseLocalDePrueba();
    const { ultimo } = await observar(control);
    await vi.waitFor(() => expect(ultimo()).toEqual({ conectado: false, pendientes: 0, paraCorregir: 0 }));
  });

  it('cuenta lo que se escribe como pendiente, sin que nadie lo pida', async () => {
    const { control } = await baseLocalDePrueba();
    const { ultimo } = await observar(control);
    await control.base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), 'Rosa', '1')");
    await control.base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), 'Juan', '2')");
    await vi.waitFor(() => expect(ultimo()).toMatchObject({ pendientes: 2 }));
  });

  it('cuando la subida vacía la cola, el pendiente vuelve a cero', async () => {
    simularApi(() => ({ status: 201, data: {} }));
    const { control, db } = await baseLocalDePrueba();
    const { ultimo } = await observar(control);
    await control.base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), 'Rosa', '1')");
    await vi.waitFor(() => expect(ultimo()).toMatchObject({ pendientes: 1 }));

    await subirCola(db);

    await vi.waitFor(() => expect(ultimo()).toMatchObject({ pendientes: 0 }));
  });

  it('cuenta los registros para corregir', async () => {
    const { control } = await baseLocalDePrueba();
    const { ultimo } = await observar(control);
    await control.base.ejecutar("INSERT INTO para_corregir (id, tabla, mensaje) VALUES (uuid(), 'ordenes', 'x')");
    await vi.waitFor(() => expect(ultimo()).toMatchObject({ paraCorregir: 1, pendientes: 0 }));
  });

  it('deja de avisar cuando se le pide', async () => {
    const { control } = await baseLocalDePrueba();
    const { dejar, alCambiar } = await observar(control);
    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalled());
    dejar();
    const llamadas = alCambiar.mock.calls.length;
    await control.base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), 'Rosa', '1')");
    await new Promise((r) => setTimeout(r, 300));
    expect(alCambiar).toHaveBeenCalledTimes(llamadas);
  });
});

describe('Base local: desconectar sin borrar — SPEC-KRILINXI-007', () => {
  it('sabe si quedan cambios sin subir', async () => {
    const { control } = await baseLocalDePrueba();
    expect(await control.hayCambiosSinSubir()).toBe(false);
    await control.base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), 'Rosa', '1')");
    expect(await control.hayCambiosSinSubir()).toBe(true);
  });

  it('desconectar deja los datos y la cola como estaban', async () => {
    const { control } = await baseLocalDePrueba();
    await control.base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), 'Rosa', '1')");
    await control.desconectar();
    expect(await control.base.consultar('SELECT nombre FROM clientes')).toEqual([{ nombre: 'Rosa' }]);
    expect(await control.hayCambiosSinSubir()).toBe(true);
  });
});
