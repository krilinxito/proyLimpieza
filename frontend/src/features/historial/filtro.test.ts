import { describe, expect, it } from 'vitest';
import { FILTRO_INICIAL, hayFiltros, parametrosHistorial, textoParaBuscar } from './filtro';

describe('Filtro del historial — SPEC-KRILINXI-041', () => {
  it('sin nada elegido no hay filtros, y no se manda ningún parámetro', () => {
    expect(hayFiltros(FILTRO_INICIAL)).toBe(false);
    expect(parametrosHistorial(FILTRO_INICIAL)).toEqual({});
  });

  it.each([
    ['un texto', { texto: 'rosa' }],
    ['un estado', { estado: 'RECIBIDO' as const }],
    ['unas fechas', { fechas: { desde: '2026-10-01', hasta: '2026-10-05' } }],
    ['"con saldo"', { conSaldo: true }],
    ['una sucursal', { sucursalId: 'una-sucursal' }],
  ])('con %s hay filtros que limpiar', (_cual, cambios) => {
    expect(hayFiltros({ ...FILTRO_INICIAL, ...cambios })).toBe(true);
  });

  it('un texto de puros espacios no cuenta como filtro', () => {
    expect(hayFiltros({ ...FILTRO_INICIAL, texto: '   ' })).toBe(false);
  });

  it('manda a la API solo lo que está puesto, con los nombres de la API', () => {
    expect(
      parametrosHistorial({
        texto: ' Rosa ',
        estado: 'RECIBIDO',
        fechas: { desde: '2026-10-01', hasta: '2026-10-05' },
        conSaldo: true,
        sucursalId: 'una-sucursal',
      }),
    ).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-05',
      sucursal_id: 'una-sucursal',
      estado: 'RECIBIDO',
      texto: 'Rosa',
      con_saldo: 'true',
    });
  });

  it('un texto que todavía no alcanza para buscar no filtra, ni acá ni en la API', () => {
    // Una sola letra o dos dígitos coinciden con casi todo: la regla del buscador (SPEC-KRILINXI-032).
    expect(textoParaBuscar({ ...FILTRO_INICIAL, texto: 'r' })).toBe('');
    expect(textoParaBuscar({ ...FILTRO_INICIAL, texto: '70' })).toBe('');
    expect(textoParaBuscar({ ...FILTRO_INICIAL, texto: ' ro ' })).toBe('ro');
    expect(textoParaBuscar({ ...FILTRO_INICIAL, texto: '701' })).toBe('701');
    expect(parametrosHistorial({ ...FILTRO_INICIAL, texto: 'r' })).toEqual({});
  });
});
