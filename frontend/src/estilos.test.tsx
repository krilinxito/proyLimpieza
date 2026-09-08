import { beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { build } from 'vite';
import { Inicio } from './pages/Inicio';
import { renderEnRuta } from './test/render';

/**
 * Comprueba que Tailwind está de verdad enchufado: instalado, cargado como plugin de Vite,
 * leyendo nuestros archivos y emitiendo una regla por cada clase que usamos.
 *
 * Lo que este test NO puede comprobar: que el navegador pinte esos estilos. Tailwind v4
 * emite `@layer` y variables CSS, y el motor de estilos de jsdom no entiende ninguna de las
 * dos, así que `getComputedStyle` devuelve siempre los valores por defecto aunque el CSS
 * esté ahí. Verificarlo de verdad pide un navegador real y eso es otra spec.
 */
function extraerCss(resultado: Awaited<ReturnType<typeof build>>): string {
  const salidas = Array.isArray(resultado) ? resultado : [resultado];
  for (const salida of salidas) {
    if (!('output' in salida)) continue;
    for (const archivo of salida.output) {
      if (archivo.type === 'asset' && archivo.fileName.endsWith('.css')) {
        return typeof archivo.source === 'string' ? archivo.source : '';
      }
    }
  }
  return '';
}

describe('Estilos con Tailwind — SPEC-KRILINXI-001', () => {
  let css = '';

  beforeAll(async () => {
    // `write: false` compila en memoria: no ensucia dist/ ni depende de un build previo.
    css = extraerCss(await build({ logLevel: 'silent', build: { write: false } }));
  }, 60_000);

  it('el build emite hoja de estilos', () => {
    expect(css.length).toBeGreaterThan(0);
  });

  it.each(['text-3xl', 'bg-sky-700', 'rounded-lg'])(
    'genera una regla para la utilidad %s que usan las pantallas',
    (utilidad) => {
      expect(css).toMatch(new RegExp(`\\.${utilidad}\\{[^}]+\\}`));
    },
  );

  it('no arrastra utilidades que nadie usa', () => {
    // Tailwind solo emite lo que encuentra escrito en el código. El nombre se arma en
    // tiempo de ejecución a propósito: si lo escribiéramos entero aquí, el escáner lo
    // leería de este mismo archivo, generaría la regla y el test se delataría solo.
    const noUsada = ['bg', 'fuchsia', '300'].join('-');
    expect(css).not.toMatch(new RegExp(`\\.${noUsada}\\{`));
  });

  it('las pantallas llevan puestas esas clases', () => {
    renderEnRuta(<Inicio />);
    expect(screen.getByRole('link', { name: 'Registrar ropa' })).toHaveClass('bg-sky-700');
  });
});
