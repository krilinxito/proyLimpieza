import { describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { App } from '../App';
import type { EstadoSubida, Fila } from '../lib/powersync/control';
import { controlFalso } from '../test/controlFalso';
import { renderEnRuta } from '../test/render';
import { sesionDePrueba } from '../test/sesion';
import { sistemaDePrueba } from '../test/sistemaDePrueba';

const EMPLEADO = sesionDePrueba({ rol: 'EMPLEADO', nombreCompleto: 'Rosa Quispe' });
const ADMIN = sesionDePrueba({ rol: 'ADMIN', nombreCompleto: 'Ana Mamani' });

/** Una base local que ya bajó la sucursal del empleado de prueba, como pasa después del primer ingreso. */
function conSucursal(nombre = 'Centro', estado?: EstadoSubida) {
  const baseLocal = controlFalso({ estado });
  const fila: Fila = { id: EMPLEADO.usuario.sucursalId, nombre, direccion: null, telefono: null, activa: 1 };
  baseLocal.base.consultar.mockImplementation(async () => [fila] as never[]);
  return baseLocal;
}

function abrir(ruta = '/', sesion: ReturnType<typeof sesionDePrueba> | null = EMPLEADO, estado?: EstadoSubida) {
  renderEnRuta(<App />, ruta, { sesion, baseLocal: conSucursal('Centro', estado) });
}

const menu = () => screen.getByRole('navigation', { name: 'Menú principal' });
const nombres = (contenedor: HTMLElement) => within(contenedor).getAllByRole('link').map((enlace) => enlace.textContent);

describe('Marco: la cabecera — SPEC-KRILINXI-023', () => {
  it('dice el negocio, la sucursal de quien atiende, quién es, y tiene Salir', async () => {
    abrir();
    const cabecera = screen.getByRole('banner');
    expect(within(cabecera).getByRole('link', { name: 'Lavandería' })).toHaveAttribute('href', '/');
    expect(await within(cabecera).findByText('Sucursal Centro')).toBeInTheDocument();
    // Desde SPEC-KRILINXI-030, un círculo con la inicial: el nombre completo va en su nombre accesible.
    expect(within(cabecera).getByRole('img', { name: 'Perfil de Rosa Quispe' })).toHaveTextContent('R');
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
    // El Mostrador junta Ropa en el local, Entregar ropa y Cobrar desde SPEC-KRILINXI-033.
    // Registrar ropa es un botón del Mostrador desde SPEC-KRILINXI-034.
    expect(nombres(menu())).toEqual(['Inicio', 'Mostrador', 'Clientes', 'Historial de boletas']);
    for (const enlace of within(menu()).getAllByRole('link')) {
      expect(enlace.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('un ADMIN ve el Inicio y lo suyo, sin Registrar ropa', () => {
    abrir('/', ADMIN);
    expect(nombres(menu())).toEqual([
      'Inicio',
      'Clientes',
      'Historial de boletas',
      'Personal',
      'Sucursales',
      '¿Quién hizo qué?',
      'Estadísticas',
    ]);
  });

  it('marca la pantalla actual, y solo esa, como página actual', () => {
    // /cobrar lleva al Mostrador desde SPEC-KRILINXI-033: lo que queda marcado es el Mostrador.
    abrir('/cobrar');
    const actual = within(menu()).getByRole('link', { name: 'Mostrador' });
    expect(actual).toHaveAttribute('aria-current', 'page');
    // No solo color: negrita y la barra de la izquierda cuelgan del mismo atributo.
    expect(actual).toHaveClass('aria-[current=page]:font-bold', 'aria-[current=page]:border-marca');
    expect(within(menu()).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
    expect(within(menu()).getByRole('link', { name: 'Clientes' })).not.toHaveAttribute('aria-current');
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
    fireEvent.click(within(cajon).getByRole('link', { name: 'Mostrador' }));
    expect(await screen.findByRole('heading', { name: 'Mostrador', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Menú' })).not.toBeInTheDocument();
  });
});

describe('Marco: aviso de conexión, contenido y pie — SPEC-KRILINXI-023', () => {
  it('si hay algo para corregir, el aviso grande está debajo de la cabecera, con su texto de siempre', async () => {
    abrir('/clientes', EMPLEADO, { conectado: true, pendientes: 0, paraCorregir: 1 });
    const aviso = await within(screen.getByRole('main')).findByText('Con internet — todo está guardado.');
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
    ['/mostrador', 'Mostrador · Lavandería'],
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

  it('es discreto: un ícono redondo, con su nombre al pasar el mouse y para el lector de pantalla', () => {
    abrir();
    const boton = cabecera().getByRole('button', { name: 'Tema oscuro' });
    expect(boton).toHaveAttribute('title', 'Tema oscuro');
    expect(boton).toHaveClass('rounded-full', 'size-12');
    expect(boton).toHaveTextContent('');
    expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('quien atiende es un círculo con su inicial que dice "Perfil" al pasar el mouse, y todavía no hace nada', () => {
    abrir();
    const perfil = cabecera().getByRole('img', { name: 'Perfil de Rosa Quispe' });
    expect(perfil).toHaveTextContent('R');
    expect(perfil).toHaveAttribute('title', 'Perfil');
    expect(perfil).toHaveClass('rounded-full');
    // Un `span`, no un botón: hasta que exista el perfil, no se ofrece algo que no hace nada.
    expect(cabecera().queryByRole('button', { name: /Perfil/ })).not.toBeInTheDocument();
    expect(screen.getByRole('banner')).not.toHaveTextContent('Atiende');
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

describe('Marco: la conexión en una esquina — SPEC-KRILINXI-031', () => {
  const SIN_INTERNET: EstadoSubida = { conectado: false, pendientes: 3, paraCorregir: 0 };
  const cabecera = () => within(screen.getByRole('banner'));

  it('con internet y todo guardado, una píldora chica dice "Con internet" y no hay franja de aviso', async () => {
    abrir('/clientes');
    expect(await cabecera().findByRole('button', { name: 'Con internet' })).toBeInTheDocument();
    // Ni el aviso grande ni su frase arriba del contenido.
    expect(within(screen.getByRole('main')).queryByText(/Con internet/)).not.toBeInTheDocument();
  });

  it('sin internet dice cuántos registros faltan guardar, y cambia de color además del texto', async () => {
    abrir('/clientes', EMPLEADO, SIN_INTERNET);
    const boton = await cabecera().findByRole('button', { name: 'Sin internet · 3 por guardar' });
    expect(boton).toHaveClass('bg-advertencia-fondo', 'text-advertencia-texto');
    expect(within(screen.getByRole('main')).queryByText(/Trabajando sin internet/)).not.toBeInTheDocument();
  });

  it('al tocarla muestra la frase completa, y se cierra con Escape devolviendo el foco', async () => {
    abrir('/clientes', EMPLEADO, SIN_INTERNET);
    const boton = await cabecera().findByRole('button', { name: /Sin internet/ });
    expect(boton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    const detalle = cabecera().getByText('Trabajando sin internet — 3 registros se guardarán cuando vuelva la conexión.');
    expect(boton).toHaveAttribute('aria-controls', detalle.id);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cabecera().queryByText(/Trabajando sin internet/)).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it('tocar fuera la cierra', async () => {
    abrir('/clientes', EMPLEADO, SIN_INTERNET);
    fireEvent.click(await cabecera().findByRole('button', { name: /Sin internet/ }));
    fireEvent.pointerDown(screen.getByRole('main'));
    expect(cabecera().queryByText(/Trabajando sin internet/)).not.toBeInTheDocument();
  });

  it('con registros para corregir, aparece además el aviso grande con el enlace, como antes', async () => {
    abrir('/clientes', EMPLEADO, { ...SIN_INTERNET, paraCorregir: 2 });
    expect(await cabecera().findByRole('button', { name: /Sin internet/ })).toBeInTheDocument();
    const enlace = within(screen.getByRole('main')).getByRole('link', { name: /2 registros no se pudieron guardar/ });
    expect(enlace).toHaveAttribute('href', '/para-corregir');
  });

  it('es un status, que el lector de pantalla anuncia al cambiar, y nunca un ícono sin texto', async () => {
    abrir('/clientes', EMPLEADO, SIN_INTERNET);
    const boton = await cabecera().findByRole('button', { name: /Sin internet/ });
    expect(boton.closest('[role="status"]')).not.toBeNull();
    expect(boton).toHaveTextContent('Sin internet · 3 por guardar');
    expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('en pantalla chica no empuja Salir afuera: el texto es corto, no se parte, y la cabecera pasa a otra línea', async () => {
    abrir('/clientes', EMPLEADO, SIN_INTERNET);
    const boton = await cabecera().findByRole('button', { name: /Sin internet/ });
    expect(boton.textContent?.length).toBeLessThanOrEqual(30);
    expect(boton).toHaveClass('whitespace-nowrap');
    // jsdom no mide: que pase a otra línea en vez de desbordar lo garantiza el `flex-wrap`.
    expect(screen.getByRole('banner').firstElementChild).toHaveClass('flex-wrap');
  });

  it('sin nadie adentro no hay píldora: no hay base local que mirar', () => {
    abrir('/ingresar', null);
    expect(cabecera().queryByRole('button', { name: /internet/ })).not.toBeInTheDocument();
  });
});
