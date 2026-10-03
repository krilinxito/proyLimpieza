import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { App } from '../../../App';
import { subirCola } from '../../../lib/powersync/conector';
import { cuerpoError, simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { sinJerga } from '../../../test/jerga';
import { renderEnRuta } from '../../../test/render';

const BOLETA_REPETIDA = 'Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo.';

/**
 * El recorrido que pide CLAUDE.md §6: el servidor rechaza una boleta y el empleado se entera.
 * Se escribe la orden en la base de verdad, se sube contra un servidor falso que dice 409, y
 * recién entonces se abre la App: el aviso tiene que decirlo y llevar a la lista.
 */
describe('Lo que no se pudo guardar llega a la pantalla — SPEC-KRILINXI-007', () => {
  it('el aviso cuenta el rechazo y la pantalla muestra qué era y por qué', async () => {
    simularApi(() => ({ status: 409, data: cuerpoError('BOLETA_DUPLICADA', BOLETA_REPETIDA) }));
    const { control, db } = await baseLocalDePrueba();
    await control.base.ejecutar('INSERT INTO ordenes (id, numero_boleta, precio_total) VALUES (?, ?, ?)', [
      randomUUID(),
      '001234',
      '50.00',
    ]);
    await subirCola(db);

    renderEnRuta(<App />, '/', { baseLocal: control });
    fireEvent.click(await screen.findByRole('link', { name: /1 registro no se pudo guardar/ }));

    expect(await screen.findByText('Ropa con la boleta 001234')).toBeInTheDocument();
    expect(screen.getByText(BOLETA_REPETIDA)).toBeInTheDocument();
    sinJerga();
  });

  it('sin nada para corregir, lo dice en vez de mostrar una lista vacía', async () => {
    const { control } = await baseLocalDePrueba();
    renderEnRuta(<App />, '/para-corregir', { baseLocal: control });
    expect(await screen.findByText('No hay nada para corregir. Todo se guardó bien.')).toBeInTheDocument();
  });

  it('el aviso está en todas las pantallas con sesión, también sin internet', async () => {
    const { control } = await baseLocalDePrueba();
    await control.base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), 'Rosa', '1')");
    renderEnRuta(<App />, '/clientes', { baseLocal: control });
    // La base de prueba nunca se conecta: es la tablet sin internet.
    expect(
      await screen.findByText('Trabajando sin internet — 1 registro se guardará cuando vuelva la conexión.'),
    ).toBeInTheDocument();
  });
});
