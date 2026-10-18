import { describe, expect, it } from 'vitest';
import { apilar, hayDatos, indiceDelMayor, largo, masRecibidasPrimero, porciento, rotulosDelEje, TOPE_BARRA } from './escalas';

describe('Las cuentas de los gráficos — SPEC-KRILINXI-026', () => {
  describe('largo', () => {
    it('el más grande llega al tope, y los demás en proporción', () => {
      expect(largo(400, 400)).toBe(TOPE_BARRA);
      expect(largo(100, 400)).toBe(TOPE_BARRA / 4);
      expect(largo(50, 100, 80)).toBe(40);
    });

    it('cero no ocupa lugar, y un máximo en cero no divide por cero', () => {
      expect(largo(0, 400)).toBe(0);
      expect(largo(0, 0)).toBe(0);
      expect(largo(5, 0)).toBe(0);
    });

    it('algo chiquito al lado de algo enorme igual se ve', () => {
      expect(largo(1, 1_000_000)).toBe(1);
    });
  });

  describe('apilar', () => {
    it('cada tramo empieza donde terminó el anterior, con la escala de la barra más larga', () => {
      const tramos = apilar(
        [
          { clave: 'EFECTIVO', valor: 300 },
          { clave: 'QR', valor: 100 },
        ],
        400,
        80,
      );
      expect(tramos).toEqual([
        { clave: 'EFECTIVO', valor: 300, desde: 0, ancho: 60 },
        { clave: 'QR', valor: 100, desde: 60, ancho: 20 },
      ]);
    });

    it('un método sin ingresos no ocupa lugar ni deja hueco', () => {
      const tramos = apilar(
        [
          { clave: 'EFECTIVO', valor: 100 },
          { clave: 'QR', valor: 0 },
          { clave: 'TARJETA', valor: 100 },
        ],
        200,
        80,
      );
      expect(tramos.map((t) => t.clave)).toEqual(['EFECTIVO', 'TARJETA']);
      expect(tramos[1]).toEqual(expect.objectContaining({ desde: 40, ancho: 40 }));
    });

    it('una barra de puros ceros no tiene tramos', () => {
      expect(apilar([{ clave: 'EFECTIVO', valor: 0 }], 0)).toEqual([]);
    });
  });

  describe('rotulosDelEje', () => {
    it('con pocos días, todos llevan su fecha', () => {
      expect([...rotulosDelEje(3)]).toEqual([0, 1, 2]);
    });

    it('con 30 días escribe seis fechas repartidas, la primera y la última incluidas', () => {
      const rotulos = [...rotulosDelEje(30)].sort((a, b) => a - b);
      expect(rotulos).toEqual([0, 6, 12, 18, 24, 29]);
    });

    it('nunca escribe dos fechas pegadas al final', () => {
      // Con paso 2 sobre 8 días tocaría 0, 2, 4, 6 y la última (7) quedaría pegada al 6.
      const rotulos = [...rotulosDelEje(8, 5)].sort((a, b) => a - b);
      expect(rotulos).toEqual([0, 2, 4, 7]);
    });
  });

  it('indiceDelMayor elige el primero de los más altos, y ninguno si todo es cero', () => {
    expect(indiceDelMayor([2, 4, 4, 0])).toBe(1);
    expect(indiceDelMayor([0, 0])).toBe(-1);
  });

  it('masRecibidasPrimero ordena de más a menos, conserva los empates y no toca la lista original', () => {
    const filas = [
      { quien: 'Ana', ordenesRecibidas: 3 },
      { quien: 'Beto', ordenesRecibidas: 12 },
      { quien: 'Carla', ordenesRecibidas: 3 },
    ];
    expect(masRecibidasPrimero(filas).map((f) => f.quien)).toEqual(['Beto', 'Ana', 'Carla']);
    expect(filas.map((f) => f.quien)).toEqual(['Ana', 'Beto', 'Carla']);
  });

  it('hayDatos: un período de puros ceros no tiene nada que dibujar', () => {
    expect(hayDatos([0, 0, 0])).toBe(false);
    expect(hayDatos([0, 3])).toBe(true);
    expect(hayDatos([])).toBe(false);
  });

  it('porciento escribe el atributo del SVG con dos decimales como mucho', () => {
    expect(porciento(100 / 3)).toBe('33.33%');
    expect(porciento(50)).toBe('50%');
  });
});
