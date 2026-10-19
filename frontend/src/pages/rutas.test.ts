import { describe, expect, it } from 'vitest';
import { NOMBRES_ICONOS } from '../components/iconos';
import { destinosDelMenu, RUTAS, tituloDePestana } from './rutas';

describe('Rutas: lo que necesita el menú — SPEC-KRILINXI-023', () => {
  // Recorre el registro entero: una ruta nueva del menú sin ícono o sin descripción falla acá,
  // en vez de desaparecer del menú en silencio.
  it.each(RUTAS.filter((r) => r.enMenu || r.camino === '/').map((r) => [r.camino, r] as const))(
    '%s tiene ícono y una descripción de una línea',
    (_camino, ruta) => {
      expect(NOMBRES_ICONOS).toContain(ruta.icono);
      expect(ruta.descripcion).toMatch(/^\S.{9,79}$/);
      expect(ruta.descripcion).not.toContain('\n');
    },
  );

  it('un EMPLEADO ve el Inicio y el mostrador, no lo del administrador', () => {
    expect(destinosDelMenu('EMPLEADO', true).map((d) => d.titulo)).toEqual([
      'Inicio',
      'Mostrador',
      'Clientes',
    ]);
  });

  it('un ADMIN que no está atendiendo ve el Inicio y lo suyo, no Registrar ropa', () => {
    expect(destinosDelMenu('ADMIN', false).map((d) => d.titulo)).toEqual([
      'Inicio',
      'Clientes',
      'Personal',
      'Sucursales',
      '¿Quién hizo qué?',
      'Estadísticas',
    ]);
  });

  it('un ADMIN que atiende en una sucursal ve el mostrador, y sigue viendo lo suyo — SPEC-KRILINXI-029', () => {
    expect(destinosDelMenu('ADMIN', true).map((d) => d.titulo)).toEqual([
      'Inicio',
      'Mostrador',
      'Clientes',
      'Personal',
      'Sucursales',
      '¿Quién hizo qué?',
      'Estadísticas',
    ]);
  });

  it.each([
    ['/', 'Lavandería'],
    // Registrar ropa es parte del Mostrador desde SPEC-KRILINXI-034.
    ['/registrar-ropa', 'Mostrador · Lavandería'],
    // Las direcciones viejas del mostrador llevan ahí (SPEC-KRILINXI-033).
    ['/cobrar', 'Mostrador · Lavandería'],
    ['/quien-hizo-que', '¿Quién hizo qué? · Lavandería'],
    ['/no-existe', 'Esa página no existe · Lavandería'],
  ])('la pestaña de %s se llama "%s"', (camino, titulo) => {
    expect(tituloDePestana(camino)).toBe(titulo);
  });
});

describe('Rutas: un solo Mostrador — SPEC-KRILINXI-033', () => {
  it('/ropa, /cobrar y /entregar no son pantallas propias: llevan al Mostrador y no están en el menú', () => {
    for (const camino of ['/ropa', '/cobrar', '/entregar']) {
      const ruta = RUTAS.find((r) => r.camino === camino);
      expect(ruta?.enMenu).toBe(false);
      expect(ruta?.titulo).toBe('Mostrador');
    }
  });

  it('el Mostrador es una pantalla del mostrador: pide sucursal de trabajo', () => {
    expect(RUTAS.find((r) => r.camino === '/mostrador')?.mostrador).toBe(true);
  });
});
