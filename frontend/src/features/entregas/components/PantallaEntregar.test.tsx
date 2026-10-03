import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { clienteDePrueba, ordenDePrueba, pagoDePrueba } from '../../../test/filasDePrueba';
import { sinJerga } from '../../../test/jerga';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';

/**
 * La entrega de punta a punta, en /entregar, con la base local de verdad y sin internet.
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
  renderEnRuta(<App />, '/entregar', { baseLocal: prueba.control });
  await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });
  return { ...prueba, servidor };
}

/** Busca la boleta, abre su detalle y el formulario de entrega. */
async function abrirEntrega(boleta = '001234') {
  fireEvent.change(screen.getByLabelText('Número de boleta o teléfono del cliente'), { target: { value: boleta } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(await screen.findByRole('button', { name: `Boleta ${boleta}, Rosa Quispe` }));
  const detalle = await screen.findByRole('region', { name: `Boleta ${boleta}` });
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

describe('Entregar: el recorrido — SPEC-KRILINXI-009', () => {
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

describe('Entregar: después de entregar — SPEC-KRILINXI-009', () => {
  it('la ropa figura Entregado en la lista y el detalle, y no ofrece entregarla otra vez', async () => {
    await abrir();
    const formulario = await abrirEntrega();
    fireEvent.click(within(formulario).getByLabelText('Trae la boleta'));
    await pedirConfirmacion(formulario);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Entregar otra ropa' }));

    // Ya no está en la ropa del local…
    await screen.findByText('Ropa en el local');
    expect(screen.queryByRole('button', { name: 'Boleta 001234, Rosa Quispe' })).not.toBeInTheDocument();

    // …y buscándola, figura Entregado y sin acciones.
    fireEvent.change(screen.getByLabelText('Número de boleta o teléfono del cliente'), { target: { value: '001234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' }));
    const detalle = await screen.findByRole('region', { name: 'Boleta 001234' });
    expect(within(detalle).getByText('Esta ropa ya fue entregada.')).toBeInTheDocument();
    expect(within(detalle).queryByRole('button', { name: 'Entregar la ropa' })).not.toBeInTheDocument();
  });

  it('una ropa anulada dice por qué no se puede entregar', async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText('Número de boleta o teléfono del cliente'), { target: { value: '001235' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 001235, Rosa Quispe' }));
    const detalle = await screen.findByRole('region', { name: 'Boleta 001235' });
    expect(within(detalle).getByText('Esta ropa fue anulada: no se puede entregar ni cobrar.')).toBeInTheDocument();
    expect(within(detalle).queryByRole('button', { name: 'Entregar la ropa' })).not.toBeInTheDocument();
  });
});

describe('Entregar: solo en el mostrador — SPEC-KRILINXI-009', () => {
  it('un ADMIN que abre /entregar ve el aviso de solo empleados', () => {
    renderEnRuta(<App />, '/entregar', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    expect(screen.getByText(/para quien atiende en una sucursal/)).toBeInTheDocument();
  });
});
