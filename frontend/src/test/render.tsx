/**
 * Helper de test compartido — SPEC-KRILINXI-001, ampliado en SPEC-KRILINXI-003
 *
 * Casi toda pantalla de este proyecto usa enlaces o lee la ruta actual, y eso revienta si
 * se renderiza suelta: React Router necesita un Router por encima. `MemoryRouter` es uno
 * que guarda la ruta en memoria en vez de en la barra del navegador, que es justo lo que
 * hace falta en un test.
 *
 * Desde SPEC-KRILINXI-003 también monta la sesión, y por defecto **con alguien adentro** (un
 * EMPLEADO): es el caso de casi todas las pantallas. Para otro caso, se pide explícito:
 *
 *     renderEnRuta(<App />, '/cobrar');                                        // empleado
 *     renderEnRuta(<App />, '/estadisticas', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
 *     renderEnRuta(<App />, '/cobrar', { sesion: null });                      // nadie adentro
 */
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { borrarSesion, guardarSesion } from '../features/auth/api/almacen';
import { SesionProvider } from '../features/auth/SesionProvider';
import type { Sesion } from '../features/auth/types';
import { sesionDePrueba } from './sesion';

type Opciones = { sesion?: Sesion | null };

export function renderEnRuta(ui: ReactElement, ruta = '/', { sesion = sesionDePrueba() }: Opciones = {}) {
  // Se guarda donde la guardaría un login de verdad: así el provider la encuentra igual que
  // al abrir la app, y el test no depende de cómo está hecho por dentro.
  if (sesion) guardarSesion(sesion);
  else borrarSesion();

  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SesionProvider>{ui}</SesionProvider>
    </MemoryRouter>,
  );
}
