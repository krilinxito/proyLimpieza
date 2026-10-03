import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { clienteDePrueba, entregaDePrueba, ordenDePrueba, pagoDePrueba } from '../../../test/filasDePrueba';
import { sinJerga } from '../../../test/jerga';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';

/**
 * El recorrido del mostrador sobre la App entera, en /ropa, con la base local de verdad y
 * el servidor "sin internet": lo que se prueba va de la pantalla al SQL.
 */
const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });
const RECIBIDA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000001', descripcion: '2 pantalones' });
const ENTREGADA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000004', estado: 'LISTO' });

async function abrir(ruta = '/ropa') {
  const servidor = simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  await prueba.sembrar('ordenes', [RECIBIDA, ENTREGADA]);
  await prueba.sembrar('pagos', [pagoDePrueba({ orden_id: RECIBIDA.id, monto: '20.00' })]);
  await prueba.sembrar('entregas', [entregaDePrueba({ orden_id: ENTREGADA.id })]);
  renderEnRuta(<App />, ruta, { baseLocal: prueba.control });
  await screen.findByRole('button', { name: 'Boleta 000001, Rosa Quispe' });
  return { ...prueba, servidor };
}

async function abrirDetalle(boleta = '000001') {
  fireEvent.click(screen.getByRole('button', { name: `Boleta ${boleta}, Rosa Quispe` }));
  return screen.findByRole('region', { name: `Boleta ${boleta}` });
}

function datoDelDetalle(detalle: HTMLElement, dato: string) {
  const termino = within(detalle).getByText(dato, { selector: 'dt' });
  return termino.nextElementSibling?.textContent;
}

