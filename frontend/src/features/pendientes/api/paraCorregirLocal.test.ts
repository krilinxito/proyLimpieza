import { describe, expect, it } from 'vitest';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { describir, listarParaCorregir } from './paraCorregirLocal';

describe('Registros para corregir: qué eran — SPEC-KRILINXI-007', () => {
  it.each<[string, string, Record<string, unknown>, string]>([
    ['una orden', 'ordenes', { numero_boleta: '001234' }, 'Ropa con la boleta 001234'],
    ['un cambio de estado (sin boleta en los datos)', 'ordenes', { estado: 'LISTO' }, 'Un cambio en una boleta'],
    ['un pago', 'pagos', { monto: '20.50' }, 'Cobro de Bs 20,50'],
    ['un pago con un monto roto', 'pagos', { monto: 'x' }, 'Un cobro'],
    ['un cliente', 'clientes', { nombre: 'Rosa', telefono: '70123456' }, 'Cliente Rosa (70123456)'],
    ['una edición de cliente', 'clientes', { carnet: '123' }, 'Un cambio en un cliente'],
    ['una entrega', 'entregas', {}, 'Una entrega de ropa'],
    ['una tabla desconocida', 'sucursales', {}, 'Un registro'],
  ])('%s', (_caso, tabla, datos, esperado) => {
    expect(describir(tabla, datos)).toBe(esperado);
  });
});

describe('Registros para corregir: la lista — SPEC-KRILINXI-007', () => {
  it('los lee de la tabla solo local, del más viejo al más nuevo, con el mensaje del servidor', async () => {
    const { control } = await baseLocalDePrueba();
    const insertar = (tabla: string, datos: string, mensaje: string, fecha: string) =>
      control.base.ejecutar(
        'INSERT INTO para_corregir (id, tabla, datos, mensaje, fecha) VALUES (uuid(), ?, ?, ?, ?)',
        [tabla, datos, mensaje, fecha],
      );
    await insertar('pagos', '{"monto":"5.00"}', 'Esa ropa fue anulada.', '2026-10-03T12:00:00.000Z');
    await insertar('ordenes', '{"numero_boleta":"001234"}', 'Boleta repetida.', '2026-10-03T11:00:00.000Z');

    expect((await listarParaCorregir(control.base)).map(({ que, mensaje }) => [que, mensaje])).toEqual([
      ['Ropa con la boleta 001234', 'Boleta repetida.'],
      ['Cobro de Bs 5,00', 'Esa ropa fue anulada.'],
    ]);
  });

  it('unos datos que no son JSON no rompen la lista', async () => {
    const { control } = await baseLocalDePrueba();
    await control.base.ejecutar("INSERT INTO para_corregir (id, tabla, datos, mensaje) VALUES (uuid(), 'ordenes', '{roto', 'x')");
    expect(await listarParaCorregir(control.base)).toEqual([expect.objectContaining({ que: 'Un cambio en una boleta' })]);
  });
});
