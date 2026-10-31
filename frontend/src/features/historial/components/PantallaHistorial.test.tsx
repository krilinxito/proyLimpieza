import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi, type PedidoFalso, type RespuestaFalsa } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { clienteDePrueba, entregaDePrueba, ordenDePrueba, pagoDePrueba, SUCURSAL_DE_PRUEBA } from '../../../test/filasDePrueba';
import { boletaDePrueba, paginaDeBoletas, renglonDePrueba, SUCURSAL_CENTRO, SUCURSAL_SUR } from '../../../test/historialDePrueba';
import { accionesPrincipales } from '../../../test/jerarquia';
import { sinJerga } from '../../../test/jerga';
import { tabletConRelojCorrido } from '../../../test/reloj';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';
import { guardarAtencion } from '../../atencion/api/almacen';

/**
 * El Historial de boletas sobre la App entera — SPEC-KRILINXI-041. Quien atiende lo lee de la base
 * local de verdad (con el servidor "sin internet"); el admin que no atiende, de la API falsa.
 *
 * "Hoy" es el 16/10/2026 en Bolivia: los últimos 30 días van del 17/09 al 16/10.
 */
const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });
const JUAN = clienteDePrueba({ nombre: 'Juan Mamani', telefono: '71111111' });

const RECIENTE = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000010', estado: 'RECIBIDO', fecha_entrada: '2026-10-15T14:00:00.000Z' });
const PAGADA = ordenDePrueba({ cliente_id: JUAN.id, numero_boleta: '000011', estado: 'RECIBIDO', fecha_entrada: '2026-10-10T12:00:00.000Z' });
const ENTREGADA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000012', estado: 'RECIBIDO', precio_total: '60.00', fecha_entrada: '2026-10-12T12:00:00.000Z' });
const ANULADA = ordenDePrueba({ cliente_id: JUAN.id, numero_boleta: '000013', estado: 'ANULADO', fecha_entrada: '2026-10-05T12:00:00.000Z' });
const VIEJA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000014', estado: 'RECIBIDO', fecha_entrada: '2026-08-01T12:00:00.000Z' });

async function sembrarBoletas() {
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA, JUAN]);
  await prueba.sembrar('ordenes', [RECIENTE, PAGADA, ENTREGADA, ANULADA, VIEJA]);
  await prueba.sembrar('pagos', [pagoDePrueba({ orden_id: PAGADA.id, monto: '50.00' }), pagoDePrueba({ orden_id: ENTREGADA.id, monto: '60.00' })]);
  await prueba.sembrar('entregas', [entregaDePrueba({ orden_id: ENTREGADA.id, precio_final: '60.00' })]);
  return prueba;
}

/** /boletas abierta por un EMPLEADO: la base local, con el servidor sin internet. */
async function abrirComoEmpleado() {
  tabletConRelojCorrido(0);
  const servidor = simularApi(() => 'sin-conexion');
  const prueba = await sembrarBoletas();
  renderEnRuta(<App />, '/boletas', { baseLocal: prueba.control });
  await screen.findByRole('link', { name: 'Boleta 000010, Rosa Quispe' });
  return { servidor, ...prueba };
}

const lista = () => within(screen.getByRole('region', { name: 'Las boletas' }));
const numerosEnLista = () =>
  lista()
    .queryAllByRole('link')
    .map((enlace) => /Boleta (\d+)/.exec(enlace.getAttribute('aria-label') ?? '')?.[1]);
const buscador = () => screen.getByLabelText('Buscar por número de boleta, nombre o teléfono');
const masDetalle = () => fireEvent.click(screen.getByText('Buscar con más detalle'));

