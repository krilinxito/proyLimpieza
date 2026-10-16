import { describe, expect, it, vi } from 'vitest';
import { esperarQueSeActive, esPedidoDeTomarElMando, puedeTomarElMando, respuestaQueRecarga, TOMAR_EL_MANDO } from './actualizar';

describe('Service worker: pasar a la versión nueva — SPEC-KRILINXI-011', () => {
  it('al recargar la única ventana, la versión que espera toma el mando', () => {
    expect(puedeTomarElMando(1)).toBe(true);
  });

  it('con otra ventana abierta espera: esa ventana todavía usa la versión vieja', () => {
    expect(puedeTomarElMando(2)).toBe(false);
  });

  it('la respuesta pide recargar, por cabecera y por <meta>', async () => {
    const respuesta = respuestaQueRecarga();
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('Refresh')).toBe('0');
    expect(await respuesta.text()).toContain('<meta http-equiv="refresh" content="0">');
  });

  it('solo el mensaje exacto hace tomar el mando', () => {
    expect(esPedidoDeTomarElMando({ tipo: TOMAR_EL_MANDO })).toBe(true);
    expect(esPedidoDeTomarElMando({ tipo: 'OTRA_COSA' })).toBe(false);
    expect(esPedidoDeTomarElMando(TOMAR_EL_MANDO)).toBe(false);
    expect(esPedidoDeTomarElMando(null)).toBe(false);
  });
});

/** Un `ServiceWorker` de mentira: un EventTarget con `state`, que el test cambia a mano. */
function versionFalsa(state: ServiceWorkerState) {
  const version = Object.assign(new EventTarget(), { state });
  const pasarA = (nuevo: ServiceWorkerState) => {
    version.state = nuevo;
    version.dispatchEvent(new Event('statechange'));
  };
  return { version, pasarA };
}

describe('Service worker: esperar a que la versión nueva se active — SPEC-KRILINXI-011', () => {
  it('si ya está activa, no espera', async () => {
    await expect(esperarQueSeActive(versionFalsa('activated').version)).resolves.toBeUndefined();
  });

  it('espera hasta que pasa a activa, y recién ahí sigue', async () => {
    const { version, pasarA } = versionFalsa('installed');
    let listo = false;
    const espera = esperarQueSeActive(version).then(() => {
      listo = true;
    });

    pasarA('activating');
    await Promise.resolve();
    expect(listo).toBe(false);

    pasarA('activated');
    await espera;
    expect(listo).toBe(true);
  });

  it('si no se activa nunca, sigue igual al llegar al tope: mejor recargar que colgar la pantalla', async () => {
    vi.useFakeTimers();
    try {
      const espera = esperarQueSeActive(versionFalsa('installed').version, 3000);
      await vi.advanceTimersByTimeAsync(3000);
      await expect(espera).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
