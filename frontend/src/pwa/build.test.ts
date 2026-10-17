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

describe('PWA: la letra de la app viaja con ella — SPEC-KRILINXI-022', () => {
  // El test de arriba ya exige que todo lo de assets/ esté en el precache. Este dice además que
  // la letra ESTÉ en assets/: si alguien la cambia por una de Google Fonts, el de arriba seguiría
  // pasando (no habría woff2 que guardar) y la tablet, sin internet, mostraría la del sistema.
  it('las dos letras (normal y negrita) salen del propio sitio y quedan guardadas', async () => {
    const sw = await readFile(join(salida, 'sw.js'), 'utf8');
    const letras = (await readdir(join(salida, 'assets'))).filter((a) => a.endsWith('.woff2'));
    expect(letras.map((a) => a.replace(/-[\w-]{8}\.woff2$/, ''))).toEqual(
      expect.arrayContaining(['atkinson-hyperlegible-latin-400-normal', 'atkinson-hyperlegible-latin-700-normal']),
    );
    for (const letra of letras) expect(sw, `falta guardar ${letra}`).toContain(`assets/${letra}`);
  });
});

describe('PWA: la política de seguridad del contenido — SPEC-KRILINXI-020', () => {
  async function politica(): Promise<string> {
    const html = await readFile(join(salida, 'index.html'), 'utf8');
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
    if (!meta?.[1]) throw new Error('El index.html del build no trae la política de seguridad.');
    // Vite escribe las comillas del atributo como entidades (&#39;); el navegador las decodifica.
    return meta[1].replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  }

  it('el index.html del build la trae, antes que cualquier script', async () => {
    const html = await readFile(join(salida, 'index.html'), 'utf8');
    expect(html.indexOf('Content-Security-Policy')).toBeGreaterThan(-1);
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
  });

  it('se conecta solo al sitio y a los dos servicios del entorno', async () => {
    expect(await politica()).toContain("connect-src 'self' http://localhost:4000 http://localhost:8080");
  });

  it('no permite nada en línea ni conexiones a cualquier origen', async () => {
    expect(await politica()).not.toMatch(/'unsafe-inline'|'unsafe-eval'|(^|\s)\*(\s|;|$)/);
  });

  it('el build no trae scripts ni estilos en línea que la política bloquearía', async () => {
    const html = await readFile(join(salida, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/<style\b|\sstyle="/);
  });
});
