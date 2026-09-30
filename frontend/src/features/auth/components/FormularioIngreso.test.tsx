import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { App } from '../../../App';
import { leerSesion } from '../api/almacen';
import { cuerpoError, simularApi, type RespuestaFalsa } from '../../../test/apiFalsa';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';

/**
 * Se prueba montando la App entera y no el formulario suelto: lo que importa es el
 * recorrido de una persona (llega, escribe, entra y ve la pantalla que había pedido), y eso
 * cruza el formulario, el provider, el cliente de la API y el portero de las rutas.
 */
function abrirSinSesion(ruta = '/ingresar') {
  renderEnRuta(<App />, ruta, { sesion: null });
}

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

function entrarComo(username: string, password: string) {
  escribir('Usuario', username);
  escribir('Contraseña', password);
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

/** El servidor responde siempre lo mismo al login. */
function servidorQueResponde(respuesta: RespuestaFalsa) {
  return simularApi((pedido) => (pedido.ruta === '/auth/login' ? respuesta : { status: 404 }));
}

const RESPUESTA_OK = { status: 200, data: sesionDePrueba({ nombreCompleto: 'Rosa Quispe' }) };

describe('Ingresar al sistema — SPEC-KRILINXI-003', () => {
  it('muestra los campos de usuario y contraseña y el botón Entrar', () => {
    abrirSinSesion();
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('manda usuario y contraseña a POST /auth/login y guarda la sesión que vuelve', async () => {
    const servidor = servidorQueResponde(RESPUESTA_OK);
    abrirSinSesion();
    entrarComo('  rosa ', 'secreta');

    expect(await screen.findByRole('heading', { name: 'Lavandería' })).toBeInTheDocument();
    expect(servidor.pedidos).toEqual([
      // El usuario va sin los espacios de los costados; la contraseña, tal cual.
      { metodo: 'POST', ruta: '/auth/login', cuerpo: { username: 'rosa', password: 'secreta' }, autorizacion: null },
    ]);
    expect(leerSesion()).toEqual(RESPUESTA_OK.data);
  });

  it('después de entrar lleva a la pantalla que se había pedido', async () => {
    servidorQueResponde(RESPUESTA_OK);
    abrirSinSesion('/cobrar');
    entrarComo('rosa', 'secreta');
    expect(await screen.findByRole('heading', { name: 'Cobrar' })).toBeInTheDocument();
  });

  it.each([
    [401, 'NO_AUTENTICADO', 'El usuario o la contraseña no coinciden. Volvé a intentarlo.'],
    [400, 'VALIDACION', 'Escribí tu usuario y tu contraseña para entrar.'],
  ])('ante un %i muestra el mensaje de la API, sin códigos', async (status, codigo, mensaje) => {
    servidorQueResponde({ status, data: cuerpoError(codigo, mensaje) });
    abrirSinSesion();
    entrarComo('rosa', 'mal');

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(mensaje);
    expect(alerta).not.toHaveTextContent(codigo);
    expect(alerta).not.toHaveTextContent(String(status));
    expect(leerSesion()).toBeNull();
  });

  it('sin respuesta del servidor avisa que hace falta internet y no guarda nada', async () => {
    servidorQueResponde('sin-conexion');
    abrirSinSesion();
    entrarComo('rosa', 'secreta');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hay conexión con el servidor. Para entrar hace falta internet.',
    );
    expect(leerSesion()).toBeNull();
    // Y se puede volver a intentar.
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('con los campos vacíos avisa en cada uno y no llama a la API', () => {
    const servidor = servidorQueResponde(RESPUESTA_OK);
    abrirSinSesion();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByLabelText('Usuario')).toHaveAccessibleDescription('Escribí tu usuario.');
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Escribí tu contraseña.');
    expect(servidor.pedidos).toEqual([]);
  });

  it('un usuario hecho solo de espacios cuenta como vacío', () => {
    const servidor = servidorQueResponde(RESPUESTA_OK);
    abrirSinSesion();
    entrarComo('   ', 'secreta');

    expect(screen.getByLabelText('Usuario')).toHaveAccessibleDescription('Escribí tu usuario.');
    expect(screen.getByLabelText('Contraseña')).not.toHaveAccessibleDescription();
    expect(servidor.pedidos).toEqual([]);
  });

  it('una respuesta con forma inesperada no guarda nada y lo dice', async () => {
    servidorQueResponde({ status: 200, data: { token: 'solo-uno' } });
    abrirSinSesion();
    entrarComo('rosa', 'secreta');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(leerSesion()).toBeNull();
  });

  it('quien ya está adentro y abre /ingresar va directo al inicio', () => {
    renderEnRuta(<App />, '/ingresar');
    expect(screen.getByRole('heading', { name: 'Lavandería' })).toBeInTheDocument();
  });
});
