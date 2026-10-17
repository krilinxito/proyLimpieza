import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { App } from '../../../App';
import { cuerpoError, simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { sinJerga } from '../../../test/jerga';
import { sinRed } from '../../../test/red';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';
import { MENSAJES_SUCURSAL } from '../api/sucursalesApi';

const CENTRO = '00000000-0000-4000-8000-0000000000c1';
const SUR = '00000000-0000-4000-8000-0000000000c3';

/** /sucursales abierta por un ADMIN, con Centro abierta y Sur cerrada en la base local. */
async function abrir(responder: Parameters<typeof simularApi>[0] = () => ({ status: 200, data: {} })) {
  const servidor = simularApi(responder);
  const { control, db, sembrar } = await baseLocalDePrueba();
  await sembrar('sucursales', [
    { id: CENTRO, nombre: 'Centro', direccion: 'Av. Busch 123', telefono: '2201', activa: 1 },
    { id: SUR, nombre: 'Sur', direccion: null, telefono: null, activa: 0 },
  ]);
  renderEnRuta(<App />, '/sucursales', { sesion: sesionDePrueba({ rol: 'ADMIN' }), baseLocal: control });
  await screen.findByText('Centro — Abierta');
  return { servidor, db };
}

const tarjeta = (titulo: string) => {
  const li = screen.getByText(titulo).closest('li');
  if (!li) throw new Error(`No está la tarjeta "${titulo}".`);
  return within(li);
};

describe('Pantalla de sucursales — SPEC-KRILINXI-017', () => {
  it('lista las sucursales de la base local, sin pedir nada a la API', async () => {
    const { servidor } = await abrir();
    expect(screen.getByText('Sur — Cerrada')).toBeInTheDocument();
    expect(tarjeta('Centro — Abierta').getByText('Av. Busch 123')).toBeInTheDocument();
    expect(servidor.pedidos).toEqual([]);
    sinJerga();
  });

  it('da de alta una sucursal por la API y avisa que la lista puede tardar en mostrarla', async () => {
    const { servidor, db } = await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar sucursal' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Norte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.')).toBeInTheDocument();
    expect(servidor.pedidos).toEqual([expect.objectContaining({ metodo: 'POST', ruta: '/sucursales' })]);
    // Nada pasó por la cola: fue directo al servidor.
    expect(await db.getCrudBatch()).toBeNull();
    sinJerga();
  });

  it('cambiar datos arranca con los actuales y manda solo lo que cambió', async () => {
    const { servidor } = await abrir();
    fireEvent.click(tarjeta('Centro — Abierta').getByRole('button', { name: 'Cambiar datos' }));
    expect(screen.getByLabelText('Dirección (si la tiene)')).toHaveValue('Av. Busch 123');
    fireEvent.change(screen.getByLabelText('Teléfono (si lo tiene)'), { target: { value: '2209' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.');
    expect(servidor.pedidos.map((p) => [p.metodo, p.ruta, p.cuerpo])).toEqual([['PATCH', `/sucursales/${CENTRO}`, { telefono: '2209' }]]);
  });

  it('un nombre repetido deja el formulario abierto con el mensaje del servidor', async () => {
    const repetido = 'Ya hay una sucursal que se llama "Sur". Elegí otro nombre, por ejemplo con la zona o la calle.';
    await abrir(() => ({ status: 409, data: cuerpoError('NOMBRE_SUCURSAL_DUPLICADO', repetido) }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar sucursal' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sur' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(repetido)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Sucursal nueva' })).toBeInTheDocument();
  });

  it('cerrar pide confirmación y, si todavía tiene ropa, explica qué hacer', async () => {
    const { servidor } = await abrir(() => ({
      status: 409,
      data: cuerpoError('SUCURSAL_CON_ROPA', 'Quedan 2 órdenes con ropa en esta sucursal.'),
    }));
    fireEvent.click(tarjeta('Centro — Abierta').getByRole('button', { name: 'Cerrar sucursal' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Cerrar la sucursal Centro?' });
    expect(dialogo).toHaveTextContent('No va a poder recibir ropa nueva ni personal nuevo.');
    sinJerga();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cerrar' }));

    expect(await screen.findByText(MENSAJES_SUCURSAL.conRopa)).toBeInTheDocument();
    expect(servidor.pedidos.map((p) => p.cuerpo)).toEqual([{ activa: false }]);
    sinJerga();
  });

  it('una cerrada se puede volver a abrir, con confirmación', async () => {
    const { servidor } = await abrir();
    fireEvent.click(tarjeta('Sur — Cerrada').getByRole('button', { name: 'Volver a abrir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, volver a abrir' }));

    await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.');
    expect(servidor.pedidos.map((p) => [p.ruta, p.cuerpo])).toEqual([[`/sucursales/${SUR}`, { activa: true }]]);
  });

  it('sin red, los botones de cambio se deshabilitan y lo dice', async () => {
    await abrir();
    sinRed();

    expect(screen.getByText(/Para hacer cambios hace falta internet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar sucursal' })).toBeDisabled();
    expect(tarjeta('Centro — Abierta').getByRole('button', { name: 'Cerrar sucursal' })).toBeDisabled();
    sinJerga();
  });
});
