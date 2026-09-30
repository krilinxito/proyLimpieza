import { describe, expect, it, vi } from 'vitest';
import { borrarSesion, guardarSesion, leerSesion } from './almacen';
import { sesionDePrueba } from '../../../test/sesion';

const CLAVE = 'lavanderia.sesion';

describe('almacén de la sesión — SPEC-KRILINXI-003', () => {
  it('lo que se guarda se vuelve a leer igual: sobrevive a recargar la página', () => {
    const sesion = sesionDePrueba();
    guardarSesion(sesion);
    expect(leerSesion()).toEqual(sesion);
  });

  it('guarda los dos tokens y los datos del usuario', () => {
    guardarSesion(sesionDePrueba({ rol: 'ADMIN' }));
    const guardada: unknown = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    expect(guardada).toMatchObject({
      token: 'token-api-de-prueba',
      tokenPowerSync: 'token-powersync-de-prueba',
      usuario: { rol: 'ADMIN', sucursalId: null, nombreCompleto: 'Ana Administradora' },
    });
  });

  it('sin nada guardado, no hay sesión', () => {
    expect(leerSesion()).toBeNull();
  });

  it('borrar la deja sin sesión', () => {
    guardarSesion(sesionDePrueba());
    borrarSesion();
    expect(leerSesion()).toBeNull();
  });

  it.each([
    ['texto que no es JSON', '{roto'],
    ['un rol que no existe', JSON.stringify({ ...sesionDePrueba(), usuario: { ...sesionDePrueba().usuario, rol: 'JEFE' } })],
    ['sin token de PowerSync', JSON.stringify({ token: 'x', usuario: sesionDePrueba().usuario })],
  ])('descarta lo guardado cuando es %s, en vez de arrancar con datos inventados', (_caso, guardado) => {
    localStorage.setItem(CLAVE, guardado);
    expect(leerSesion()).toBeNull();
  });

  it('si el navegador no deja usar el almacenamiento, no rompe: simplemente no hay sesión', () => {
    // Pasa en modo privado de algunos navegadores: getItem lanza en vez de devolver null.
    const espia = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(leerSesion()).toBeNull();
    expect(() => guardarSesion(sesionDePrueba())).not.toThrow();
    espia.mockRestore();
  });
});
