// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { preview, type PreviewServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { directivas, politicaDeContenido } from './csp';
import { entornoDeLaDemo, leerDireccionPublica, previewDeLaDemo } from './demo';

const PUBLICA = 'https://mi-demo.ngrok-free.app';

describe('La dirección pública de la demo — SPEC-KRILINXI-064', () => {
  it('sin dirección dice qué falta, en español, en vez de compilar una app que apunta a localhost', () => {
    expect(() => leerDireccionPublica(undefined)).toThrow(/Falta la dirección pública de la demo/);
    expect(() => leerDireccionPublica('   ')).toThrow(/Falta la dirección pública/);
  });

  it('exige https (la PWA instalable y sin internet no existe sin él) y una dirección completa', () => {
    expect(() => leerDireccionPublica('http://mi-demo.ngrok-free.app')).toThrow(/https:\/\//);
    expect(() => leerDireccionPublica('mi-demo.ngrok-free.app')).toThrow(/no es una dirección válida/);
  });

  it('se queda con el dominio: la barra final se quita y una ruta no vale', () => {
    expect(leerDireccionPublica(` ${PUBLICA}/ `)).toBe(PUBLICA);
    expect(() => leerDireccionPublica(`${PUBLICA}/app`)).toThrow(/no lleva ruta/);
  });

  it('la app se compila con todo por la misma dirección, y PowerSync bajo su prefijo', () => {
    expect(entornoDeLaDemo(PUBLICA)).toEqual({ VITE_API_URL: PUBLICA, VITE_POWERSYNC_URL: `${PUBLICA}/powersync` });
  });
});

describe('La política de seguridad de la demo — SPEC-KRILINXI-064', () => {
  const normal = directivas({ apiUrl: 'http://localhost:4000', powersyncUrl: 'http://localhost:8080' });
  const entorno = entornoDeLaDemo(PUBLICA);
  const demo = directivas({ apiUrl: entorno.VITE_API_URL, powersyncUrl: entorno.VITE_POWERSYNC_URL });

  it("sigue siendo 'self' más la dirección pública, sin aflojar ninguna directiva", () => {
    // La política final (sin repetidos) es lo que llega al navegador.
    expect(politicaDeContenido({ apiUrl: entorno.VITE_API_URL, powersyncUrl: entorno.VITE_POWERSYNC_URL })).toContain(`connect-src 'self' ${PUBLICA}; `);
    const sinConexiones = (d: Record<string, string[]>) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'connect-src'));
    expect(sinConexiones(demo)).toEqual(sinConexiones(normal));
    expect(Object.keys(demo)).toEqual(Object.keys(normal));
  });
});

type Visto = { metodo?: string; url?: string; cabeceras: IncomingMessage['headers']; cuerpo: string };

function servidorFalso(nombre: string, vistos: Visto[]): Promise<Server> {
  return new Promise((listo) => {
    const servidor = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on('data', (p: Buffer) => partes.push(p));
      req.on('end', () => {
        vistos.push({ metodo: req.method, url: req.url, cabeceras: req.headers, cuerpo: Buffer.concat(partes).toString() });
        res.setHeader('content-type', 'application/json');
        res.setHeader('x-quien', nombre);
        res.end(JSON.stringify({ quien: nombre }));
      });
    });
    servidor.listen(0, '127.0.0.1', () => listo(servidor));
  });
}

const puertoDe = (s: Server) => (s.address() as AddressInfo).port;

function pedir(puerto: number, host: string, metodo: string, ruta: string, cuerpo?: string) {
  return new Promise<{ estado: number; cabeceras: IncomingMessage['headers']; cuerpo: string }>((listo, falla) => {
    const cabeceras = cuerpo ? { host, 'content-type': 'application/json' } : { host };
    const req = request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: cabeceras }, (res) => {
      let texto = '';
      res.on('data', (p: Buffer) => (texto += p));
      res.on('end', () => listo({ estado: res.statusCode ?? 0, cabeceras: res.headers, cuerpo: texto }));
    });
    req.on('error', falla);
    req.end(cuerpo);
  });
}

