import { describe, expect, it, vi } from 'vitest';
import { registrarServiceWorker } from './registrar';

function navegadorConServiceWorker() {
  const register = vi.fn(async (_url: string, _opciones: { scope: string }) => ({}));
  return { navegador: { serviceWorker: { register } }, register };
}

describe('Registrar el service worker — SPEC-KRILINXI-011', () => {
  it('en la app compilada lo registra desde la raíz', async () => {
    const { navegador, register } = navegadorConServiceWorker();
    await registrarServiceWorker({ produccion: true, navegador, base: '/' });
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js', { scope: '/' });
  });

  it('en `npm run dev` no lo registra: guardaría código viejo', async () => {
    const { navegador, register } = navegadorConServiceWorker();
    await registrarServiceWorker({ produccion: false, navegador, base: '/' });
    expect(register).not.toHaveBeenCalled();
  });

  it('en los tests no se registra: así lo llama main.tsx, y aquí PROD es false', () => {
    expect(import.meta.env.PROD).toBe(false);
  });

  it('un navegador sin service workers sigue funcionando, solo que no abre sin internet', async () => {
    await expect(registrarServiceWorker({ produccion: true, navegador: {}, base: '/' })).resolves.toBeUndefined();
  });

  it('si el registro falla, avisa en la consola y no tumba la app', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const navegador = { serviceWorker: { register: vi.fn(async () => Promise.reject(new Error('bloqueado'))) } };
    await expect(registrarServiceWorker({ produccion: true, navegador, base: '/' })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });
});
