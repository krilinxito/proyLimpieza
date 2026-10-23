import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { elegirEnBuscador } from '../../../test/buscador';
import { clienteDePrueba, ordenDePrueba, pagoDePrueba } from '../../../test/filasDePrueba';
import { accionesPrincipales } from '../../../test/jerarquia';
import { sinJerga } from '../../../test/jerga';
import { subirRechazandoPorRuta } from '../../../test/rechazos';
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

/** Paga en efectivo lo que falta de la boleta de siempre (Bs 30): desde SPEC-KRILINXI-056 no se entrega con deuda. */
function pagarLoQueFalta(formulario: HTMLElement) {
  escribir(formulario, 'Cuánto paga ahora (Bs, si paga)', '30');
  fireEvent.click(within(formulario).getByLabelText('Efectivo'));
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
    pagarLoQueFalta(formulario);
    expect(within(formulario).getByText('Con este cobro queda todo pagado.')).toBeInTheDocument();
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
    });
    // SPEC-KRILINXI-056: el pago va antes que la entrega, que es el orden en que la cola los sube.
    expect((await db.getCrudBatch(100))?.crud.map((c) => [c.op, c.table])).toEqual([
      ['PUT', 'pagos'],
      ['PUT', 'entregas'],
    ]);
    expect(servidor.pedidos).toEqual([]);
    sinJerga();
  });

  it('con saldo pendiente no se puede entregar: el botón está apagado y dice cuánto falta — SPEC-KRILINXI-056', async () => {
    const { db } = await abrir();
    const formulario = await abrirEntrega();
    fireEvent.click(within(formulario).getByLabelText('Trae la boleta'));
    const entregar = within(formulario).getByRole('button', { name: 'Entregar' });

    // Sin escribir nada: falta todo lo que debe.
    expect(entregar).toBeDisabled();
    expect(within(formulario).getByText('Falta pagar Bs 30,00.')).toBeInTheDocument();

    // Pagando solo una parte, sigue apagado y dice cuánto falta todavía.
    escribir(formulario, 'Cuánto paga ahora (Bs, si paga)', '15');
    fireEvent.click(within(formulario).getByLabelText('Pago con QR'));
    expect(within(formulario).getByText('Con este cobro todavía falta pagar Bs 15,00.')).toBeInTheDocument();
    expect(entregar).toBeDisabled();
    fireEvent.click(entregar);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();

    // Pagando todo, se habilita.
    escribir(formulario, 'Cuánto paga ahora (Bs, si paga)', '30');
    expect(within(formulario).getByText('Con este cobro queda todo pagado.')).toBeInTheDocument();
    expect(entregar).toBeEnabled();
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
    pagarLoQueFalta(formulario);
    fireEvent.click(within(formulario).getByRole('button', { name: 'Entregar' }));

    expect(await within(formulario).findByText('Si no trae la boleta, escribe el nombre de quien retira la ropa.')).toBeInTheDocument();
    expect(within(formulario).getByText('Si no trae la boleta, escribe el carnet de quien retira la ropa.')).toBeInTheDocument();
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
    pagarLoQueFalta(formulario);
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
    pagarLoQueFalta(formulario);
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
    expect(screen.getByText(/elige en qué sucursal vas a atender/)).toBeInTheDocument();
  });
});

describe('Entregar en el Mostrador con el tema — SPEC-KRILINXI-025 y SPEC-KRILINXI-033', () => {
  it('el formulario elegido se distingue por algo más que el color, y el resumen es un aviso de éxito', async () => {
    await abrir();
    const formulario = await abrirEntrega();
    const opcion = within(formulario).getByLabelText('Trae la boleta');
    fireEvent.click(opcion);
    expect(opcion.closest('label')).toHaveClass('font-semibold', 'border-marca');
    pagarLoQueFalta(formulario);
    await pedirConfirmacion(formulario);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));

    const hecho = await screen.findByText(/^Ropa entregada: boleta/);
    expect(hecho.closest('[role="status"]')).toHaveClass('bg-exito-fondo');
  });
});

