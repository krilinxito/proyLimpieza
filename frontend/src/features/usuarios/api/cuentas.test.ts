import { describe, expect, it } from 'vitest';
import { cuerpoError, simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import type { Cuenta } from '../types';
import { crearCuenta, darDeBaja, editarCuenta, MENSAJES_CUENTA } from './cuentasApi';
import { listarCuentas } from './cuentasLocal';

const CENTRO = '00000000-0000-4000-8000-0000000000c1';
const NORTE = '00000000-0000-4000-8000-0000000000c2';
const ROSA: Cuenta = {
  id: '00000000-0000-4000-8000-0000000000e1',
  nombreCompleto: 'Rosa Quispe',
  username: 'rosa',
  rol: 'EMPLEADO',
  sucursalId: CENTRO,
  sucursal: 'Centro',
  activo: true,
};
const ALTA = { nombreCompleto: 'Juan Mamani', username: 'juan', password: 'secreta123', rol: 'EMPLEADO' as const, telefono: '', sucursalId: CENTRO };
const ok = () => simularApi(() => ({ status: 201, data: {} }));

describe('Cuentas: leerlas de la base local — SPEC-KRILINXI-017', () => {
  it('lista las cuentas con el nombre de su sucursal, las activas primero', async () => {
    const { control, sembrar } = await baseLocalDePrueba();
    await sembrar('sucursales', [{ id: CENTRO, nombre: 'Centro', activa: 1 }]);
    await sembrar('usuarios', [
      { id: 'a', nombre_completo: 'Ana Admin', username: 'ana', rol: 'ADMIN', sucursal_id: null, activo: 0 },
      { id: 'r', nombre_completo: 'Rosa Quispe', username: 'rosa', rol: 'EMPLEADO', sucursal_id: CENTRO, activo: 1 },
    ]);
    expect(await listarCuentas(control.base)).toEqual([
      { id: 'r', nombreCompleto: 'Rosa Quispe', username: 'rosa', rol: 'EMPLEADO', sucursalId: CENTRO, sucursal: 'Centro', activo: true },
      { id: 'a', nombreCompleto: 'Ana Admin', username: 'ana', rol: 'ADMIN', sucursalId: null, sucursal: null, activo: false },
    ]);
  });
});

describe('Cuentas: los cambios van directo a la API — SPEC-KRILINXI-017', () => {
  it('da de alta un empleado con su sucursal, con un id del dispositivo', async () => {
    const servidor = ok();
    expect(await crearCuenta(ALTA)).toEqual({ tipo: 'guardado' });
    expect(servidor.pedidos[0]).toEqual(
      expect.objectContaining({
        metodo: 'POST',
        ruta: '/usuarios',
        cuerpo: {
          id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          nombre_completo: 'Juan Mamani',
          username: 'juan',
          password: 'secreta123',
          rol: 'EMPLEADO',
          telefono: null,
          sucursal_id: CENTRO,
        },
      }),
    );
  });

  it('un ADMIN va sin sucursal aunque el formulario tuviera una elegida', async () => {
    const servidor = ok();
    await crearCuenta({ ...ALTA, rol: 'ADMIN' });
    expect(servidor.pedidos[0]?.cuerpo).toEqual(expect.objectContaining({ rol: 'ADMIN', sucursal_id: null }));
  });

  it('valida antes de mandar: nombre, usuario, contraseña de 8 y la sucursal de un empleado', async () => {
    const servidor = ok();
    expect(await crearCuenta({ ...ALTA, nombreCompleto: ' ', username: '', password: 'corta', sucursalId: null })).toEqual({
      tipo: 'invalido',
      errores: {
        nombreCompleto: MENSAJES_CUENTA.sinNombre,
        username: MENSAJES_CUENTA.sinUsuario,
        password: MENSAJES_CUENTA.contrasena,
        sucursalId: MENSAJES_CUENTA.sinSucursal,
      },
    });
    expect(servidor.pedidos).toEqual([]);
  });

  it('al editar manda solo lo que cambió; teléfono y contraseña vacíos no se tocan', async () => {
    const servidor = ok();
    expect(await editarCuenta(ROSA, { nombreCompleto: 'Rosa Quispe', telefono: '', sucursalId: CENTRO, password: '' })).toEqual({
      tipo: 'sin-cambios',
    });
    await editarCuenta(ROSA, { nombreCompleto: 'Rosa Quispe', telefono: '70123456', sucursalId: NORTE, password: 'nueva12345' });
    expect(servidor.pedidos.map((p) => [p.metodo, p.ruta, p.cuerpo])).toEqual([
      ['PATCH', `/usuarios/${ROSA.id}`, { telefono: '70123456', sucursal_id: NORTE, password: 'nueva12345' }],
    ]);
  });

  it('no deja cambiar el usuario ni el rol: no están entre lo que se manda', async () => {
    const servidor = ok();
    await editarCuenta(ROSA, { nombreCompleto: 'Rosa Q.', telefono: '', sucursalId: CENTRO, password: '' });
    expect(Object.keys(servidor.pedidos[0]?.cuerpo as object)).toEqual(['nombre_completo']);
  });

  it('la baja manda activo: false', async () => {
    const servidor = ok();
    expect(await darDeBaja(ROSA)).toEqual({ tipo: 'guardado' });
    expect(servidor.pedidos.map((p) => [p.metodo, p.ruta, p.cuerpo])).toEqual([['PATCH', `/usuarios/${ROSA.id}`, { activo: false }]]);
  });

  it('un usuario repetido muestra el mensaje del servidor, que dice qué hacer', async () => {
    const repetido = 'Ese nombre de usuario ya lo usa otra persona. Elegí otro, por ejemplo agregándole el apellido.';
    simularApi(() => ({ status: 409, data: cuerpoError('USERNAME_DUPLICADO', repetido) }));
    expect(await crearCuenta(ALTA)).toEqual({ tipo: 'rechazado', mensaje: repetido });
  });
});
