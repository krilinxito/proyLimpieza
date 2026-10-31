import { describe, expect, it } from 'vitest';
import {
  MENSAJES_RENGLON,
  claveCampo,
  describirRenglones,
  renglonNuevo,
  subtotalEscrito,
  sumaDeCargos,
  tieneAlgoEscrito,
  totalEscrito,
  validarRenglon,
  type RenglonEscrito,
} from './renglones';

const renglon = (campos: Partial<RenglonEscrito> = {}): RenglonEscrito => ({
  clave: 'r1',
  descripcion: 'Camisa',
  cantidad: '2',
  precioUnitario: '15',
  ...campos,
});

describe('Los renglones de la boleta — SPEC-KRILINXI-068', () => {
  it('un renglón nuevo trae su clave propia y una cantidad de 1, y eso no cuenta como escrito', () => {
    const a = renglonNuevo();
    const b = renglonNuevo();
    expect(a.clave).not.toBe(b.clave);
    expect(a).toMatchObject({ descripcion: '', cantidad: '1', precioUnitario: '' });
    expect(tieneAlgoEscrito(a)).toBe(false);
    expect(tieneAlgoEscrito({ ...a, cantidad: '3' })).toBe(true);
    expect(tieneAlgoEscrito({ ...a, descripcion: 'Saco' })).toBe(true);
  });

  it('valida y limpia: descripción sin bordes, cantidad en centésimas, precio y subtotal en centavos', () => {
    expect(validarRenglon(renglon({ descripcion: ' Camisa ', cantidad: '2,5', precioUnitario: '3,33' }))).toEqual({
      errores: {},
      valido: { clave: 'r1', descripcion: 'Camisa', cantidad: 250, precioUnitario: 333, subtotal: 833 },
    });
  });

  it('dice qué está mal de cada campo a la vez', () => {
    expect(validarRenglon(renglon({ descripcion: '', cantidad: '0', precioUnitario: 'x' })).errores).toEqual({
      descripcion: MENSAJES_RENGLON.sinDescripcion,
      cantidad: MENSAJES_RENGLON.cantidad,
      precioUnitario: MENSAJES_RENGLON.precio,
    });
  });

  it('mientras se escribe, el subtotal solo aparece con cantidad y precio válidos, y el total suma los que hay', () => {
    expect(subtotalEscrito(renglon())).toBe(3000);
    expect(subtotalEscrito(renglon({ precioUnitario: '' }))).toBeNull();
    expect(totalEscrito([renglon(), renglon({ precioUnitario: '' }), renglon({ cantidad: '1', precioUnitario: '5,50' })])).toBe(
      3550,
    );
  });

  it('la descripción de la boleta resume sus renglones', () => {
    expect(
      describirRenglones([
        { cantidad: 200, descripcion: 'Camisa' },
        { cantidad: 100, descripcion: 'Edredón king' },
        { cantidad: 250, descripcion: 'Ropa por kilo' },
      ]),
    ).toBe('2 Camisa, 1 Edredón king, 2,5 Ropa por kilo');
  });

  it('los cargos son los renglones de ENTREGA', () => {
    expect(
      sumaDeCargos([
        { momento: 'INGRESO', subtotal: 4550 },
        { momento: 'ENTREGA', subtotal: 1500 },
        { momento: 'ENTREGA', subtotal: 250 },
      ]),
    ).toBe(1750);
  });

  it('el error de un campo se nombra con la clave del renglón', () => {
    expect(claveCampo('abc', 'cantidad')).toBe('renglon:abc:cantidad');
  });
});