/**
 * Una boleta ya pagada no pide ningún monto al entregar — SPEC-KRILINXI-046. Tres boletas de Rosa:
 * la de siempre (Bs 50, adelantó 20: falta pagar 30), una pagada en partes (20 de adelanto y 30 después) y una
 * de precio cero. Las dos últimas no tienen nada que cobrar.
 */
const PAGADA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001240', estado: 'LISTO' });
const SIN_PRECIO = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001241', estado: 'LISTO', precio_total: '0.00' });

async function abrirConPagadas() {
  const servidor = simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  await prueba.sembrar('ordenes', [LISTA, PAGADA, SIN_PRECIO]);
  await prueba.sembrar('pagos', [
    pagoDePrueba({ orden_id: LISTA.id, monto: '20.00' }),
    pagoDePrueba({ orden_id: PAGADA.id, monto: '20.00' }),
    pagoDePrueba({ orden_id: PAGADA.id, monto: '30.00', tipo: 'PAGO_FINAL' }),
  ]);
  renderEnRuta(<App />, '/mostrador', { baseLocal: prueba.control });
  await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });
  return { ...prueba, servidor };
}

/** Toca "Entregar" y espera la confirmación de esa boleta. */
async function confirmacionDe(formulario: HTMLElement, boleta: string) {
  fireEvent.click(within(formulario).getByRole('button', { name: 'Entregar' }));
  return screen.findByRole('dialog', { name: `¿Entregar la ropa de la boleta ${boleta}?` });
}

const CAMPOS_DE_DINERO = ['Precio final (Bs)', 'Cuánto paga ahora (Bs, si paga)'];

