import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { subirCola } from '../../../lib/powersync/conector';
import { cuerpoError, simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { sinJerga } from '../../../test/jerga';
import { ordenDePrueba, SUCURSAL_DE_PRUEBA } from '../../../test/filasDePrueba';
import { subirRechazando } from '../../../test/rechazos';
import { renderEnRuta } from '../../../test/render';
import { MENSAJES } from '../../ordenes/api/ordenesLocal';

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

/** Una orden con la boleta 001234 que el servidor rechazó, y la App abierta en /para-corregir. */
async function abrirConUnaBoletaRechazada() {
  const { control, db, sembrar } = await baseLocalDePrueba();
  const base = { control, db, sembrar };
  return {
    ...base,
    async abrir(antes?: () => Promise<void>) {
      await antes?.();
      await control.base.ejecutar(
        'INSERT INTO ordenes (id, numero_boleta, sucursal_id, descripcion, precio_total, estado) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), '001234', SUCURSAL_DE_PRUEBA, '2 pantalones', '50.00', 'RECIBIDO'],
      );
      await subirRechazando(db, 409, 'BOLETA_DUPLICADA', BOLETA_REPETIDA);
      renderEnRuta(<App />, '/para-corregir', { baseLocal: control });
      await screen.findByText('Ropa con la boleta 001234');
    },
  };
}

describe('Corregir lo que no se pudo guardar — SPEC-KRILINXI-013', () => {
  it('cada registro tiene Corregir y Descartar, con el motivo en palabras del mostrador', async () => {
    const { abrir } = await abrirConUnaBoletaRechazada();
    await abrir();

    const tarjeta = screen.getByText('Ropa con la boleta 001234').closest('li');
    if (!tarjeta) throw new Error('No está la tarjeta del registro.');
    expect(within(tarjeta).getByText(BOLETA_REPETIDA)).toBeInTheDocument();
    expect(within(tarjeta).getByRole('button', { name: 'Corregir' })).toBeInTheDocument();
    expect(within(tarjeta).getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
    sinJerga();
  });

  it('corregir abre los datos enviados; guardado sin internet, sale de la lista y del aviso', async () => {
    const { abrir } = await abrirConUnaBoletaRechazada();
    await abrir();
    expect(screen.getByRole('link', { name: /1 registro no se pudo guardar/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Corregir' }));
    const boleta = screen.getByLabelText('Número de la boleta');
    expect(boleta).toHaveValue('001234');
    expect(screen.getByLabelText('Qué ropa deja')).toHaveValue('2 pantalones');
    expect(screen.getByLabelText('Precio (Bs)')).toHaveValue('50,00');
    sinJerga();

    fireEvent.change(boleta, { target: { value: '001235' } });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a guardar' }));

    expect(await screen.findByText(/Listo: la corrección quedó guardada en esta tablet/)).toBeInTheDocument();
    expect(await screen.findByText('No hay nada para corregir. Todo se guardó bien.')).toBeInTheDocument();
    // La base de prueba nunca se conecta: es la tablet sin internet, con la corrección en la cola.
    expect(
      await screen.findByText('Trabajando sin internet — 1 registro se guardará cuando vuelva la conexión.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /no se pudo guardar/ })).not.toBeInTheDocument();
    sinJerga();
  });

  it('una boleta corregida que ya usa otra ropa de la sucursal se avisa en el campo, con el mensaje de registrar ropa', async () => {
    const { abrir, sembrar } = await abrirConUnaBoletaRechazada();
    await abrir(() => sembrar('ordenes', [ordenDePrueba({ numero_boleta: '009999' })]));

    fireEvent.click(screen.getByRole('button', { name: 'Corregir' }));
    fireEvent.change(screen.getByLabelText('Número de la boleta'), { target: { value: '009999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a guardar' }));

    expect(await screen.findByText(MENSAJES.boletaOcupada)).toBeInTheDocument();
    expect(screen.getByLabelText('Número de la boleta')).toHaveAttribute('aria-invalid', 'true');
    sinJerga();
  });

  it('descartar pide confirmación diciendo qué se pierde; cancelar no borra nada', async () => {
    const { abrir } = await abrirConUnaBoletaRechazada();
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.getByText('¿Descartar «Ropa con la boleta 001234»?')).toBeInTheDocument();
    expect(screen.getByText(/No se va a guardar nunca/)).toBeInTheDocument();
    sinJerga();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByText('Ropa con la boleta 001234')).toBeInTheDocument();
  });

  it('confirmado el descarte, lo saca de la lista sin dejar nada para subir', async () => {
    const { abrir, db } = await abrirConUnaBoletaRechazada();
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));

    expect(await screen.findByText('No hay nada para corregir. Todo se guardó bien.')).toBeInTheDocument();
    expect(screen.getByText('Se descartó: Ropa con la boleta 001234.')).toBeInTheDocument();
    await waitFor(async () => expect(await db.getCrudBatch()).toBeNull());
    sinJerga();
  });

  it('un cambio de estado rechazado explica dónde rehacerlo en vez de abrir un formulario', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const orden = ordenDePrueba();
    await sembrar('ordenes', [orden]);
    await control.base.ejecutar("UPDATE ordenes SET estado = 'LISTO' WHERE id = ?", [orden.id]);
    await subirRechazando(db, 409, 'TRANSICION_INVALIDA', 'Esta ropa ya fue anulada: no se puede cambiar.');
    renderEnRuta(<App />, '/para-corregir', { baseLocal: control });

    fireEvent.click(await screen.findByRole('button', { name: 'Corregir' }));

    expect(screen.getByText(/Un cambio de estado no se corrige aquí/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Ropa en el local' })).toHaveAttribute('href', '/ropa');
    expect(screen.queryByRole('button', { name: 'Volver a guardar' })).not.toBeInTheDocument();
    sinJerga();
  });
});
