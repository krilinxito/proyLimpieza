// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * Los íconos de la app instalada — SPEC-KRILINXI-059. Se leen los PNG de `public/` (los que genera `scripts/generar-iconos.mjs`) y
 * se comprueba lo que se ve: que midan lo que dicen, que su fondo sea el turquesa de la marca y que el dibujo del ícono
 * "maskable" quede dentro de la zona segura. Un ícono con el azul de antes sería lo primero que se nota en el celular.
 */
const RAIZ = resolve(import.meta.dirname, '../..');
// Se lee una sola vez: el test de la zona segura mira miles de píxeles.
const MARCA: [number, number, number] = (() => {
  const hex = /--color-marca:\s*#([0-9a-fA-F]{6})/.exec(readFileSync(resolve(RAIZ, 'src/index.css'), 'utf8'))?.[1] ?? '';
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
})();
const marca = () => MARCA;

type Png = { ancho: number; alto: number; pixel: (x: number, y: number) => [number, number, number] };

/** Lee un PNG sin filtros de color RGB de 8 bits, que es lo que escribe el generador. */
function leerPng(archivo: string): Png {
  const bytes = readFileSync(resolve(RAIZ, 'public', archivo));
  const ancho = bytes.readUInt32BE(16);
  const alto = bytes.readUInt32BE(20);
  expect([bytes[24], bytes[25]]).toEqual([8, 2]);
  const trozos: Buffer[] = [];
  for (let desde = 8; desde < bytes.length; ) {
    const largo = bytes.readUInt32BE(desde);
    if (bytes.toString('ascii', desde + 4, desde + 8) === 'IDAT') trozos.push(bytes.subarray(desde + 8, desde + 8 + largo));
    desde += 12 + largo;
  }
  const datos = inflateSync(Buffer.concat(trozos));
  const paso = 1 + ancho * 3;
  // El filtro "ninguno" al principio de cada fila: así lo escribe el generador, y así se lee sin deshacer nada.
  for (let y = 0; y < alto; y++) expect(datos[y * paso]).toBe(0);
  return {
    ancho,
    alto,
    pixel: (x, y) => {
      const i = y * paso + 1 + x * 3;
      return [datos[i] ?? 0, datos[i + 1] ?? 0, datos[i + 2] ?? 0];
    },
  };
}

describe('Los íconos de la app: del color de la marca — SPEC-KRILINXI-059', () => {
  it.each([
    ['icono-192.png', 192],
    ['icono-512.png', 512],
    ['icono-maskable-512.png', 512],
  ])('%s mide %i×%i', (archivo, lado) => {
    const png = leerPng(archivo);
    expect([png.ancho, png.alto]).toEqual([lado, lado]);
  });

  it.each(['icono-192.png', 'icono-512.png', 'icono-maskable-512.png'])('%s tiene el fondo turquesa de la marca en las cuatro esquinas', (archivo) => {
    const png = leerPng(archivo);
    for (const [x, y] of [
      [0, 0],
      [png.ancho - 1, 0],
      [0, png.alto - 1],
      [png.ancho - 1, png.alto - 1],
    ] as const) {
      expect(png.pixel(x, y)).toEqual(marca());
    }
  });

  it('el dibujo está: la carcasa blanca en el medio de arriba, y no es todo del mismo color', () => {
    const png = leerPng('icono-512.png');
    // Un punto de la carcasa, entre los botones y la puerta.
    expect(png.pixel(256, 110)).toEqual([255, 255, 255]);
    // El agua del tambor: celeste-turquesa, distinta de la marca.
    expect(png.pixel(256, 240)).not.toEqual(marca());
    expect(png.pixel(256, 240)).not.toEqual([255, 255, 255]);
  });

  it('el ícono "maskable" deja el dibujo dentro de la zona segura: un círculo del 80% del lado', () => {
    const png = leerPng('icono-maskable-512.png');
    const centro = png.ancho / 2;
    const radioSeguro = png.ancho * 0.4;
    // Todo píxel que no es de la marca (es decir, del dibujo) cae dentro del círculo seguro.
    let afuera = 0;
    for (let y = 0; y < png.alto; y += 2) {
      for (let x = 0; x < png.ancho; x += 2) {
        const [r, g, b] = png.pixel(x, y);
        const esMarca = [r, g, b].every((canal, i) => canal === marca()[i]);
        if (!esMarca && Math.hypot(x - centro, y - centro) > radioSeguro) afuera += 1;
      }
    }
    expect(afuera).toBe(0);
  });

  it('el ícono común usa más del lado que el "maskable": el maskable es el mismo dibujo, más chico', () => {
    const ancho = (archivo: string) => {
      const png = leerPng(archivo);
      let primero = png.ancho;
      let ultimo = 0;
      const y = Math.floor(png.alto * 0.5);
      for (let x = 0; x < png.ancho; x++) {
        const [r, g, b] = png.pixel(x, y);
        if (![r, g, b].every((canal, i) => canal === marca()[i])) {
          primero = Math.min(primero, x);
          ultimo = Math.max(ultimo, x);
        }
      }
      return (ultimo - primero) / png.ancho;
    };
    expect(ancho('icono-maskable-512.png')).toBeLessThan(ancho('icono-512.png'));
  });
});
