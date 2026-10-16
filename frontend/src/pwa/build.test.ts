// @vitest-environment node
/**
 * Lo que de verdad sale del build — SPEC-KRILINXI-011.
 *
 * El service worker solo existe en la app compilada, así que la forma honesta de probar el
 * manifest y la lista del precache es compilar. Este test corre `vite build` con la
 * configuración real (`vite.config.ts`) hacia una carpeta temporal y mira qué quedó.
 *
 * Por qué vale la pena aunque tarde unos segundos: si alguien baja el tope de tamaño o cambia
 * el patrón de archivos, los WASM de PowerSync dejan de guardarse y nada falla… hasta que una
 * sucursal se queda sin internet y la base local no abre. Este test lo dice antes.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';

const RAIZ = resolve(import.meta.dirname, '../..');
let salida = '';

beforeAll(async () => {
  salida = await mkdtemp(join(tmpdir(), 'lavanderia-build-'));
  await build({
    root: RAIZ,
    configFile: join(RAIZ, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: salida, emptyOutDir: true },
  });
}, 120_000);

afterAll(async () => {
  if (salida) await rm(salida, { recursive: true, force: true });
});

async function leerJson(archivo: string): Promise<unknown> {
  return JSON.parse(await readFile(join(salida, archivo), 'utf8'));
}

/** Ancho y alto de un PNG: están en la cabecera, bytes 16 a 24. */
async function medidasPng(archivo: string): Promise<[number, number]> {
  const bytes = await readFile(join(salida, archivo));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('PWA: el manifest para instalarla en la tablet — SPEC-KRILINXI-011', () => {
  it('se llama "Lavandería", abre en "/" a pantalla completa', async () => {
    expect(await leerJson('manifest.webmanifest')).toMatchObject({
      name: 'Lavandería',
      start_url: '/',
      display: 'standalone',
    });
  });

  it('trae íconos de 192 y 512 px, y los archivos miden lo que dicen', async () => {
    const manifest = await leerJson('manifest.webmanifest');
    const iconos = (manifest as { icons: { src: string; sizes: string }[] }).icons;
    expect(iconos.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icono of iconos) {
      const [ancho, alto] = await medidasPng(icono.src);
      expect(`${ancho}x${alto}`).toBe(icono.sizes);
    }
  });

  it('el index.html enlaza el manifest', async () => {
    expect(await readFile(join(salida, 'index.html'), 'utf8')).toContain('rel="manifest" href="/manifest.webmanifest"');
  });
});

describe('PWA: lo que queda guardado para abrir sin internet — SPEC-KRILINXI-011', () => {
  it('genera el service worker', async () => {
    expect(await readdir(salida)).toContain('sw.js');
  });

  it('el precache tiene el HTML y cada JS, CSS y WASM del build, también los workers de PowerSync', async () => {
    const sw = await readFile(join(salida, 'sw.js'), 'utf8');
    const assets = await readdir(join(salida, 'assets'));

    // Que no pase de vacío a "todo bien": el build tiene que traer lo de PowerSync.
    expect(assets.filter((a) => a.endsWith('.wasm')).length).toBeGreaterThan(0);
    expect(assets.some((a) => /worker/i.test(a))).toBe(true);

    expect(sw).toContain('"index.html"');
    for (const archivo of assets) expect(sw, `falta guardar ${archivo}`).toContain(`assets/${archivo}`);
  });

  it('el service worker no toca la sesión ni la base local: solo su propia caché de archivos', async () => {
    const sw = await readFile(join(salida, 'sw.js'), 'utf8');
    expect(sw).not.toMatch(/localStorage|indexedDB|deleteDatabase|getDirectory/);
  });
});
