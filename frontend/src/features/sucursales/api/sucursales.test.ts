import { describe, expect, it } from 'vitest';
import { cuerpoError, simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { cambiarApertura, crearSucursal, editarSucursal, MENSAJES_SUCURSAL } from './sucursalesApi';
import { listarSucursales } from './sucursalesLocal';

const CENTRO = { id: '00000000-0000-4000-8000-0000000000c1', nombre: 'Centro', direccion: 'Av. Busch 123', telefono: null, activa: true };
const ok = () => simularApi(() => ({ status: 201, data: {} }));

describe('Sucursales: leerlas de la base local — SPEC-KRILINXI-017', () => {
  it('lista todas, las abiertas primero, con su dirección y si están abiertas', async () => {
    const { control, sembrar } = await baseLocalDePrueba();
    await sembrar('sucursales', [
      { id: 'a', nombre: 'Sur', direccion: null, telefono: '2201', activa: 0 },
      { id: 'b', nombre: 'Norte', direccion: 'Calle 1', telefono: null, activa: 1 },
    ]);
    expect(await listarSucursales(control.base)).toEqual([
      { id: 'b', nombre: 'Norte', direccion: 'Calle 1', telefono: null, activa: true },
      { id: 'a', nombre: 'Sur', direccion: null, telefono: '2201', activa: false },
    ]);
  });
});

describe('Sucursales: los cambios van directo a la API — SPEC-KRILINXI-017', () => {
  it('da de alta con un id del dispositivo y los opcionales vacíos como null', async () => {
    const servidor = ok();
    expect(await crearSucursal({ nombre: ' Norte ', direccion: '', telefono: '2201' })).toEqual({ tipo: 'guardado' });
    expect(servidor.pedidos).toEqual([
      expect.objectContaining({
        metodo: 'POST',
        ruta: '/sucursales',
        cuerpo: { id: expect.stringMatching(/^[0-9a-f-]{36}$/), nombre: 'Norte', direccion: null, telefono: '2201' },
      }),
    ]);
  });

  it('sin nombre no manda nada', async () => {
    const servidor = ok();
    expect(await crearSucursal({ nombre: ' ', direccion: '', telefono: '' })).toEqual({
      tipo: 'invalido',
      errores: { nombre: MENSAJES_SUCURSAL.sinNombre },
    });
    expect(servidor.pedidos).toEqual([]);
  });

  it('al editar manda solo lo que cambió, y nada si no cambió nada', async () => {
    const servidor = ok();
    expect(await editarSucursal(CENTRO, { nombre: 'Centro', direccion: 'Av. Busch 123', telefono: '' })).toEqual({ tipo: 'sin-cambios' });
    await editarSucursal(CENTRO, { nombre: 'Centro', direccion: 'Av. Busch 456', telefono: '' });
    expect(servidor.pedidos.map((p) => [p.metodo, p.ruta, p.cuerpo])).toEqual([
      ['PATCH', `/sucursales/${CENTRO.id}`, { direccion: 'Av. Busch 456' }],
    ]);
  });

  it('cerrar y volver a abrir mandan activa', async () => {
    const servidor = ok();
    await cambiarApertura(CENTRO, false);
    await cambiarApertura({ ...CENTRO, activa: false }, true);
    expect(servidor.pedidos.map((p) => p.cuerpo)).toEqual([{ activa: false }, { activa: true }]);
  });

  it('si no se puede cerrar porque tiene ropa, lo explica sin la palabra "orden" del servidor', async () => {
    simularApi(() => ({ status: 409, data: cuerpoError('SUCURSAL_CON_ROPA', 'Quedan 3 órdenes con ropa en esta sucursal.') }));
    expect(await cambiarApertura(CENTRO, false)).toEqual({ tipo: 'rechazado', mensaje: MENSAJES_SUCURSAL.conRopa });
  });

  it('un nombre repetido muestra el mensaje del servidor, y sin internet lo dice', async () => {
    const repetido = 'Ya hay una sucursal que se llama "Norte". Elegí otro nombre, por ejemplo con la zona o la calle.';
    simularApi(() => ({ status: 409, data: cuerpoError('NOMBRE_SUCURSAL_DUPLICADO', repetido) }));
    expect(await crearSucursal({ nombre: 'Norte', direccion: '', telefono: '' })).toEqual({ tipo: 'rechazado', mensaje: repetido });
    simularApi(() => 'sin-conexion');
    expect(await crearSucursal({ nombre: 'Norte', direccion: '', telefono: '' })).toEqual({ tipo: 'sin-conexion' });
  });
});
