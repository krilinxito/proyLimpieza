import { describe, expect, it } from 'vitest';
import { desdeDecimal, sumar } from '../../lib/money';
import { ingresosDePrueba } from '../../test/estadisticasDePrueba';
import { totalesPorFormaDePago } from './totalesPorFormaDePago';
import type { Ingresos } from './types';

const ingresos = (datos: Record<string, unknown>) => ingresosDePrueba(datos) as unknown as Ingresos;

const sucursal = (sucursalId: string, porMetodo: Partial<Record<'EFECTIVO' | 'QR' | 'TARJETA', string>>) => ({
  sucursalId,
  sucursal: sucursalId,
  total: '0.00',
  porMetodo: { EFECTIVO: '0.00', QR: '0.00', TARJETA: '0.00', ...porMetodo },
});

describe('Total por forma de pago, la única suma del frontend — SPEC-KRILINXI-042', () => {
  it('suma lo de cada sucursal, y devuelve siempre las tres formas en su orden fijo', () => {
    const totales = totalesPorFormaDePago(
      ingresos({
        porSucursal: [sucursal('centro', { EFECTIVO: '100.00', QR: '25.50' }), sucursal('norte', { EFECTIVO: '10.00', TARJETA: '24.50' })],
      }),
    );

    expect(totales).toEqual([
      { metodo: 'EFECTIVO', total: 11000 },
      { metodo: 'QR', total: 2550 },
      { metodo: 'TARJETA', total: 2450 },
    ]);
  });

  it('suma en centavos enteros: 0.10 + 0.20 da exactamente 30 centavos, sin el error de los decimales', () => {
    const [efectivo] = totalesPorFormaDePago(ingresos({ porSucursal: [sucursal('a', { EFECTIVO: '0.10' }), sucursal('b', { EFECTIVO: '0.20' })] }));

    expect(efectivo?.total).toBe(30);
    // Con floats, esto daría 0.30000000000000004.
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('sin ninguna sucursal con cobros, las tres valen cero', () => {
    expect(totalesPorFormaDePago(ingresos({ porSucursal: [] })).map((t) => t.total)).toEqual([0, 0, 0]);
  });

  it('coincide con el total que suma Postgres: la suma de las tres formas es el total general', () => {
    // Mientras esta suma viva en el frontend, este es el aviso si dejara de coincidir con el servidor.
    const datos = ingresos({
      total: '160.00',
      porSucursal: [sucursal('centro', { EFECTIVO: '100.00', QR: '25.50' }), sucursal('norte', { EFECTIVO: '10.00', TARJETA: '24.50' })],
    });

    expect(sumar(...totalesPorFormaDePago(datos).map((t) => t.total))).toBe(desdeDecimal(datos.total));
  });

  it('las fixtures del panel también coinciden con su total', () => {
    const datos = ingresosDePrueba() as unknown as Ingresos;

    expect(sumar(...totalesPorFormaDePago(datos).map((t) => t.total))).toBe(desdeDecimal(datos.total));
  });
});
