import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { elegirEnBuscador } from '../../../test/buscador';
import { clienteDePrueba, ordenDePrueba, pagoDePrueba } from '../../../test/filasDePrueba';
import { sinJerga } from '../../../test/jerga';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';

/**
 * La entrega de punta a punta en el Mostrador, con la base local de verdad y sin internet —
 * SPEC-KRILINXI-009, reescrita contra /mostrador en SPEC-KRILINXI-033 (antes vivía en /entregar).
 * Rosa dejó ropa por Bs 50 y adelantó Bs 20: falta pagar Bs 30.
 */
const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });
const LISTA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001234', estado: 'LISTO' });
const ANULADA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001235', estado: 'ANULADO' });

async function abrir() {
  const servidor = simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  await prueba.sembrar('ordenes', [LISTA, ANULADA]);
  await prueba.sembrar('pagos', [pagoDePrueba({ orden_id: LISTA.id, monto: '20.00' })]);
  renderEnRuta(<App />, '/mostrador', { baseLocal: prueba.control });
  await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });
  return { ...prueba, servidor };
}

/** Busca la boleta en el Mostrador y la abre en la ficha de su cliente. */
async function buscarBoleta(boleta: string) {
  await elegirEnBuscador(boleta, new RegExp(`Boleta ${boleta}`));
  return screen.findByRole('region', { name: `Boleta ${boleta}` });
}

/** Busca la boleta, abre su detalle y el formulario de entrega. */
async function abrirEntrega(boleta = '001234') {
  const detalle = await buscarBoleta(boleta);
  fireEvent.click(within(detalle).getByRole('button', { name: 'Entregar la ropa' }));
  return within(detalle).getByRole('form', { name: 'Entregar la ropa' });
}

function escribir(formulario: HTMLElement, etiqueta: string, valor: string) {
  fireEvent.change(within(formulario).getByLabelText(etiqueta), { target: { value: valor } });
}

/** Toca "Entregar" y espera a que aparezca la confirmación. */
async function pedirConfirmacion(formulario: HTMLElement) {
  fireEvent.click(within(formulario).getByRole('button', { name: 'Entregar' }));
  return screen.findByRole('dialog', { name: '¿Entregar la ropa de la boleta 001234?' });
}

async function resumen() {
  await screen.findByText(/^Ropa entregada: boleta/);
  const terminos = screen.getAllByRole('term').map((t) => t.textContent);
  const valores = screen.getAllByRole('definition').map((d) => d.textContent);
  return Object.fromEntries(terminos.map((t, i) => [t, valores[i]]));
}

describe('Entregar en el Mostrador: el recorrido — SPEC-KRILINXI-009 y SPEC-KRILINXI-033', () => {
  it('con boleta y pagando lo que falta: confirma, guarda entrega y pago, y muestra el resumen', async () => {
    const { db, servidor } = await abrir();
    const formulario = await abrirEntrega();
    expect(within(formulario).getByLabelText('Precio final (Bs)')).toHaveValue('50.00');
    expect(within(formulario).getByText('Falta pagar Bs 30,00.')).toBeInTheDocument();

    fireEvent.click(within(formulario).getByLabelText('Trae la boleta'));
    escribir(formulario, 'Cuánto paga ahora (Bs, si paga)', '30');
    fireEvent.click(within(formulario).getByLabelText('Efectivo'));
    const dialogo = await pedirConfirmacion(formulario);
    // Paga todo: la confirmación no habla de deuda.
    expect(dialogo).toHaveTextContent('Esta acción no se puede deshacer.');
    expect(dialogo).not.toHaveTextContent('debiendo');
    sinJerga();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));

    expect(await resumen()).toEqual({
      Boleta: '001234',
      Retiró: 'Trajo la boleta',
      'Precio final': 'Bs 50,00',
      'Cobrado ahora': 'Bs 30,00',
      'Queda debiendo': 'Nada',
    });
    expect((await db.getCrudBatch(100))?.crud.map((c) => [c.op, c.table])).toEqual([
      ['PUT', 'entregas'],
      ['PUT', 'pagos'],
    ]);
    expect(servidor.pedidos).toEqual([]);
    sinJerga();
  });

  it('con saldo pendiente, la confirmación dice cuánto queda debiendo', async () => {
    await abrir();
    const formulario = await abrirEntrega();
    fireEvent.click(within(formulario).getByLabelText('Trae la boleta'));
    escribir(formulario, 'Cuánto paga ahora (Bs, si paga)', '15');
    fireEvent.click(within(formulario).getByLabelText('Pago con QR'));

    const dialogo = await pedirConfirmacion(formulario);
    expect(dialogo).toHaveTextContent('Esta acción no se puede deshacer. El cliente queda debiendo Bs 15,00.');
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));
    expect(await resumen()).toMatchObject({ 'Queda debiendo': 'Bs 15,00' });
  });

  it('el saldo se recalcula al cambiar el precio final (recargo)', async () => {
    await abrir();
    const formulario = await abrirEntrega();
    escribir(formulario, 'Precio final (Bs)', '60');
    expect(within(formulario).getByText('Falta pagar Bs 40,00.')).toBeInTheDocument();
  });

  it('sin boleta pide nombre y carnet, y los muestra en el resumen', async () => {
    await abrir();
    const formulario = await abrirEntrega();
    fireEvent.click(within(formulario).getByLabelText('No trae la boleta'));
    fireEvent.click(within(formulario).getByRole('button', { name: 'Entregar' }));

    expect(await within(formulario).findByText('Si no trae la boleta, escribí el nombre de quien retira la ropa.')).toBeInTheDocument();
    expect(within(formulario).getByText('Si no trae la boleta, escribí el carnet de quien retira la ropa.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    escribir(formulario, 'Nombre de quien retira', 'Juan Mamani');
    escribir(formulario, 'Carnet de quien retira', '445566');
    await pedirConfirmacion(formulario);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));
    expect(await resumen()).toMatchObject({ Retiró: 'Juan Mamani (carnet 445566)' });
  });

  it('cancelar la confirmación no guarda nada', async () => {
    const { db } = await abrir();
    const formulario = await abrirEntrega();
    fireEvent.click(within(formulario).getByLabelText('Trae la boleta'));
    await pedirConfirmacion(formulario);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await db.getCrudBatch()).toBeNull();
  });
});

