/**
 * Un navegador sin red — SPEC-KRILINXI-017
 *
 * Las pantallas del admin que escriben directo a la API miran `navigator.onLine` (vía
 * `useEnLinea`) para deshabilitar sus botones. jsdom siempre dice que hay red; esto lo cambia
 * y avisa con el evento `offline`, como lo haría el navegador:
 *
 *     sinRed();                       // antes o después de montar la pantalla
 *     expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
 *     volverLaRed();                  // `online` y navigator.onLine = true
 *
 * Se restaura sola al terminar el test. Es la red del navegador, no la del servidor: para que
 * la API no conteste, sigue siendo `simularApi(() => 'sin-conexion')`.
 */
import { act } from '@testing-library/react';
import { onTestFinished, vi } from 'vitest';

export function sinRed(): void {
  const espia = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  onTestFinished(() => espia.mockRestore());
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

export function volverLaRed(): void {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}
