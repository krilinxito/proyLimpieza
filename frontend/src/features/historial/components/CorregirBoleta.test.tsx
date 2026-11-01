import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi, type PedidoFalso, type RespuestaFalsa } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { boletaDePrueba, paginaDeBoletas, renglonDePrueba, SUCURSAL_CENTRO, SUCURSAL_SUR } from '../../../test/historialDePrueba';
import { sinJerga } from '../../../test/jerga';
import { sinRed } from '../../../test/red';
import { tabletConRelojCorrido } from '../../../test/reloj';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';

/**
 * El admin corrige una boleta desde el historial completo — SPEC-KRILINXI-071, sobre la App entera. El historial viene
 * de la API falsa (como en `PantallaHistorial.test.tsx`), y la corrección es un PATCH a esa misma API: acá se comprueba
 * qué se manda y qué se le dice al admin. Qué hace el servidor con eso lo prueba el backend.
 */
const CAMISA = renglonDePrueba({
  id: '00000000-0000-4000-8000-000000000001',
  descripcion: 'Camisa',
  cantidad: '2.00',
  precioUnitario: '15.00',
  subtotal: '30.00',
});
const RECARGO = renglonDePrueba({
  id: '00000000-0000-4000-8000-000000000002',
  momento: 'ENTREGA',
  descripcion: 'Recargo por almacenamiento',
  cantidad: '1.00',
  precioUnitario: '5.00',
  subtotal: '5.00',
});
const BOLETA = boletaDePrueba({
  id: '00000000-0000-4000-8000-0000000000b1',
  numeroBoleta: '000500',
  descripcion: '2 Camisa',
  precioTotal: '30.00',
  pagado: '10.00',
  saldo: '20.00',
  renglones: [CAMISA],
});
const ENTREGADA = boletaDePrueba({
  id: '00000000-0000-4000-8000-0000000000b2',
  numeroBoleta: '000501',
  estado: 'ENTREGADO',
  descripcion: '2 Camisa',
  precioTotal: '30.00',
  precioFinal: '35.00',
  pagado: '35.00',
  saldo: '0.00',
  renglones: [CAMISA, RECARGO],
});

type Responder = (pedido: PedidoFalso) => RespuestaFalsa;
const historial: Responder = () => ({ status: 200, data: paginaDeBoletas([BOLETA, ENTREGADA]) });

/** /boletas abierta por un ADMIN que no atiende. Los PATCH los contesta `alCorregir`; el resto, el historial. */
async function abrirComoAdmin(alCorregir: Responder = () => ({ status: 200, data: {} })) {
  tabletConRelojCorrido(0);
  const servidor = simularApi((pedido) => (pedido.metodo === 'PATCH' ? alCorregir(pedido) : historial(pedido)));
  const { control, sembrar } = await baseLocalDePrueba();
  await sembrar('sucursales', [
    { id: SUCURSAL_CENTRO, nombre: 'Centro', activa: 1 },
    { id: SUCURSAL_SUR, nombre: 'Sur', activa: 1 },
  ]);
  renderEnRuta(<App />, '/boletas', { sesion: sesionDePrueba({ rol: 'ADMIN' }), baseLocal: control });
  return { servidor };
}

async function abrirLaCorreccion(boleta: string, cliente = 'Rosa Quispe') {
  fireEvent.click(await screen.findByRole('button', { name: `Boleta ${boleta}, ${cliente}` }));
  fireEvent.click(await screen.findByRole('button', { name: 'Corregir esta boleta' }));
  const formulario = await screen.findByRole('region', { name: `Corregir la boleta ${boleta}` });
  // Las sucursales salen de la base local, que se lee aparte: hay que esperarlas, no darlas por cargadas.
  await screen.findByRole('radio', { name: 'Sur' });
  return formulario;
}

const prenda = (n: number) => within(screen.getByRole('group', { name: `Prenda ${n}` }));
const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar la corrección' }));
const patches = (servidor: { pedidos: PedidoFalso[] }) => servidor.pedidos.filter((p) => p.metodo === 'PATCH');