describe('El servidor de la demo reparte los pedidos — SPEC-KRILINXI-064', () => {
  const enBackend: Visto[] = [];
  const enPowersync: Visto[] = [];
  let backend: Server;
  let powersync: Server;
  let app: PreviewServer;
  let puerto: number;
  const dominio = new URL(PUBLICA).hostname;

  beforeAll(async () => {
    backend = await servidorFalso('backend', enBackend);
    powersync = await servidorFalso('powersync', enPowersync);
    // Una carpeta de build mínima: `vite preview` exige que exista, y hace de "la app compilada".
    const raiz = mkdtempSync(join(tmpdir(), 'demo-'));
    mkdirSync(join(raiz, 'dist'));
    writeFileSync(join(raiz, 'dist', 'index.html'), '<!doctype html><title>La app</title>');
    const destinos = { backend: `http://127.0.0.1:${puertoDe(backend)}`, powersync: `http://127.0.0.1:${puertoDe(powersync)}` };
    app = await preview({
      root: raiz,
      configFile: false,
      logLevel: 'silent',
      preview: { host: '127.0.0.1', port: 0, ...previewDeLaDemo(PUBLICA, destinos) },
    });
    puerto = (app.httpServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([backend, powersync].map((s) => new Promise((ok) => s.close(ok))));
  });

  it('/api/* llega al backend con su método, su ruta, su cuerpo y sus cabeceras', async () => {
    const cuerpo = JSON.stringify({ usuario: 'demo', contrasena: 'x' });
    const res = await pedir(puerto, dominio, 'POST', '/api/auth/login?a=1', cuerpo);

    expect(res.cabeceras['x-quien']).toBe('backend');
    const visto = enBackend.at(-1)!;
    expect(visto).toMatchObject({ metodo: 'POST', url: '/api/auth/login?a=1', cuerpo });
    expect(visto.cabeceras['content-type']).toBe('application/json');
    expect(JSON.parse(res.cuerpo)).toEqual({ quien: 'backend' });
  });

  it('/powersync/* llega a PowerSync sin el prefijo, y no toca al backend', async () => {
    const antes = enBackend.length;
    const cuerpo = JSON.stringify({ buckets: [] });
    const res = await pedir(puerto, dominio, 'POST', '/powersync/sync/stream', cuerpo);

    expect(res.cabeceras['x-quien']).toBe('powersync');
    expect(enPowersync.at(-1)).toMatchObject({ metodo: 'POST', url: '/sync/stream', cuerpo });
    expect(enBackend.length).toBe(antes);
  });

  it('una pantalla de la app se sirve del build y no llega a ningún servicio', async () => {
    const antes = [enBackend.length, enPowersync.length];
    const res = await pedir(puerto, dominio, 'GET', '/');

    expect(res.estado).toBe(200);
    expect(res.cuerpo).toContain('La app');
    expect([enBackend.length, enPowersync.length]).toEqual(antes);
  });

  it('acepta el dominio de ngrok y localhost, y rechaza cualquier otro Host', async () => {
    expect((await pedir(puerto, dominio, 'GET', '/')).estado).toBe(200);
    expect((await pedir(puerto, 'localhost', 'GET', '/')).estado).toBe(200);
    expect((await pedir(puerto, 'otro-sitio.ngrok-free.app', 'GET', '/')).estado).toBe(403);
    expect((await pedir(puerto, 'evil.example', 'GET', '/api/auth/login')).estado).toBe(403);
  });

  it('en la configuración solo figura el dominio de la demo como host permitido', () => {
    expect(previewDeLaDemo(PUBLICA).allowedHosts).toEqual([dominio]);
  });
});

describe('El comando npm run demo — SPEC-KRILINXI-064', () => {
  const script = resolve(__dirname, '../../../scripts/demo/demo.mjs');
  const correr = (...args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, DEMO_URL_PUBLICA: '' } });

  it('sin dirección falla con un mensaje que dice qué falta, antes de compilar nada', () => {
    const res = correr();

    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/Falta la dirección pública de la demo/);
    expect(res.stdout).not.toMatch(/vite|build/i);
  });

  it('con una dirección válida muestra a dónde apuntará la app (modo simulación)', () => {
    const res = correr(PUBLICA, '--simular');

    expect(res.status).toBe(0);
    expect(res.stdout).toContain(`${PUBLICA}/powersync`);
  });
});
