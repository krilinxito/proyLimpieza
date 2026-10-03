import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from './App';
import { leerSesion } from './features/auth/api/almacen';
import { api } from './lib/api';
import { RUTAS } from './pages/rutas';
import { cuerpoError, simularApi } from './test/apiFalsa';
import { renderEnRuta } from './test/render';
import { sesionDePrueba } from './test/sesion';

describe('App — SPEC-KRILINXI-001', () => {
  it('muestra el menú del mostrador en la ruta raíz', () => {
    renderEnRuta(<App />, '/');
    expect(screen.getByRole('heading', { name: 'Lavandería' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar ropa' })).toBeInTheDocument();
  });

  it('muestra una pantalla en español cuando la dirección no existe', () => {
    renderEnRuta(<App />, '/esta-ruta-no-existe');
    expect(screen.getByRole('heading', { name: 'Esa página no existe' })).toBeInTheDocument();
  });

  // Recorre el propio registro: si alguien añade una ruta sin pantalla, este test lo caza.
  // Entra como quien puede ver cada una: sin sesión a la pública, como ADMIN al resto.
  it.each(RUTAS.map((r) => [r.camino, r.titulo, r.acceso === 'publica'] as const))(
    'la ruta %s responde con su pantalla',
    (camino, titulo, publica) => {
      renderEnRuta(<App />, camino, { sesion: publica ? null : sesionDePrueba({ rol: 'ADMIN' }) });
      const esperado = camino === '/' ? 'Lavandería' : titulo;
      expect(screen.getByRole('heading', { name: esperado })).toBeInTheDocument();
    },
  );
});

describe('App: rutas protegidas — SPEC-KRILINXI-003', () => {
  it.each(RUTAS.filter((r) => r.acceso !== 'publica').map((r) => r.camino))(
    'sin sesión, %s lleva a la pantalla de ingreso',
    (camino) => {
      renderEnRuta(<App />, camino, { sesion: null });
      expect(screen.getByRole('heading', { name: 'Ingresar al sistema' })).toBeInTheDocument();
      expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
    },
  );

  it('con sesión guardada abre directo, sin pedir la contraseña ni llamar a la API', () => {
    // Es lo que pasa al recargar la página: la sesión ya está en el dispositivo.
    const servidor = simularApi(() => 'sin-conexion');
    renderEnRuta(<App />, '/cobrar');
    expect(screen.getByRole('heading', { name: 'Cobrar' })).toBeInTheDocument();
    expect(servidor.pedidos).toEqual([]);
  });

  it('cuando la API rechaza el token (401), borra la sesión y vuelve a la pantalla de ingreso', async () => {
    simularApi(() => ({ status: 401, data: cuerpoError('NO_AUTENTICADO', 'Tu sesión venció.') }));
    renderEnRuta(<App />, '/clientes');
    expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument();

    // Cualquier petición autenticada sirve: cuando existan, la hará una feature.
    await act(() => api.get('/clientes').catch(() => {}));

    expect(await screen.findByRole('heading', { name: 'Ingresar al sistema' })).toBeInTheDocument();
    expect(leerSesion()).toBeNull();
  });
});

describe('App: menú por rol — SPEC-KRILINXI-003', () => {
  const nombresDelMenu = () =>
    within(screen.getByRole('navigation'))
      .getAllByRole('link')
      .map((enlace) => enlace.textContent);

  it('un EMPLEADO ve Registrar ropa, Ropa en el local, Entregar ropa, Cobrar y Clientes (SPEC-KRILINXI-008)', () => {
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ rol: 'EMPLEADO' }) });
    expect(nombresDelMenu()).toEqual(['Registrar ropa', 'Ropa en el local', 'Entregar ropa', 'Cobrar', 'Clientes']);
  });

  it('un ADMIN además ve Estadísticas, y no ve Registrar ropa (SPEC-KRILINXI-006)', () => {
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    // Ni Ropa en el local, ni Cobrar (SPEC-KRILINXI-008), ni Entregar ropa (SPEC-KRILINXI-009):
    // son del mostrador.
    expect(nombresDelMenu()).toEqual(['Clientes', 'Estadísticas']);
  });

  it('un EMPLEADO que escribe /estadisticas ve que esa parte es solo para el administrador', () => {
    renderEnRuta(<App />, '/estadisticas', { sesion: sesionDePrueba({ rol: 'EMPLEADO' }) });
    expect(screen.getByText(/solo para el administrador/)).toBeInTheDocument();
    expect(screen.queryByText('Esta parte todavía no está hecha.')).not.toBeInTheDocument();
  });
});

describe('App: quién atiende y salir — SPEC-KRILINXI-003', () => {
  it('muestra el nombre de quien está usando la tablet', () => {
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ nombreCompleto: 'Rosa Quispe' }) });
    expect(screen.getByText('Rosa Quispe')).toBeInTheDocument();
  });

  it('Salir pide confirmación avisando que para volver hace falta internet', () => {
    renderEnRuta(<App />, '/');
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Salir del sistema?' });
    expect(dialogo).toHaveAccessibleDescription(/conexión a internet/);
  });

  it('cancelar no cierra la sesión', () => {
    renderEnRuta(<App />, '/');
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(leerSesion()).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Lavandería' })).toBeInTheDocument();
  });

  it('confirmar borra la sesión del dispositivo y vuelve a la pantalla de ingreso', async () => {
    renderEnRuta(<App />, '/');
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, salir' }));
    expect(await screen.findByRole('heading', { name: 'Ingresar al sistema' })).toBeInTheDocument();
    await waitFor(() => expect(leerSesion()).toBeNull());
  });
});
