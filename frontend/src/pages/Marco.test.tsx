import { describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { App } from '../App';
import type { Fila } from '../lib/powersync/control';
import { controlFalso } from '../test/controlFalso';
import { renderEnRuta } from '../test/render';
import { sesionDePrueba } from '../test/sesion';
import { sistemaDePrueba } from '../test/sistemaDePrueba';

const EMPLEADO = sesionDePrueba({ rol: 'EMPLEADO', nombreCompleto: 'Rosa Quispe' });
const ADMIN = sesionDePrueba({ rol: 'ADMIN', nombreCompleto: 'Ana Mamani' });

/** Una base local que ya bajó la sucursal del empleado de prueba, como pasa después del primer ingreso. */
function conSucursal(nombre = 'Centro') {
  const baseLocal = controlFalso();
  const fila: Fila = { id: EMPLEADO.usuario.sucursalId, nombre, direccion: null, telefono: null, activa: 1 };
  baseLocal.base.consultar.mockImplementation(async () => [fila] as never[]);
  return baseLocal;
}

function abrir(ruta = '/', sesion: ReturnType<typeof sesionDePrueba> | null = EMPLEADO) {
  renderEnRuta(<App />, ruta, { sesion, baseLocal: conSucursal() });
}

const menu = () => screen.getByRole('navigation', { name: 'Menú principal' });
const nombres = (contenedor: HTMLElement) => within(contenedor).getAllByRole('link').map((enlace) => enlace.textContent);

describe('Marco: la cabecera — SPEC-KRILINXI-023', () => {
  it('dice el negocio, la sucursal de quien atiende, quién es, y tiene Salir', async () => {
    abrir();
    const cabecera = screen.getByRole('banner');
    expect(within(cabecera).getByRole('link', { name: 'Lavandería' })).toHaveAttribute('href', '/');
    expect(await within(cabecera).findByText('Sucursal Centro')).toBeInTheDocument();
    expect(cabecera).toHaveTextContent('Atiende: Rosa Quispe');
    expect(within(cabecera).getByRole('button', { name: 'Salir' })).toBeInTheDocument();
  });

  it('el ADMIN no tiene sucursal: dice "Administración"', () => {
    abrir('/', ADMIN);
    expect(within(screen.getByRole('banner')).getByText('Administración')).toBeInTheDocument();
  });

  it('mientras la sucursal no está en la tablet, no inventa un nombre', () => {
    renderEnRuta(<App />, '/', { sesion: EMPLEADO });
    expect(within(screen.getByRole('banner')).queryByText(/Sucursal/)).not.toBeInTheDocument();
  });

  it('Salir sigue pidiendo confirmación', () => {
    abrir();
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Salir' }));
    expect(screen.getByRole('dialog', { name: '¿Salir del sistema?' })).toBeInTheDocument();
  });

  it('hay una sola cabecera: la de la sesión no es otra', () => {
    abrir();
    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });
});

describe('Marco: el menú — SPEC-KRILINXI-023', () => {
  it('un EMPLEADO ve el Inicio y el mostrador, cada uno con su ícono', () => {
    abrir();
    expect(nombres(menu())).toEqual(['Inicio', 'Registrar ropa', 'Ropa en el local', 'Entregar ropa', 'Cobrar', 'Clientes']);
    for (const enlace of within(menu()).getAllByRole('link')) {
      expect(enlace.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('un ADMIN ve el Inicio y lo suyo, sin Registrar ropa', () => {
    abrir('/', ADMIN);
    expect(nombres(menu())).toEqual(['Inicio', 'Clientes', 'Personal', 'Sucursales', '¿Quién hizo qué?', 'Estadísticas']);
  });

  it('marca la pantalla actual, y solo esa, como página actual', () => {
    abrir('/cobrar');
    const actual = within(menu()).getByRole('link', { name: 'Cobrar' });
    expect(actual).toHaveAttribute('aria-current', 'page');
    // No solo color: negrita y la barra de la izquierda cuelgan del mismo atributo.
    expect(actual).toHaveClass('aria-[current=page]:font-bold', 'aria-[current=page]:border-marca');
    expect(within(menu()).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
    expect(within(menu()).getByRole('link', { name: 'Ropa en el local' })).not.toHaveAttribute('aria-current');
  });

  it('elegir un destino lleva a esa pantalla', async () => {
    abrir();
    fireEvent.click(within(menu()).getByRole('link', { name: 'Clientes' }));
    expect(await screen.findByRole('heading', { name: 'Clientes', level: 1 })).toBeInTheDocument();
  });

  // jsdom no aplica el CSS: lo que se puede probar es que cada pieza lleve la clase que la
  // esconde en el tamaño que no le toca. Que se vea bien en una tablet es la prueba a mano.
  it('en pantalla ancha es una barra lateral; en chica, un botón "Menú"', () => {
    abrir();
    expect(menu().closest('aside')).toHaveClass('hidden', 'lg:block');
    const boton = screen.getByRole('button', { name: 'Menú' });
    expect(boton.parentElement).toHaveClass('lg:hidden');
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Marco: el cajón del menú — SPEC-KRILINXI-023', () => {
  function abrirCajon() {
    abrir();
    const boton = screen.getByRole('button', { name: 'Menú' });
    fireEvent.click(boton);
    return { boton, cajon: screen.getByRole('dialog', { name: 'Menú' }) };
  }

  it('se abre como un diálogo modal, y el botón dice que está abierto y cuál controla', () => {
    const { boton, cajon } = abrirCajon();
    expect(cajon).toHaveAttribute('aria-modal', 'true');
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(boton).toHaveAttribute('aria-controls', cajon.id);
  });

  it('el foco entra al primer destino', () => {
    const { cajon } = abrirCajon();
    expect(within(cajon).getByRole('link', { name: 'Inicio' })).toHaveFocus();
  });

  it('Tab no se escapa: del último vuelve al primero, y Shift+Tab al revés', () => {
    const { cajon } = abrirCajon();
    const enfocables = [...cajon.querySelectorAll<HTMLElement>('a[href], button')];
    const primero = enfocables[0];
    const ultimo = enfocables.at(-1);
    if (!primero || !ultimo) throw new Error('el cajón tiene que tener qué enfocar');

    ultimo.focus();
    fireEvent.keyDown(ultimo, { key: 'Tab' });
    expect(primero).toHaveFocus();

    fireEvent.keyDown(primero, { key: 'Tab', shiftKey: true });
    expect(ultimo).toHaveFocus();
  });

  it('Escape lo cierra y el foco vuelve al botón "Menú"', () => {
    const { boton } = abrirCajon();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Menú' })).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  it('"Cerrar menú" lo cierra y el foco vuelve al botón "Menú"', () => {
    const { boton, cajon } = abrirCajon();
    fireEvent.click(within(cajon).getByRole('button', { name: 'Cerrar menú' }));
    expect(screen.queryByRole('dialog', { name: 'Menú' })).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it('elegir un destino navega y lo cierra', async () => {
    const { cajon } = abrirCajon();
    fireEvent.click(within(cajon).getByRole('link', { name: 'Entregar ropa' }));
    expect(await screen.findByRole('heading', { name: 'Entregar ropa', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Menú' })).not.toBeInTheDocument();
  });
});

describe('Marco: aviso de conexión, contenido y pie — SPEC-KRILINXI-023', () => {
  it('el aviso de conexión está debajo de la cabecera, con su texto de siempre', async () => {
    abrir('/clientes');
    const aviso = await screen.findByText('Con internet — todo está guardado.');
    // DOCUMENT_POSITION_FOLLOWING: el aviso viene después de la cabecera en la página.
    expect(screen.getByRole('banner').compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('el pie dice la sucursal y la versión de frontend/package.json', async () => {
    const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')) as { version: string };
    abrir();
    const pie = screen.getByRole('contentinfo');
    await waitFor(() => expect(pie).toHaveTextContent(`Sucursal Centro · Versión ${version}`));
  });

  it.each(['/', '/clientes', '/estadisticas', '/no-existe'])('%s tiene un solo <main>, y el título de la pantalla es su h1', (ruta) => {
    abrir(ruta, ADMIN);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('lo primero que se enfoca es "Saltar al contenido", y lleva al contenido', () => {
    abrir();
    const primero = document.querySelector<HTMLElement>('a[href], button, input, select, textarea');
    expect(primero).toHaveTextContent('Saltar al contenido');
    expect(primero).toHaveClass('sr-only', 'focus:not-sr-only');
    if (!primero) throw new Error('falta el enlace');
    fireEvent.click(primero);
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it.each([
    ['/', 'Lavandería'],
    ['/registrar-ropa', 'Registrar ropa · Lavandería'],
    ['/clientes', 'Clientes · Lavandería'],
  ])('en %s la pestaña se llama "%s"', async (ruta, titulo) => {
    abrir(ruta);
    await waitFor(() => expect(document.title).toBe(titulo));
  });
});

describe('Marco sin sesión — SPEC-KRILINXI-023', () => {
  it.each(['/ingresar', '/no-existe'])('%s muestra solo el nombre del negocio: sin menú, sin Salir, sin aviso', (ruta) => {
    abrir(ruta, null);
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Lavandería' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menú principal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menú' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument();
    expect(screen.queryByText(/internet/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});

describe('Marco: claro u oscuro — SPEC-KRILINXI-030', () => {
  const html = () => document.documentElement;
  const cabecera = () => within(screen.getByRole('banner'));

  it('la cabecera tiene el botón en palabras, y cambia el tema al momento', async () => {
    abrir();
    fireEvent.click(cabecera().getByRole('button', { name: 'Tema oscuro' }));
    expect(html().dataset.tema).toBe('oscuro');
    // `Boton` descarta un segundo toque mientras termina el primero (contra el doble cobro): se
    // espera a que vuelva a estar disponible, como haría una persona.
    const volver = cabecera().getByRole('button', { name: 'Tema claro' });
    await waitFor(() => expect(volver).toBeEnabled());
    fireEvent.click(volver);
    expect(html().dataset.tema).toBe('claro');
  });

  it('la elección se recuerda al volver a abrir la app', () => {
    abrir();
    fireEvent.click(cabecera().getByRole('button', { name: 'Tema oscuro' }));
    cleanup();
    abrir();
    expect(cabecera().getByRole('button', { name: 'Tema claro' })).toBeInTheDocument();
  });

  it('sin elección, sigue a la tablet en vivo: si pasa a oscuro, la app también', () => {
    const sistema = sistemaDePrueba({ oscuro: false });
    abrir();
    act(() => sistema.cambiar({ oscuro: true }));
    expect(html().dataset.tema).toBe('oscuro');
    expect(cabecera().getByRole('button', { name: 'Tema claro' })).toBeInTheDocument();
  });

  it('está también en el ingreso, sin nadie adentro', () => {
    abrir('/ingresar', null);
    expect(cabecera().getByRole('button', { name: 'Tema oscuro' })).toBeInTheDocument();
  });

  it('salir no borra la elección: es de la tablet, no de la persona', async () => {
    abrir();
    fireEvent.click(cabecera().getByRole('button', { name: 'Tema oscuro' }));
    fireEvent.click(cabecera().getByRole('button', { name: 'Salir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, salir' }));
    await screen.findByRole('button', { name: 'Entrar' });
    expect(cabecera().getByRole('button', { name: 'Tema claro' })).toBeInTheDocument();
  });
});
