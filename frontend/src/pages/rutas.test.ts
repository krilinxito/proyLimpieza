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
    expect(destinosDelMenu('EMPLEADO').map((d) => d.titulo)).toEqual([
      'Inicio',
      'Registrar ropa',
      'Ropa en el local',
      'Entregar ropa',
      'Cobrar',
      'Clientes',
    ]);
  });

  it('un ADMIN ve el Inicio y lo suyo, no Registrar ropa', () => {
    expect(destinosDelMenu('ADMIN').map((d) => d.titulo)).toEqual([
      'Inicio',
      'Clientes',
      'Personal',
      'Sucursales',
      '¿Quién hizo qué?',
      'Estadísticas',
    ]);
  });

  it.each([
    ['/', 'Lavandería'],
    ['/registrar-ropa', 'Registrar ropa · Lavandería'],
    ['/quien-hizo-que', '¿Quién hizo qué? · Lavandería'],
    ['/no-existe', 'Esa página no existe · Lavandería'],
  ])('la pestaña de %s se llama "%s"', (camino, titulo) => {
    expect(tituloDePestana(camino)).toBe(titulo);
  });
});
