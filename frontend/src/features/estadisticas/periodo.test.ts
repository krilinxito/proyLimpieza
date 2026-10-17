import { describe, expect, it } from 'vitest';
import {
  DESDE_SIEMPRE,
  describirPeriodo,
  FILTRO_INICIAL,
  hoyEnBolivia,
  MENSAJES_PERIODO,
  parametrosHistoria,
  parametrosIngresos,
  parametrosPendientes,
  validarFechas,
} from './periodo';

const SUCURSAL = '00000000-0000-4000-8000-000000000001';

describe('El período de las estadísticas — SPEC-KRILINXI-015', () => {
  it('hoy es el día de Bolivia, no el de UTC: a las 22:00 del 6 en Bolivia ya es el 7 en UTC', () => {
    expect(hoyEnBolivia(Date.UTC(2026, 9, 7, 2, 0))).toBe('2026-10-06');
    expect(hoyEnBolivia(Date.UTC(2026, 9, 7, 4, 0))).toBe('2026-10-07');
  });

  it('sin elegir nada, los ingresos piden hoy y lo pendiente pide todo hasta hoy, de todas las sucursales', () => {
    expect(parametrosIngresos(FILTRO_INICIAL, '2026-10-16')).toEqual({ desde: '2026-10-16', hasta: '2026-10-16' });
    expect(parametrosPendientes(FILTRO_INICIAL, '2026-10-16')).toEqual({ desde: DESDE_SIEMPRE, hasta: '2026-10-16' });
  });

  it('con fechas y sucursal elegidas, las tres secciones piden lo mismo', () => {
    const filtro = { fechas: { desde: '2026-10-01', hasta: '2026-10-15' }, sucursalId: SUCURSAL };
    const esperado = { desde: '2026-10-01', hasta: '2026-10-15', sucursal_id: SUCURSAL };
    expect(parametrosIngresos(filtro, '2026-10-16')).toEqual(esperado);
    expect(parametrosPendientes(filtro, '2026-10-16')).toEqual(esperado);
  });

  it('dice qué período se mira, en palabras', () => {
    expect(describirPeriodo(FILTRO_INICIAL, 'ingresos')).toBe('de hoy');
    expect(describirPeriodo(FILTRO_INICIAL, 'pendientes')).toBe('hasta hoy');
    const fechas = { fechas: { desde: '2026-10-01', hasta: '2026-10-15' }, sucursalId: null };
    expect(describirPeriodo(fechas, 'ingresos')).toBe('del 01/10/2026 al 15/10/2026');
  });

  it('pide las dos fechas, y que no estén al revés', () => {
    expect(validarFechas('', '2026-10-15')).toEqual({ error: MENSAJES_PERIODO.faltaFecha });
    expect(validarFechas('2026-10-16', '2026-10-15')).toEqual({ error: MENSAJES_PERIODO.alReves });
    expect(validarFechas('2026-10-15', '2026-10-15')).toEqual({ desde: '2026-10-15', hasta: '2026-10-15' });
  });
});

describe('El período de la historia: volumen, productividad y clientes — SPEC-KRILINXI-016', () => {
  it('sin elegir nada son los últimos 30 días contando hoy, también cruzando un cambio de mes', () => {
    expect(parametrosHistoria(FILTRO_INICIAL, '2026-10-16')).toEqual({ desde: '2026-09-17', hasta: '2026-10-16' });
    expect(parametrosHistoria(FILTRO_INICIAL, '2026-03-01')).toEqual({ desde: '2026-01-31', hasta: '2026-03-01' });
  });

  it('con fechas y sucursal elegidas, usa esas como el resto del panel', () => {
    const filtro = { fechas: { desde: '2026-10-01', hasta: '2026-10-15' }, sucursalId: SUCURSAL };
    expect(parametrosHistoria(filtro, '2026-10-16')).toEqual({ desde: '2026-10-01', hasta: '2026-10-15', sucursal_id: SUCURSAL });
  });

  it('lo dice en el título', () => {
    expect(describirPeriodo(FILTRO_INICIAL, 'historia')).toBe('de los últimos 30 días');
  });
});
