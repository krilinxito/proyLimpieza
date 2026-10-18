import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { App } from '../App';
import { renderEnRuta } from '../test/render';
import { sesionDePrueba } from '../test/sesion';
import { sinJerga } from '../test/jerga';
import { destinosDelMenu } from './rutas';

const tareas = () => within(screen.getByRole('navigation', { name: 'Tareas' }));

describe('Inicio como tarjetas de tareas — SPEC-KRILINXI-024', () => {
  it.each(['EMPLEADO', 'ADMIN'] as const)('a un %s le muestra una tarjeta por cada tarea del menú, en el mismo orden', (rol) => {
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ rol }) });
    const esperadas = destinosDelMenu(rol, rol === 'EMPLEADO').filter((d) => d.camino !== '/');
    const enlaces = tareas().getAllByRole('link');
    expect(enlaces).toHaveLength(esperadas.length);
    esperadas.forEach((destino, i) => {
      // El nombre es solo el título; la descripción va como descripción del enlace.
      expect(enlaces[i]).toHaveAccessibleName(destino.titulo);
      expect(enlaces[i]).toHaveAccessibleDescription(destino.descripcion);
      expect(enlaces[i]).toHaveAttribute('href', destino.camino);
      expect(enlaces[i]?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('no se lista a sí mismo', () => {
    renderEnRuta(<App />, '/');
    expect(tareas().queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
  });

  it('las tarjetas se tocan con comodidad, y en pantalla ancha van en dos columnas', () => {
    renderEnRuta(<App />, '/');
    const tarjeta = tareas().getByRole('link', { name: 'Registrar ropa' });
    expect(tarjeta).toHaveClass('min-h-24');
    expect(document.getElementById(tarjeta.getAttribute('aria-labelledby') ?? '')).toHaveClass('text-2xl');
    expect(tarjeta.closest('ul')).toHaveClass('lg:grid-cols-2');
  });

  it('saluda por su nombre a quien atiende, debajo del título', () => {
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ nombreCompleto: 'Rosa Quispe' }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Lavandería' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('Hola, Rosa Quispe')).toBeInTheDocument();
  });

  it('no usa palabras del sistema', () => {
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    sinJerga();
  });
});

describe('Ingreso, página no encontrada y avisos de rol — SPEC-KRILINXI-024', () => {
  it('el ingreso es una tarjeta con el negocio arriba, el título y el formulario de siempre', () => {
    renderEnRuta(<App />, '/ingresar', { sesion: null });
    const titulo = screen.getByRole('heading', { level: 1, name: 'Ingresar al sistema' });
    const tarjeta = titulo.parentElement;
    expect(tarjeta).toHaveClass('bg-superficie', 'rounded-2xl', 'max-w-md');
    if (!tarjeta) throw new Error('el título tiene que estar en la tarjeta');
    expect(within(tarjeta).getByText('Lavandería')).toBeInTheDocument();
    expect(within(tarjeta).getByLabelText('Usuario')).toBeInTheDocument();
    expect(within(tarjeta).getByLabelText('Contraseña')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('la página no encontrada ofrece un solo camino: "Volver al inicio", con aspecto de botón', () => {
    renderEnRuta(<App />, '/no-existe');
    const contenido = within(screen.getByRole('main'));
    const volver = contenido.getAllByRole('link');
    expect(volver).toHaveLength(1);
    expect(volver[0]).toHaveAccessibleName('Volver al inicio');
    expect(volver[0]).toHaveClass('bg-marca', 'min-h-14');
  });

  it.each([
    ['un EMPLEADO en una pantalla del administrador', '/personal', 'EMPLEADO', /solo para el administrador/],
  ] as const)('%s ve el aviso con el tema y el camino de vuelta', (_caso, ruta, rol, texto) => {
    renderEnRuta(<App />, ruta, { sesion: sesionDePrueba({ rol }) });
    const aviso = within(screen.getByRole('main')).getByText(texto).closest('[role="status"]');
    expect(aviso).toHaveClass('bg-info-fondo');
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});
