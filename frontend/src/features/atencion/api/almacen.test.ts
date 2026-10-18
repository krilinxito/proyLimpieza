import { describe, expect, it } from 'vitest';
import { borrarAtencion, guardarAtencion, leerAtencion } from './almacen';

describe('almacén de la atención — SPEC-KRILINXI-029', () => {
  it('la sucursal elegida se vuelve a leer: sobrevive a recargar o volver a abrir la app', () => {
    guardarAtencion('ana', 'sucursal-centro');
    expect(leerAtencion('ana')).toBe('sucursal-centro');
  });

  it('otra persona que entra en la misma tablet no hereda la sucursal del anterior', () => {
    guardarAtencion('ana', 'sucursal-centro');
    expect(leerAtencion('otra-persona')).toBeNull();
  });

  it('dejar de atender la borra', () => {
    guardarAtencion('ana', 'sucursal-centro');
    borrarAtencion();
    expect(leerAtencion('ana')).toBeNull();
  });

  it('algo guardado con otra forma (otra versión, editado a mano) no cuenta', () => {
    localStorage.setItem('lavanderia.atencion', JSON.stringify({ usuarioId: 'ana', sucursalId: '' }));
    expect(leerAtencion('ana')).toBeNull();
    localStorage.setItem('lavanderia.atencion', '{roto');
    expect(leerAtencion('ana')).toBeNull();
  });
});