describe('El admin corrige una boleta desde el historial — SPEC-KRILINXI-071', () => {
  it('el detalle de una boleta del historial completo ofrece "Corregir esta boleta"', async () => {
    await abrirComoAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 000500, Rosa Quispe' }));

    expect(await screen.findByRole('button', { name: 'Corregir esta boleta' })).toBeEnabled();
  });

  it('el formulario arranca con la boleta como está, y sin tocar nada no manda nada', async () => {
    const { servidor } = await abrirComoAdmin();
    await abrirLaCorreccion('000500');

    expect(screen.getByLabelText('Número de boleta')).toHaveValue('000500');
    expect(screen.getByRole('radio', { name: 'Centro' })).toBeChecked();
    expect(screen.getByLabelText('Día que entró')).toHaveValue('2026-10-15');
    expect(screen.getByLabelText('Hora')).toHaveValue('18:30');
    expect(prenda(1).getByLabelText('Qué es')).toHaveValue('Camisa');
    expect(prenda(1).getByLabelText('Cuántas')).toHaveValue('2');

    guardar();

    expect(await screen.findByText('No cambiaste nada: la boleta quedó como estaba.')).toBeInTheDocument();
    expect(patches(servidor)).toEqual([]);
    sinJerga();
  });

  it('cambiar la sucursal y una prenda manda solo eso, directo a la API, y vuelve al historial pedido de nuevo', async () => {
    const { servidor } = await abrirComoAdmin();
    await abrirLaCorreccion('000500');
    const pedidosAntes = servidor.pedidos.length;

    fireEvent.click(screen.getByRole('radio', { name: 'Sur' }));
    fireEvent.change(prenda(1).getByLabelText('Cuántas'), { target: { value: '3' } });
    guardar();

    expect(await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.')).toBeInTheDocument();
    expect(patches(servidor)).toEqual([
      expect.objectContaining({
        ruta: `/ordenes/${BOLETA.id}`,
        cuerpo: {
          sucursal_id: SUCURSAL_SUR,
          descripcion: '3 Camisa',
          renglones: [{ id: CAMISA.id, descripcion: 'Camisa', cantidad: '3.00', precio_unitario: '15.00' }],
        },
      }),
    ]);
    // De vuelta en la lista, que se volvió a pedir.
    await screen.findByRole('button', { name: 'Boleta 000500, Rosa Quispe' });
    expect(servidor.pedidos.slice(pedidosAntes).filter((p) => p.metodo === 'GET')).not.toHaveLength(0);
  });

  it('una prenda nueva se agrega con su propio id, y el total se ve sumado', async () => {
    const { servidor } = await abrirComoAdmin();
    await abrirLaCorreccion('000500');

    fireEvent.click(screen.getByRole('button', { name: 'Agregar otra prenda' }));
    fireEvent.change(prenda(2).getByLabelText('Qué es'), { target: { value: 'Saco' } });
    fireEvent.change(prenda(2).getByLabelText('Precio de cada una (Bs)'), { target: { value: '20' } });
    guardar();

    await waitFor(() => expect(patches(servidor)).toHaveLength(1));
    const { renglones } = patches(servidor)[0]?.cuerpo as { renglones: { id: string; descripcion: string }[] };
    expect(renglones.map((r) => r.descripcion)).toEqual(['Camisa', 'Saco']);
    expect(renglones[1]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(renglones[1]?.id).not.toBe(CAMISA.id);
  });

  it('cada rechazo del servidor se muestra tal cual, y el formulario sigue abierto con lo escrito', async () => {
    const mensaje = 'En la sucursal elegida ya hay una boleta con ese número. Revisa el papel o elige otra sucursal.';
    await abrirComoAdmin(() => ({ status: 409, data: { error: { codigo: 'BOLETA_DUPLICADA', mensaje } } }));
    await abrirLaCorreccion('000500');

    fireEvent.click(screen.getByRole('radio', { name: 'Sur' }));
    guardar();

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sur' })).toBeChecked();
    expect(screen.getByRole('region', { name: 'Corregir la boleta 000500' })).toBeInTheDocument();
  });

  it('lo que está mal se dice antes de mandar nada', async () => {
    const { servidor } = await abrirComoAdmin();
    await abrirLaCorreccion('000500');

    fireEvent.change(screen.getByLabelText('Número de boleta'), { target: { value: 'ABC' } });
    guardar();

    expect(await screen.findByText(/letras, números y guion, con al menos un número/)).toBeInTheDocument();
    expect(patches(servidor)).toEqual([]);
  });

  it('los cargos al entregar se muestran, pero no se pueden cambiar, y se dice dónde se corrigen', async () => {
    await abrirComoAdmin();
    await abrirLaCorreccion('000501');

    const cargos = screen.getByRole('region', { name: 'Cargos al entregar' });
    expect(within(cargos).getByText(/Recargo por almacenamiento/)).toBeInTheDocument();
    expect(within(cargos).queryByRole('textbox')).not.toBeInTheDocument();
    expect(cargos).toHaveTextContent('se corrigen junto con el cobro y la entrega');
    // Las prendas sí: una sola, sin el cargo.
    expect(screen.queryByRole('group', { name: 'Prenda 2' })).not.toBeInTheDocument();
  });

  it('volver sin guardar regresa al detalle de la boleta', async () => {
    await abrirComoAdmin();
    await abrirLaCorreccion('000500');

    fireEvent.click(screen.getByRole('button', { name: 'Volver sin guardar' }));

    expect(await screen.findByRole('region', { name: 'Boleta 000500' })).toBeInTheDocument();
  });

  it('sin internet, el botón está apagado y dice por qué', async () => {
    await abrirComoAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 000500, Rosa Quispe' }));
    await screen.findByRole('button', { name: 'Corregir esta boleta' });

    sinRed();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Corregir esta boleta' })).toBeDisabled());
    expect(screen.getByText(/Para hacer cambios hace falta internet/)).toBeInTheDocument();
  });
});