describe('Ropa en el local: la lista — SPEC-KRILINXI-008', () => {
  it('muestra la abierta con su estado y lo que falta pagar, y no la entregada sin sincronizar', async () => {
    const { servidor } = await abrir();
    const tarjeta = screen.getByRole('button', { name: 'Boleta 000001, Rosa Quispe' });
    expect(tarjeta).toHaveTextContent('Recibido');
    expect(tarjeta).toHaveTextContent('Falta pagar Bs 30,00');
    expect(screen.queryByRole('button', { name: /Boleta 000004/ })).not.toBeInTheDocument();
    expect(servidor.pedidos).toEqual([]);
    sinJerga();
  });

  it('busca por teléfono y encuentra también la entregada, que figura Entregado', async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText('Número de boleta o teléfono del cliente'), { target: { value: '7012 3456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    const entregada = await screen.findByRole('button', { name: 'Boleta 000004, Rosa Quispe' });
    expect(entregada).toHaveTextContent('Entregado');
    sinJerga();
  });
});

describe('Ropa en el local: el detalle — SPEC-KRILINXI-008', () => {
  it('muestra los datos, los pagos y el saldo', async () => {
    await abrir();
    const detalle = await abrirDetalle();
    expect(datoDelDetalle(detalle, 'Precio')).toBe('Bs 50,00');
    expect(datoDelDetalle(detalle, 'Pagó')).toBe('Bs 20,00');
    expect(datoDelDetalle(detalle, 'Falta pagar')).toBe('Bs 30,00');
    expect(within(detalle).getByRole('list', { name: 'Pagos' })).toHaveTextContent('Adelanto — Efectivo — Bs 20,00');
    sinJerga();
  });

  it('avanza paso a paso, y cada paso ofrece solo lo que sigue', async () => {
    const { db } = await abrir();
    const detalle = await abrirDetalle();
    fireEvent.click(within(detalle).getByRole('button', { name: 'Empezar a lavar' }));

    await waitFor(() => expect(datoDelDetalle(detalle, 'Cómo va')).toBe('En proceso'));
    expect(within(detalle).queryByRole('button', { name: 'Empezar a lavar' })).not.toBeInTheDocument();
    expect(within(detalle).getByRole('button', { name: 'Marcar como lista' })).toBeInTheDocument();
    expect((await db.getCrudBatch())?.crud.map((c) => c.opData)).toEqual([{ estado: 'EN_PROCESO' }]);
  });

  it('anular pide confirmación; cancelar no cambia nada y confirmar la cierra', async () => {
    const { db } = await abrir();
    const detalle = await abrirDetalle();

    fireEvent.click(within(detalle).getByRole('button', { name: 'Anular' }));
    expect(screen.getByRole('dialog', { name: '¿Anular la boleta 000001?' })).toHaveTextContent(
      'Esta acción no se puede deshacer.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await db.getCrudBatch()).toBeNull();

    // Boton queda ocupado hasta que termina su acción: hay que esperar a que se libere,
    // como esperaría una persona, antes de tocarlo otra vez.
    const anular = within(detalle).getByRole('button', { name: 'Anular' });
    await waitFor(() => expect(anular).toBeEnabled());
    fireEvent.click(anular);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, anular' }));

    await waitFor(() => expect(datoDelDetalle(detalle, 'Cómo va')).toBe('Anulado'));
    // Cerrada: ya no ofrece nada.
    for (const nombre of ['Anular', 'Cobrar', 'Marcar como lista', 'Empezar a lavar']) {
      expect(within(detalle).queryByRole('button', { name: nombre })).not.toBeInTheDocument();
    }
  });

  it('cobra a cuenta y el saldo baja', async () => {
    await abrir();
    const detalle = await abrirDetalle();
    fireEvent.click(within(detalle).getByRole('button', { name: 'Cobrar' }));
    const formulario = within(detalle).getByRole('form', { name: 'Cobrar' });
    fireEvent.change(within(formulario).getByLabelText('Cuánto paga (Bs)'), { target: { value: '10' } });
    fireEvent.click(within(formulario).getByLabelText('Pago con QR'));
    fireEvent.click(within(formulario).getByRole('button', { name: 'Guardar cobro' }));

    await waitFor(() => expect(datoDelDetalle(detalle, 'Falta pagar')).toBe('Bs 20,00'));
    expect(within(detalle).getByRole('list', { name: 'Pagos' })).toHaveTextContent('Adelanto — Pago con QR — Bs 10,00');
    sinJerga();
  });

  it('no deja cobrar más de lo que falta, y lo dice', async () => {
    const { db } = await abrir();
    const detalle = await abrirDetalle();
    fireEvent.click(within(detalle).getByRole('button', { name: 'Cobrar' }));
    fireEvent.change(within(detalle).getByLabelText('Cuánto paga (Bs)'), { target: { value: '31' } });
    fireEvent.click(within(detalle).getByLabelText('Efectivo'));
    fireEvent.click(within(detalle).getByRole('button', { name: 'Guardar cobro' }));

    expect(await within(detalle).findByText('El cobro no puede ser mayor que lo que falta pagar.')).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('una ropa entregada no ofrece avanzar, anular ni cobrar', async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText('Número de boleta o teléfono del cliente'), { target: { value: '000004' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 000004, Rosa Quispe' }));
    const detalle = await screen.findByRole('region', { name: 'Boleta 000004' });

    expect(datoDelDetalle(detalle, 'Cómo va')).toBe('Entregado');
    for (const nombre of ['Anular', 'Cobrar', 'Marcar como lista']) {
      expect(within(detalle).queryByRole('button', { name: nombre })).not.toBeInTheDocument();
    }
  });
});

describe('Ropa en el local: rutas — SPEC-KRILINXI-008', () => {
  it('/cobrar muestra la misma pantalla con su título', async () => {
    await abrir('/cobrar');
    expect(screen.getByRole('heading', { name: 'Cobrar', level: 1 })).toBeInTheDocument();
  });

  it.each(['/ropa', '/cobrar'])('un ADMIN que abre %s ve el aviso de solo empleados', (ruta) => {
    renderEnRuta(<App />, ruta, { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    expect(screen.getByText(/para quien atiende en una sucursal/)).toBeInTheDocument();
  });
});