describe('Entregar en el Mostrador: después de entregar — SPEC-KRILINXI-009 y SPEC-KRILINXI-033', () => {
  it('vuelve a la ficha del cliente, donde figura Entregado; ya no está en el local ni ofrece entregarla otra vez', async () => {
    await abrir();
    const formulario = await abrirEntrega();
    fireEvent.click(within(formulario).getByLabelText('Trae la boleta'));
    await pedirConfirmacion(formulario);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Entregar otra ropa' }));

    // La ficha de Rosa, actualizada sola: la boleta figura entregada, sin buscarla de nuevo.
    const ficha = await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });
    // Se espera lo que se afirma (SPEC-KRILINXI-018): la ficha se relee de la base, que es asíncrona.
    await waitFor(() =>
      expect(within(ficha).getByRole('button', { name: 'Boleta 001234, Rosa Quispe' })).toHaveTextContent('Entregado'),
    );

    // Ya no está en la ropa del local…
    fireEvent.click(screen.getByRole('button', { name: 'Ver toda la ropa en el local' }));
    await screen.findByRole('heading', { name: 'Ropa en el local' });
    expect(screen.queryByRole('button', { name: 'Boleta 001234, Rosa Quispe' })).not.toBeInTheDocument();

    // …y buscándola, figura Entregado y sin acciones.
    const detalle = await buscarBoleta('001234');
    expect(within(detalle).getByText('Esta ropa ya fue entregada.')).toBeInTheDocument();
    expect(within(detalle).queryByRole('button', { name: 'Entregar la ropa' })).not.toBeInTheDocument();
  });

  it('una ropa anulada dice por qué no se puede entregar', async () => {
    await abrir();
    const detalle = await buscarBoleta('001235');
    expect(within(detalle).getByText('Esta ropa fue anulada: no se puede entregar ni cobrar.')).toBeInTheDocument();
    expect(within(detalle).queryByRole('button', { name: 'Entregar la ropa' })).not.toBeInTheDocument();
  });
});

describe('Entregar en el Mostrador: la dirección vieja — SPEC-KRILINXI-009 y SPEC-KRILINXI-033', () => {
  it('/entregar lleva al Mostrador; un ADMIN que no está atendiendo ve cómo empezar (SPEC-KRILINXI-029)', async () => {
    renderEnRuta(<App />, '/entregar', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    expect(await screen.findByRole('heading', { name: 'Mostrador', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/elegí en qué sucursal vas a atender/)).toBeInTheDocument();
  });
});

describe('Entregar en el Mostrador con el tema — SPEC-KRILINXI-025 y SPEC-KRILINXI-033', () => {
  it('el formulario elegido se distingue por algo más que el color, y el resumen es un aviso de éxito', async () => {
    await abrir();
    const formulario = await abrirEntrega();
    const opcion = within(formulario).getByLabelText('Trae la boleta');
    fireEvent.click(opcion);
    expect(opcion.closest('label')).toHaveClass('font-semibold', 'border-marca');
    await pedirConfirmacion(formulario);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));

    const hecho = await screen.findByText(/^Ropa entregada: boleta/);
    expect(hecho.closest('[role="status"]')).toHaveClass('bg-exito-fondo');
  });
});
