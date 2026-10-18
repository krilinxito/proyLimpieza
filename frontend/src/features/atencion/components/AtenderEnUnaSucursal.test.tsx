import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { clienteDePrueba, ordenDePrueba } from '../../../test/filasDePrueba';
import { elegirEnBuscador } from '../../../test/buscador';
import { sinJerga } from '../../../test/jerga';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';

/**
 * El ADMIN atiende el mostrador — SPEC-KRILINXI-029. La App entera con la base local de verdad
 * (SQLite) y sin internet, como en una tablet en el mostrador.
 *
 * `conectar` se espía y no hace nada: lo que interesa es CON QUÉ parámetros se conecta la tablet
 * (eso decide qué ropa baja, `atencion_admin` en las sync rules), no hablar con un PowerSync.
 */
const ADMIN = sesionDePrueba({ rol: 'ADMIN' });
const CENTRO = { id: randomUUID(), nombre: 'Centro', activa: 1 };
const NORTE = { id: randomUUID(), nombre: 'Norte', activa: 1 };
const CERRADA = { id: randomUUID(), nombre: 'Vieja', activa: 0 };
const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });

async function abrir({ sesion = ADMIN, ruta = '/' } = {}) {
  simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('sucursales', [CENTRO, NORTE, CERRADA]);
  await prueba.sembrar('clientes', [ROSA]);
  // La boleta 000999 ya está usada en Centro, y la 000777 en Norte.
  await prueba.sembrar('ordenes', [
    ordenDePrueba({ sucursal_id: CENTRO.id, numero_boleta: '000999', cliente_id: ROSA.id }),
    ordenDePrueba({ sucursal_id: NORTE.id, numero_boleta: '000777', cliente_id: ROSA.id }),
  ]);
  const conectar = vi.spyOn(prueba.control, 'conectar').mockResolvedValue();
  renderEnRuta(<App />, ruta, { sesion, baseLocal: prueba.control });
  return { ...prueba, conectar };
}

/** Los parámetros de la última vez que la tablet se conectó. */
function ultimaConexion(conectar: ReturnType<typeof vi.fn>) {
  return conectar.mock.calls.at(-1)?.[1];
}

const cabecera = () => within(screen.getByRole('banner'));
const tareas = () => within(screen.getByRole('navigation', { name: 'Tareas' }));

async function empezarEn(nombre: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Atender en una sucursal' }));
  fireEvent.click(await screen.findByLabelText(nombre));
  fireEvent.click(screen.getByRole('button', { name: 'Empezar a atender' }));
  await cabecera().findByText(`Atendiendo en ${nombre}`);
}

describe('Atender en una sucursal: elegir y empezar — SPEC-KRILINXI-029', () => {
  it('el Inicio del ADMIN ofrece las sucursales abiertas, no las cerradas', async () => {
    await abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Atender en una sucursal' }));
    const grupo = await screen.findByRole('group', { name: '¿En qué sucursal vas a atender?' });
    expect(within(grupo).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Centro',
      'Norte',
    ]);
    sinJerga();
  });

  it('sin elegir, "Empezar a atender" pide que elija y no empieza', async () => {
    const { conectar } = await abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Atender en una sucursal' }));
    await screen.findByLabelText('Centro');
    fireEvent.click(screen.getByRole('button', { name: 'Empezar a atender' }));
    expect(await screen.findByText('Elegí una sucursal de la lista.')).toBeInTheDocument();
    expect(ultimaConexion(conectar)).toBeUndefined();
  });

  it('al empezar, la tablet se reconecta con la sucursal elegida, y la cabecera dice dónde atiende', async () => {
    const { conectar } = await abrir();
    // Antes de elegir, se conecta sin parámetros: no baja ropa de ninguna sucursal.
    await waitFor(() => expect(conectar).toHaveBeenCalled());
    expect(ultimaConexion(conectar)).toBeUndefined();

    await empezarEn('Centro');

    expect(ultimaConexion(conectar)).toEqual({ sucursal_id: CENTRO.id });
    expect(cabecera().getByRole('button', { name: 'Dejar de atender' })).toBeInTheDocument();
    // Ya está atendiendo: la opción de elegir no vuelve a aparecer hasta que deje.
    expect(screen.queryByRole('button', { name: 'Atender en una sucursal' })).not.toBeInTheDocument();
  });

  it('mientras atiende ve las tareas del mostrador, y siguen las suyas de administrador', async () => {
    await abrir();
    expect(tareas().queryByRole('link', { name: 'Mostrador' })).not.toBeInTheDocument();

    await empezarEn('Centro');

    for (const nombre of ['Mostrador']) {
      expect(tareas().getByRole('link', { name: nombre })).toBeInTheDocument();
    }
    for (const nombre of ['Estadísticas', 'Personal', 'Sucursales', '¿Quién hizo qué?']) {
      expect(tareas().getByRole('link', { name: nombre })).toBeInTheDocument();
    }
  });

  it('la elección queda en la tablet: al volver a abrir la app sigue atendiendo, sin internet', async () => {
    const { control, conectar } = await abrir();
    await empezarEn('Norte');
    cleanup();

    // Volver a abrir la app: la misma tablet (la misma base y lo guardado), montada de cero.
    conectar.mockClear();
    renderEnRuta(<App />, '/', { sesion: ADMIN, baseLocal: control });

    expect(await cabecera().findByText('Atendiendo en Norte')).toBeInTheDocument();
    await waitFor(() => expect(conectar).toHaveBeenCalled());
    // Ni una sola conexión sin la sucursal: si no, bajaría "nada" un instante y la ropa parpadearía.
    expect(conectar.mock.calls.map((llamada) => llamada[1])).toEqual(
      conectar.mock.calls.map(() => ({ sucursal_id: NORTE.id })),
    );
  });
});

