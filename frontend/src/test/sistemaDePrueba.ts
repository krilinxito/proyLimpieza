/**
 * La preferencia de la tablet, para los tests — SPEC-KRILINXI-030.
 *
 * jsdom no trae `window.matchMedia`, así que una app que pregunta "¿el sistema prefiere oscuro?"
 * siempre oye "no". Este doble lo reemplaza mientras dura el test y deja cambiar la respuesta
 * en vivo, como cuando la tablet pasa sola a modo oscuro de noche:
 *
 *     const sistema = sistemaDePrueba({ oscuro: true });   // la tablet arranca en oscuro
 *     renderEnRuta(<App />);
 *     act(() => sistema.cambiar({ oscuro: false }));         // y pasa a claro
 *
 * Solo entiende `(prefers-color-scheme: dark)`; cualquier otra consulta responde "no". Se
 * deshace solo al terminar el test.
 */
import { onTestFinished, vi } from 'vitest';

const OSCURO = '(prefers-color-scheme: dark)';

export function sistemaDePrueba({ oscuro }: { oscuro: boolean }) {
  let prefiereOscuro = oscuro;
  const oyentes = new Set<(evento: MediaQueryListEvent) => void>();

  const matchMedia = vi.fn((consulta: string) => ({
    media: consulta,
    get matches() {
      return consulta === OSCURO && prefiereOscuro;
    },
    addEventListener: (_tipo: 'change', oyente: (evento: MediaQueryListEvent) => void) => oyentes.add(oyente),
    removeEventListener: (_tipo: 'change', oyente: (evento: MediaQueryListEvent) => void) => oyentes.delete(oyente),
  }));

  vi.stubGlobal('matchMedia', matchMedia);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });

  return {
    /** Cuántos siguen escuchando: para comprobar que nadie se olvida de dejar de escuchar. */
    oyentes: () => oyentes.size,
    cambiar({ oscuro: nuevo }: { oscuro: boolean }) {
      prefiereOscuro = nuevo;
      for (const oyente of oyentes) oyente({ matches: nuevo, media: OSCURO } as MediaQueryListEvent);
    },
  };
}