describe('Entregar una boleta ya pagada: sin pedir montos — SPEC-KRILINXI-046', () => {
  it('no muestra ningún campo de dinero: dice que ya está todo pagado, en palabras', async () => {
    await abrirConPagadas();
    const formulario = await abrirEntrega('001240');

    for (const campo of CAMPOS_DE_DINERO) expect(within(formulario).queryByLabelText(campo)).not.toBeInTheDocument();
    // Ni la pregunta de cómo paga, ni sus opciones.
    expect(within(formulario).queryByText('¿Cómo paga?')).not.toBeInTheDocument();
    expect(within(formulario).queryByLabelText('Efectivo')).not.toBeInTheDocument();
    // En su lugar, un aviso de éxito; y la línea de "cuánto falta" ya no tiene qué decir.
    expect(within(formulario).getByRole('status')).toHaveTextContent('Ya está todo pagado');
    expect(within(formulario).queryByText(/Falta pagar|No falta pagar/)).not.toBeInTheDocument();
    sinJerga();
  });

  it('se entrega con solo elegir si trae la boleta: sin monto, sin deuda en la confirmación y sin pago nuevo', async () => {
    const { db, control, servidor } = await abrirConPagadas();
    const formulario = await abrirEntrega('001240');

    fireEvent.click(within(formulario).getByLabelText('Trae la boleta'));
    const dialogo = await confirmacionDe(formulario, '001240');
    expect(dialogo).toHaveTextContent('Esta acción no se puede deshacer.');
    expect(dialogo).not.toHaveTextContent('debiendo');
    sinJerga();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));

    expect(await resumen()).toMatchObject({ Boleta: '001240', Retiró: 'Trajo la boleta', 'Precio final': 'Bs 50,00' });
    // Desde SPEC-KRILINXI-056 nunca queda deuda: el resumen ya no tiene la fila "Queda debiendo".
    expect(await resumen()).not.toHaveProperty('Queda debiendo');
    // La entrega lleva el precio de la boleta, y NO se encola ningún pago: solo la entrega.
    expect(await control.base.consultar('SELECT precio_final FROM entregas')).toEqual([{ precio_final: '50.00' }]);
    expect(await control.base.consultar("SELECT count(*) AS n FROM pagos WHERE orden_id = ?", [PAGADA.id])).toEqual([{ n: 2 }]);
    expect((await db.getCrudBatch(100))?.crud.map((c) => [c.op, c.table])).toEqual([['PUT', 'entregas']]);
    expect(servidor.pedidos).toEqual([]);
  });

  it('sin boleta sigue pidiendo nombre y carnet de quien retira, y ningún monto', async () => {
    await abrirConPagadas();
    const formulario = await abrirEntrega('001240');

    fireEvent.click(within(formulario).getByLabelText('No trae la boleta'));
    escribir(formulario, 'Nombre de quien retira', 'Juan Mamani');
    escribir(formulario, 'Carnet de quien retira', '445566');
    for (const campo of CAMPOS_DE_DINERO) expect(within(formulario).queryByLabelText(campo)).not.toBeInTheDocument();

    await confirmacionDe(formulario, '001240');
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));
    expect(await resumen()).toMatchObject({ Retiró: 'Juan Mamani (carnet 445566)' });
  });

  it('una boleta pagada en partes cuenta como pagada, y una de precio cero también', async () => {
    await abrirConPagadas();

    // 001240: 20 de adelanto + 30 después = 50. 001241: no cuesta nada.
    for (const boleta of ['001240', '001241']) {
      const formulario = await abrirEntrega(boleta);
      expect(within(formulario).getByRole('status')).toHaveTextContent('Ya está todo pagado');
      expect(within(formulario).queryByLabelText('Precio final (Bs)')).not.toBeInTheDocument();
      fireEvent.click(within(formulario).getByRole('button', { name: 'Cancelar' }));
      // Dentro de una boleta no hay buscador (SPEC-KRILINXI-057): para buscar otra se vuelve a la ficha.
      fireEvent.click(screen.getByRole('button', { name: 'Ver toda la ropa de Rosa Quispe' }));
    }
  });

  it('si falta pagar algo, el formulario es el de siempre: precio final, lo que falta y cuánto paga ahora', async () => {
    await abrirConPagadas();
    const formulario = await abrirEntrega('001234');

    expect(within(formulario).getByLabelText('Precio final (Bs)')).toHaveValue('50.00');
    expect(within(formulario).getByText('Falta pagar Bs 30,00.')).toBeInTheDocument();
    expect(within(formulario).getByLabelText('Cuánto paga ahora (Bs, si paga)')).toBeInTheDocument();
    expect(within(formulario).queryByText('Ya está todo pagado')).not.toBeInTheDocument();
    // Al escribir un pago, aparece cómo paga.
    escribir(formulario, 'Cuánto paga ahora (Bs, si paga)', '30');
    expect(within(formulario).getByText('¿Cómo paga?')).toBeInTheDocument();
    // Y ya no ofrece transferencia (SPEC-KRILINXI-055): solo efectivo, QR y tarjeta.
    expect(within(formulario).queryByLabelText('Transferencia')).not.toBeInTheDocument();
  });

  it('sigue habiendo una sola acción principal a la vista: Entregar', async () => {
    await abrirConPagadas();
    await abrirEntrega('001240');

    expect(accionesPrincipales()).toEqual(['Entregar']);
  });
});

describe('Una entrega rechazada por falta de cobro llega a Para corregir — SPEC-KRILINXI-056', () => {
  it('sube el pago antes que la entrega; si el servidor dice que falta cobrar, el empleado se entera y puede corregirlo', async () => {
    const { control, db } = await abrir();
    const formulario = await abrirEntrega();
    fireEvent.click(within(formulario).getByLabelText('Trae la boleta'));
    pagarLoQueFalta(formulario);
    await pedirConfirmacion(formulario);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));
    await resumen();

    const MENSAJE = 'La boleta 001234 todavía tiene Bs 30.00 sin cobrar. Cobra todo antes de entregar la ropa.';
    const pedidos = await subirRechazandoPorRuta(db, { '/entregas': [409, 'SALDO_PENDIENTE', MENSAJE] });

    // El orden en que sube es el que hace que el servidor cuente el pago al recibir la entrega.
    expect(pedidos.map((p) => p.ruta)).toEqual(['/pagos', '/entregas']);

    cleanup();
    renderEnRuta(<App />, '/para-corregir', { baseLocal: control });
    expect(await screen.findByText(MENSAJE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Corregir/ })).toBeInTheDocument();
    sinJerga();
  });
});
