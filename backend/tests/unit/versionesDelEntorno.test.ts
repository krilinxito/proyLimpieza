import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Una sola versión de Node y de npm para todo el equipo — SPEC-KRILINXI-045. Son cuatro archivos de la raíz que
// tienen que decir lo mismo: `package.json` (`engines`), `.npmrc` (`engine-strict`), `.nvmrc` (la versión para nvm) y
// `package-lock.json` (que npm regenera con la versión que lo corre). Si uno se desfasa, `npm install` deja de
// proteger a nadie, o el lock vuelve a cambiar según quién lo corrió. Este test no instala nada: solo lee y compara.
const RAIZ = resolve(import.meta.dirname, '../../..');
const leer = (archivo: string) => readFileSync(resolve(RAIZ, archivo), 'utf8');

const paquete = JSON.parse(leer('package.json')) as { engines: { node: string; npm: string } };
const lock = JSON.parse(leer('package-lock.json')) as { packages: Record<string, { engines?: { node: string; npm: string } }> };

describe('Versiones acordadas de Node y npm — SPEC-KRILINXI-045', () => {
  it('package.json declara Node 24 y npm 11', () => {
    expect(paquete.engines).toEqual({ node: '>=24 <25', npm: '>=11 <12' });
  });

  it('.npmrc hace que npm install falle (y no solo avise) con otra versión', () => {
    // Una línea activa, no un comentario: `# engine-strict=true` no cuenta.
    const activas = leer('.npmrc')
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea !== '' && !linea.startsWith('#'));

    expect(activas).toContain('engine-strict=true');
  });

  it('.nvmrc dice la versión mayor de Node que pide package.json', () => {
    const mayorDelEngine = /^>=(\d+)/.exec(paquete.engines.node)?.[1];

    expect(leer('.nvmrc').trim()).toBe(mayorDelEngine);
    expect(mayorDelEngine).toBe('24');
  });

  it('el package-lock.json se regeneró con los mismos engines: si no, alguien cambió package.json sin correr npm install', () => {
    expect(lock.packages['']?.engines).toEqual(paquete.engines);
  });
});