describe('Historial de boletas de quien atiende — SPEC-KRILINXI-041', () => {
  it('muestra los últimos 30 días de su sucursal, de la más nueva a la más vieja', async () => {
    await abrirComoEmpleado();

    expect(screen.getByRole('heading', { name: 'Historial de boletas', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Boletas de los últimos 30 días' })).toBeInTheDocument();
    // La de hace dos meses no está.
    expect(numerosEnLista()).toEqual(['000010', '000012', '000011', '000013']);
  });

  it('lo lee de la base local: no le pide nada a la API, y sin internet no avisa de ningún problema', async () => {
    const { servidor } = await abrirComoEmpleado();

    expect(servidor.pedidos).toEqual([]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    sinJerga();
  });

  it('cada boleta dice su número, su cliente, cuándo entró, cómo va y lo que falta pagar', async () => {
    await abrirComoEmpleado();

    const reciente = screen.getByRole('link', { name: 'Boleta 000010, Rosa Quispe' });
    expect(reciente).toHaveTextContent('Boleta 000010');
    expect(reciente).toHaveTextContent('Rosa Quispe');
    expect(reciente).toHaveTextContent('Entró el 15/10/2026');
    expect(within(reciente).getByText('Recibido')).toBeInTheDocument();
    expect(reciente).toHaveTextContent('Falta pagar Bs 50,00');

    const pagada = screen.getByRole('link', { name: 'Boleta 000011, Juan Mamani' });
    expect(pagada).toHaveTextContent('Pagado');
    // Entregada en la tablet aunque la columna diga RECIBIDO; y una anulada no se cobra.
    expect(within(screen.getByRole('link', { name: 'Boleta 000012, Rosa Quispe' })).getByText('Entregado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Boleta 000013, Juan Mamani' })).toHaveTextContent('Anulada: no se cobra');
  });

  it('no hay una acción principal: es una consulta, y cada boleta se toca entera', async () => {
    await abrirComoEmpleado();

    expect(accionesPrincipales()).toEqual([]);
  });

  it('tocar una boleta la abre en el Mostrador, en la ficha de su cliente', async () => {
    await abrirComoEmpleado();

    fireEvent.click(screen.getByRole('link', { name: 'Boleta 000010, Rosa Quispe' }));

    expect(await screen.findByRole('region', { name: 'Boleta 000010' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mostrador', level: 1 })).toBeInTheDocument();
  });

  describe('el buscador y los filtros', () => {
    it('busca mientras se escribe, por nombre del cliente', async () => {
      await abrirComoEmpleado();

      fireEvent.change(buscador(), { target: { value: 'mamani' } });

      await waitFor(() => expect(numerosEnLista()).toEqual(['000011', '000013']));
    });

    it('busca por número de boleta y por teléfono', async () => {
      await abrirComoEmpleado();

      fireEvent.change(buscador(), { target: { value: '0012' } });
      await waitFor(() => expect(numerosEnLista()).toEqual(['000012']));

      fireEvent.change(buscador(), { target: { value: '7111-11' } });
      await waitFor(() => expect(numerosEnLista()).toEqual(['000011', '000013']));
    });

    it('filtra por cómo va la ropa', async () => {
      await abrirComoEmpleado();
      masDetalle();

      fireEvent.click(screen.getByRole('radio', { name: 'Entregado' }));

      await waitFor(() => expect(numerosEnLista()).toEqual(['000012']));
    });

    it('"solo las que tienen saldo pendiente" deja las que se deben', async () => {
      await abrirComoEmpleado();

      fireEvent.click(screen.getByLabelText('Solo las que tienen saldo pendiente'));

      // La pagada, la entregada y saldada, y la anulada, afuera.
      await waitFor(() => expect(numerosEnLista()).toEqual(['000010']));
    });

    it('elegir fechas mira esas, también anteriores a los 30 días, y el título lo dice', async () => {
      await abrirComoEmpleado();
      masDetalle();

      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-07-01' } });
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-08-31' } });
      fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

      await waitFor(() => expect(numerosEnLista()).toEqual(['000014']));
      expect(screen.getByRole('heading', { name: 'Boletas del 01/07/2026 al 31/08/2026' })).toBeInTheDocument();
    });

    it('unas fechas al revés piden revisarlas y no cambian la lista', async () => {
      await abrirComoEmpleado();
      masDetalle();

      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-10' } });
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
      fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

      expect(await screen.findByText(/no puede ser posterior/)).toBeInTheDocument();
      expect(numerosEnLista()).toEqual(['000010', '000012', '000011', '000013']);
    });

    it('los filtros se combinan', async () => {
      await abrirComoEmpleado();
      masDetalle();

      fireEvent.change(buscador(), { target: { value: 'rosa' } });
      fireEvent.click(screen.getByRole('radio', { name: 'Recibido' }));

      await waitFor(() => expect(numerosEnLista()).toEqual(['000010']));
    });

    it('sin filtros no ofrece limpiar; con uno, lo limpia de un toque, también las fechas escritas', async () => {
      await abrirComoEmpleado();
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();

      masDetalle();
      fireEvent.change(buscador(), { target: { value: 'mamani' } });
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Limpiar filtros' }));

      await waitFor(() => expect(numerosEnLista()).toEqual(['000010', '000012', '000011', '000013']));
      expect(buscador()).toHaveValue('');
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    });

    it('sin resultados lo dice en palabras y ofrece limpiar los filtros', async () => {
      await abrirComoEmpleado();

      fireEvent.change(buscador(), { target: { value: 'zzzz' } });

      expect(await screen.findByText('No hay ninguna boleta con esos filtros.')).toBeInTheDocument();
      expect(numerosEnLista()).toEqual([]);
      sinJerga();

      // Hay dos: el de la barra de filtros y el de este aviso. Cualquiera sirve.
      fireEvent.click(within(screen.getByRole('region', { name: 'Las boletas' })).getByRole('button', { name: 'Limpiar filtros' }));
      await waitFor(() => expect(numerosEnLista()).toHaveLength(4));
    });

    it('una sucursal sin boletas en 30 días lo dice, sin hablar de filtros', async () => {
      tabletConRelojCorrido(0);
      simularApi(() => 'sin-conexion');
      const prueba = await baseLocalDePrueba();
      renderEnRuta(<App />, '/boletas', { baseLocal: prueba.control });

      expect(await screen.findByText('No hay boletas en los últimos 30 días.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    });

    it('el empleado no elige sucursal: la suya es la única', async () => {
      await abrirComoEmpleado();
      masDetalle();

      expect(screen.queryByRole('radio', { name: 'Centro' })).not.toBeInTheDocument();
      expect(screen.queryByText('¿En qué sucursal?')).not.toBeInTheDocument();
    });
  });

  it('pasa de a 20: con más boletas, páginas', async () => {
    tabletConRelojCorrido(0);
    simularApi(() => 'sin-conexion');
    const prueba = await baseLocalDePrueba();
    await prueba.sembrar('clientes', [ROSA]);
    const muchas = Array.from({ length: 25 }, (_, i) =>
      ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: String(i + 1).padStart(6, '0'), fecha_entrada: `2026-10-${String(1 + (i % 15)).padStart(2, '0')}T12:00:00.000Z` }),
    );
    await prueba.sembrar('ordenes', muchas);
    renderEnRuta(<App />, '/boletas', { baseLocal: prueba.control });

    const paginas = await screen.findByRole('navigation', { name: 'Páginas del historial' });
    expect(within(paginas).getByText('Página 1 de 2')).toBeInTheDocument();
    expect(numerosEnLista()).toHaveLength(20);

    fireEvent.click(within(paginas).getByRole('button', { name: 'Siguientes' }));

    await waitFor(() => expect(numerosEnLista()).toHaveLength(5));
  });

  it('un ADMIN que atiende en una sucursal ve la de trabajo, de la base local, como un empleado', async () => {
    tabletConRelojCorrido(0);
    const servidor = simularApi(() => 'sin-conexion');
    const prueba = await sembrarBoletas();
    const sesion = sesionDePrueba({ rol: 'ADMIN' });
    guardarAtencion(sesion.usuario.id, SUCURSAL_DE_PRUEBA);
    renderEnRuta(<App />, '/boletas', { sesion, baseLocal: prueba.control });

    await screen.findByRole('link', { name: 'Boleta 000010, Rosa Quispe' });
    expect(numerosEnLista()).toEqual(['000010', '000012', '000011', '000013']);
    expect(servidor.pedidos).toEqual([]);
  });
});

describe('Historial de boletas del administrador — SPEC-KRILINXI-041', () => {
  const PRIMERA = boletaDePrueba({ numeroBoleta: '001234', fechaEntrada: '2026-10-15 18:30:00' });
  const SEGUNDA = boletaDePrueba({
    numeroBoleta: '000777',
    sucursal: { id: SUCURSAL_SUR, nombre: 'Sur' },
    cliente: { id: 'c-juan', nombre: 'Juan Mamani', telefono: '71111111' },
    estado: 'ENTREGADO',
    precioTotal: '45.50',
    precioFinal: '50.00',
    pagado: '50.00',
    saldo: '0.00',
    fechaEntrada: '2025-03-02 12:00:00',
  });

  /** /boletas abierta por un ADMIN que no atiende; la API contesta lo que diga `responder`. */
  async function abrirComoAdmin(
    responder: (pedido: PedidoFalso) => RespuestaFalsa = () => ({ status: 200, data: paginaDeBoletas([PRIMERA, SEGUNDA]) }),
  ) {
    tabletConRelojCorrido(0);
    const servidor = simularApi(responder);
    const { control, sembrar } = await baseLocalDePrueba();
    await sembrar('sucursales', [
      { id: SUCURSAL_CENTRO, nombre: 'Centro', activa: 1 },
      { id: SUCURSAL_SUR, nombre: 'Sur', activa: 1 },
    ]);
    renderEnRuta(<App />, '/boletas', { sesion: sesionDePrueba({ rol: 'ADMIN' }), baseLocal: control });
    return { servidor };
  }

  const ultimo = (servidor: { pedidos: { parametros?: unknown }[] }) => servidor.pedidos.at(-1)?.parametros;
  const enLaLista = (nombre: string) => within(screen.getByRole('region', { name: 'Las boletas' })).getByRole('button', { name: nombre });

  it('pide a la API el historial completo: sin fechas, de todas las sucursales, la primera página', async () => {
    const { servidor } = await abrirComoAdmin();

    await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });
    // Sin `desde` ni `hasta`: el historial completo, no los últimos 30 días.
    expect(servidor.pedidos[0]).toMatchObject({ metodo: 'GET', ruta: '/ordenes', parametros: { pagina: 1, por_pagina: 20 } });
    expect(Object.keys(servidor.pedidos[0]?.parametros as object).sort()).toEqual(['pagina', 'por_pagina']);
    expect(screen.getByRole('heading', { name: 'Todas las boletas' })).toBeInTheDocument();
  });

  it('cada boleta dice también en qué sucursal se dejó la ropa, y las muy viejas se ven', async () => {
    await abrirComoAdmin();

    expect(await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' })).toHaveTextContent('Entró el 15/10/2026 · Centro');
    const vieja = enLaLista('Boleta 000777, Juan Mamani');
    expect(vieja).toHaveTextContent('Entró el 02/03/2025 · Sur');
    expect(within(vieja).getByText('Entregado')).toBeInTheDocument();
    expect(vieja).toHaveTextContent('Pagado');
    expect(screen.getByRole('button', { name: 'Boleta 001234, Rosa Quispe' })).toHaveTextContent('Falta pagar Bs 30,00');
    sinJerga();
  });

  it('tocar una boleta muestra su detalle de solo lectura, sin acciones, y se vuelve al historial', async () => {
    await abrirComoAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 000777, Juan Mamani' }));

    const detalle = await screen.findByRole('region', { name: 'Boleta 000777' });
    const dato = (nombre: string) => within(detalle).getByText(nombre, { selector: 'dt' }).nextElementSibling?.textContent;
    expect(dato('Cliente')).toBe('Juan Mamani');
    expect(dato('Teléfono')).toBe('71111111');
    expect(dato('Sucursal')).toBe('Sur');
    expect(dato('Precio')).toBe('Bs 45,50');
    expect(dato('Precio final')).toBe('Bs 50,00');
    expect(dato('Pagado')).toBe('Bs 50,00');
    expect(dato('Cuenta')).toBe('Pagado');
    // Nada para hacer con ella: no tiene la ropa en su tablet.
    for (const accion of ['Cobrar', 'Anular', 'Entregar la ropa', 'Empezar a lavar', 'Marcar como lista']) {
      expect(screen.queryByRole('button', { name: accion })).not.toBeInTheDocument();
    }
    sinJerga();

    fireEvent.click(screen.getByRole('button', { name: 'Volver al historial' }));
    expect(await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' })).toBeInTheDocument();
  });

  it('el detalle lista los renglones de la boleta y sus cargos, en vez de la descripción — SPEC-KRILINXI-068', async () => {
    const conRenglones = boletaDePrueba({
      numeroBoleta: '000888',
      renglones: [
        renglonDePrueba({ descripcion: 'Camisa', cantidad: '2.00', precioUnitario: '15.00', subtotal: '30.00' }),
        renglonDePrueba({ momento: 'ENTREGA', descripcion: 'Recargo', cantidad: '1.00', precioUnitario: '5.00', subtotal: '5.00' }),
      ],
    });
    await abrirComoAdmin(() => ({ status: 200, data: paginaDeBoletas([conRenglones]) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 000888, Rosa Quispe' }));

    const detalle = await screen.findByRole('region', { name: 'Boleta 000888' });
    expect(within(detalle).queryByText('Ropa', { selector: 'dt' })).not.toBeInTheDocument();
    expect(within(within(detalle).getByRole('list', { name: 'Lo que dejó' })).getByRole('listitem')).toHaveTextContent(
      '2 CamisaBs 15,00 cada unaBs 30,00',
    );
    expect(within(detalle).getByRole('list', { name: 'Cargos al entregar' })).toHaveTextContent('1 Recargo');
  });

  it('una entregada sin boleta dice quién la retiró, con su nombre y carnet — SPEC-KRILINXI-060', async () => {
    const sinBoleta = boletaDePrueba({
      numeroBoleta: '000555',
      estado: 'ENTREGADO',
      precioFinal: '50.00',
      pagado: '50.00',
      saldo: '0.00',
      retiro: { tipo: 'SIN_BOLETA', nombre: 'Luis Mamani', carnet: '1234567 LP' },
    });
    await abrirComoAdmin(() => ({ status: 200, data: paginaDeBoletas([sinBoleta]) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 000555, Rosa Quispe' }));

    const detalle = await screen.findByRole('region', { name: 'Boleta 000555' });
    expect(within(detalle).getByText('Retiró', { selector: 'dt' }).nextElementSibling?.textContent).toBe('Luis Mamani, 1234567 LP');
    sinJerga();
  });

  it('una entregada con boleta lo dice, sin nombre — SPEC-KRILINXI-060', async () => {
    const conBoleta = boletaDePrueba({
      numeroBoleta: '000556',
      estado: 'ENTREGADO',
      precioFinal: '50.00',
      pagado: '50.00',
      saldo: '0.00',
      retiro: { tipo: 'CON_BOLETA', nombre: null, carnet: null },
    });
    await abrirComoAdmin(() => ({ status: 200, data: paginaDeBoletas([conBoleta]) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 000556, Rosa Quispe' }));

    const detalle = await screen.findByRole('region', { name: 'Boleta 000556' });
    expect(within(detalle).getByText('Retiró', { selector: 'dt' }).nextElementSibling?.textContent).toBe('Con la boleta');
  });

  it('una boleta sin entregar no habla de retiro — SPEC-KRILINXI-060', async () => {
    await abrirComoAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' }));

    const detalle = await screen.findByRole('region', { name: 'Boleta 001234' });
    expect(within(detalle).queryByText('Retiró')).not.toBeInTheDocument();
  });

  it('una boleta sin entregar no muestra precio final', async () => {
    await abrirComoAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' }));

    const detalle = await screen.findByRole('region', { name: 'Boleta 001234' });
    expect(within(detalle).queryByText('Precio final')).not.toBeInTheDocument();
    expect(within(detalle).getByText('Falta pagar Bs 30,00')).toBeInTheDocument();
  });

  it('los filtros viajan a la API, y el texto espera a que se haga una pausa', async () => {
    const { servidor } = await abrirComoAdmin();
    await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });
    const antes = servidor.pedidos.length;

    // Tres teclas seguidas: un solo pedido, al final.
    for (const texto of ['ro', 'ros', 'rosa']) fireEvent.change(buscador(), { target: { value: texto } });
    expect(servidor.pedidos).toHaveLength(antes);
    await waitFor(() => expect(ultimo(servidor)).toEqual({ texto: 'rosa', pagina: 1, por_pagina: 20 }), { timeout: 3000 });
    expect(servidor.pedidos).toHaveLength(antes + 1);

    fireEvent.click(screen.getByLabelText('Solo las que tienen saldo pendiente'));
    await waitFor(() => expect(ultimo(servidor)).toEqual({ texto: 'rosa', con_saldo: 'true', pagina: 1, por_pagina: 20 }));
  });

  it('filtra por estado, sucursal y fechas, y esos filtros viajan a la API', async () => {
    const { servidor } = await abrirComoAdmin();
    await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });
    masDetalle();

    fireEvent.click(screen.getByRole('radio', { name: 'Entregado' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Sur' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2025-03-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2025-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

    await waitFor(() =>
      expect(ultimo(servidor)).toEqual({
        desde: '2025-03-01',
        hasta: '2025-03-31',
        sucursal_id: SUCURSAL_SUR,
        estado: 'ENTREGADO',
        pagina: 1,
        por_pagina: 20,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Boletas del 01/03/2025 al 31/03/2025' })).toBeInTheDocument();
  });

  it('limpiar los filtros vuelve a pedir el historial completo', async () => {
    const { servidor } = await abrirComoAdmin();
    await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });
    fireEvent.click(screen.getByLabelText('Solo las que tienen saldo pendiente'));
    await waitFor(() => expect(ultimo(servidor)).toEqual(expect.objectContaining({ con_saldo: 'true' })));

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    await waitFor(() => expect(ultimo(servidor)).toEqual({ pagina: 1, por_pagina: 20 }));
  });

  it('pagina, pidiendo la página que corresponde', async () => {
    const { servidor } = await abrirComoAdmin(() => ({ status: 200, data: paginaDeBoletas([PRIMERA], { total: 41 }) }));
    const paginas = await screen.findByRole('navigation', { name: 'Páginas del historial' });
    expect(within(paginas).getByText('Página 1 de 3')).toBeInTheDocument();

    fireEvent.click(within(paginas).getByRole('button', { name: 'Siguientes' }));

    await waitFor(() => expect(ultimo(servidor)).toEqual(expect.objectContaining({ pagina: 2 })));
  });

  it('sin internet dice que el historial completo necesita conexión, en vez de una lista vacía', async () => {
    await abrirComoAdmin(() => 'sin-conexion');

    expect(await screen.findByText('El historial completo necesita conexión.')).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no hay boletas/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Las boletas' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveClass('bg-advertencia-fondo');
    // Es la acción de la pantalla en ese momento: la única principal.
    expect(accionesPrincipales()).toEqual(['Probar de nuevo']);
    sinJerga();
  });

  it('una respuesta que no encaja con lo esperado lo dice, y se puede probar de nuevo', async () => {
    await abrirComoAdmin(() => ({ status: 200, data: { cualquier: 'cosa' } }));

    expect(await screen.findByText(/La lista llegó incompleta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Probar de nuevo' })).toBeInTheDocument();
  });

  it('sin ninguna boleta todavía, lo dice en palabras', async () => {
    await abrirComoAdmin(() => ({ status: 200, data: paginaDeBoletas([]) }));

    expect(await screen.findByText('Todavía no hay boletas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('sin resultados con filtros lo dice en palabras y ofrece limpiarlos', async () => {
    // La API no encuentra nada cuando se pide "con saldo", y devuelve todo cuando no.
    await abrirComoAdmin((pedido) => ({
      status: 200,
      data: paginaDeBoletas((pedido.parametros as { con_saldo?: string }).con_saldo ? [] : [PRIMERA, SEGUNDA]),
    }));
    await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });

    fireEvent.click(screen.getByLabelText('Solo las que tienen saldo pendiente'));

    expect(await screen.findByText('No hay ninguna boleta con esos filtros.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('region', { name: 'Las boletas' })).getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' })).toBeInTheDocument();
  });
});