describe('Atender en una sucursal: el mostrador con la sucursal elegida — SPEC-KRILINXI-029', () => {
  function escribir(etiqueta: string, valor: string) {
    fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
  }

  async function registrarConBoleta(boleta: string) {
    // Desde SPEC-KRILINXI-034, Registrar ropa es un botón del Mostrador, con el cliente en el formulario.
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Mostrador' }));
    fireEvent.click(await within(screen.getByRole('main')).findByRole('button', { name: 'Registrar ropa' }));
    await elegirEnBuscador('70123456', /Rosa Quispe/);
    await screen.findByRole('form', { name: 'Datos de la ropa' });
    escribir('Número de la boleta', boleta);
    escribir('Qué ropa deja', '1 saco');
    escribir('Precio (Bs)', '30');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  }

  it('la orden se guarda en la sucursal elegida, a nombre del ADMIN', async () => {
    const { control } = await abrir();
    await empezarEn('Centro');

    // 000777 está usada en Norte, no en Centro: en Centro se puede.
    await registrarConBoleta('000777');

    expect(await screen.findByText('Ropa registrada con la boleta 000777.')).toBeInTheDocument();
    const filas = await control.base.consultar(
      "SELECT sucursal_id, usuario_recepcion_id FROM ordenes WHERE numero_boleta = '000777' AND sucursal_id = ?",
      [CENTRO.id],
    );
    expect(filas).toEqual([{ sucursal_id: CENTRO.id, usuario_recepcion_id: ADMIN.usuario.id }]);
  });

  it('la boleta se valida contra la sucursal elegida', async () => {
    await abrir();
    await empezarEn('Centro');

    await registrarConBoleta('000999');

    expect(
      await screen.findByText('Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo.'),
    ).toBeInTheDocument();
  });

  it('el Mostrador muestra la ropa de la sucursal elegida, no la de otra', async () => {
    await abrir();
    await empezarEn('Norte');
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Mostrador' }));

    expect(await within(screen.getByRole('main')).findByText(/000777/)).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByText(/000999/)).not.toBeInTheDocument();
  });

  it('sin atender, una pantalla del mostrador dice cómo empezar y lleva al Inicio', async () => {
    await abrir({ ruta: '/entregar' });
    const principal = within(screen.getByRole('main'));
    expect(await principal.findByText(/primero elegí en qué sucursal vas a atender/)).toBeInTheDocument();
    expect(principal.getByRole('link', { name: 'Elegir la sucursal' })).toHaveAttribute('href', '/');
    sinJerga();
  });
});

describe('Atender en una sucursal: dejar de atender y salir — SPEC-KRILINXI-029', () => {
  it('"Dejar de atender" reconecta sin la sucursal, sin borrar nada, y vuelve al Inicio', async () => {
    const { control, conectar, db } = await abrir();
    const borrar = vi.spyOn(control, 'desconectarYBorrar');
    await empezarEn('Centro');
    // Algo registrado mientras atendía, todavía sin subir (no hay internet).
    await control.base.ejecutar(
      "INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, descripcion, fecha_entrada, precio_total, estado) VALUES (uuid(), '000555', ?, ?, '1 saco', '2026-10-18T10:00:00.000Z', '30.00', 'RECIBIDO')",
      [ROSA.id, CENTRO.id],
    );
    fireEvent.click(tareas().getByRole('link', { name: 'Mostrador' }));

    fireEvent.click(cabecera().getByRole('button', { name: 'Dejar de atender' }));

    expect(await cabecera().findByText('Administración')).toBeInTheDocument();
    expect(ultimaConexion(conectar)).toBeUndefined();
    expect(borrar).not.toHaveBeenCalled();
    // Lo que no subió sigue en la cola: subirá cuando vuelva internet.
    expect((await db.getCrudBatch())?.crud).toHaveLength(1);
    // De vuelta en el Inicio, con la opción de elegir otra vez.
    expect(await screen.findByRole('button', { name: 'Atender en una sucursal' })).toBeInTheDocument();
  });

  it('salir también deja de atender: quien entre después no hereda la sucursal', async () => {
    await abrir();
    await empezarEn('Centro');

    fireEvent.click(cabecera().getByRole('button', { name: 'Salir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, salir' }));

    await screen.findByRole('button', { name: 'Entrar' });
    expect(localStorage.getItem('lavanderia.atencion')).toBeNull();
  });
});

describe('Atender en una sucursal: el EMPLEADO — SPEC-KRILINXI-029', () => {
  it('no ve la opción y se conecta sin parámetros: trabaja siempre en la suya', async () => {
    const { conectar } = await abrir({ sesion: sesionDePrueba() });
    await tareas().findByRole('link', { name: 'Mostrador' });
    await waitFor(() => expect(conectar).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Atender en una sucursal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dejar de atender' })).not.toBeInTheDocument();
    expect(conectar.mock.calls.every((llamada) => llamada[1] === undefined)).toBe(true);
  });
});
