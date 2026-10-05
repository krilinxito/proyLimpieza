import { describe, expect, it } from 'vitest';
import { entornoDePrueba } from './entorno.js';
import { prepararBase } from './preparar.js';

// La garantía de seguridad de la suite: los tests escriben en `<nombre>_test` y
// NUNCA en la base de DATABASE_URL, que es la de desarrollo de cada uno.
// `entornoDePrueba` es una función pura (recibe el entorno, devuelve URLs), así
// que se prueba con entornos inventados, sin conectarse a nada.

const DESARROLLO = 'postgresql://lavanderia:secreta@localhost:5434/lavanderia';

describe('Entorno de la base de pruebas — SPEC-ALE186-007', () => {
  it('usa la base de DATABASE_URL con el sufijo _test, en el mismo servidor', () => {
    const { nombre, urlPrueba } = entornoDePrueba({ DATABASE_URL: DESARROLLO });

    expect(nombre).toBe('lavanderia_test');
    expect(urlPrueba).toBe('postgresql://lavanderia:secreta@localhost:5434/lavanderia_test');
  });

  it('nunca devuelve la URL de desarrollo como base de pruebas', () => {
    const { urlPrueba, urlMantenimiento } = entornoDePrueba({ DATABASE_URL: DESARROLLO });

    expect(urlPrueba).not.toBe(DESARROLLO);
    expect(urlMantenimiento).not.toBe(DESARROLLO);
    expect(new URL(urlPrueba).pathname).not.toBe(new URL(DESARROLLO).pathname);
  });

  it('borra y crea desde postgres, la base de mantenimiento, no desde la de desarrollo', () => {
    const { urlMantenimiento } = entornoDePrueba({ DATABASE_URL: DESARROLLO });

    expect(new URL(urlMantenimiento).pathname).toBe('/postgres');
  });

  it('falla con un mensaje claro si falta DATABASE_URL', () => {
    expect(() => entornoDePrueba({})).toThrow(/Falta DATABASE_URL/);
  });

  it.each([
    ['comillas', 'postgresql://u:p@localhost:5434/lav"anderia'],
    ['un punto y coma', 'postgresql://u:p@localhost:5434/lav%3Banderia'],
    ['un espacio', 'postgresql://u:p@localhost:5434/lav%20anderia'],
  ])('rechaza un nombre de base con %s: va escrito dentro del DROP DATABASE', (_caso, url) => {
    expect(() => entornoDePrueba({ DATABASE_URL: url })).toThrow(/caracteres que los tests no aceptan/);
  });
});

describe('Preparar la base sin Postgres — SPEC-ALE186-007', () => {
  it('falla al empezar con un mensaje en español que dice cómo levantar Docker', async () => {
    // Un puerto en el que no escucha nadie: la conexión se rechaza al instante.
    const sinServidor = { DATABASE_URL: 'postgresql://lavanderia:x@localhost:5999/lavanderia' };

    await expect(prepararBase(sinServidor)).rejects.toThrow(
      /No se pudo conectar a Postgres[\s\S]*docker compose up -d postgres[\s\S]*ECONNREFUSED/,
    );
  });
});
