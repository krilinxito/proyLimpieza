import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { cuerpoError } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import {
  clientesDePrueba,
  ingresosDePrueba,
  saldosDePrueba,
  simularEstadisticas,
  sinRecogerDePrueba,
  SUCURSAL_CENTRO,
} from '../../../test/estadisticasDePrueba';
import { sinJerga } from '../../../test/jerga';
import { tabletConRelojCorrido } from '../../../test/reloj';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';
import { DESDE_SIEMPRE } from '../periodo';

// `tabletConRelojCorrido(0)` deja la tablet en el 16/10/2026, 10:05 en Bolivia.
const HOY = '2026-10-16';

/** El panel abierto por un ADMIN, con dos sucursales en la base local. */
async function abrirPanel() {
  tabletConRelojCorrido(0);
  const { control, sembrar } = await baseLocalDePrueba();
  await sembrar('sucursales', [
    { id: SUCURSAL_CENTRO, nombre: 'Centro', activa: 1 },
    { id: '00000000-0000-4000-8000-0000000000c2', nombre: 'Norte', activa: 1 },
  ]);
  renderEnRuta(<App />, '/estadisticas', { sesion: sesionDePrueba({ rol: 'ADMIN' }), baseLocal: control });
}

const seccion = (nombre: string) => screen.getByRole('region', { name: nombre });

describe('Panel de estadísticas — SPEC-KRILINXI-015', () => {
  it('el ADMIN ve el panel en vez del aviso de en construcción', async () => {
    simularEstadisticas();
    await abrirPanel();

    expect(await screen.findByRole('heading', { name: 'Cobrado de hoy' })).toBeInTheDocument();
    expect(screen.queryByText('Esta parte todavía no está hecha.')).not.toBeInTheDocument();
    sinJerga();
  });

  it('sin elegir nada pide los ingresos de hoy y todo lo pendiente hasta hoy, de todas las sucursales', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Cobrado de hoy' });

    // Solo las tres de esta spec: volumen, productividad y clientes las revisa SPEC-KRILINXI-016.
    expect(Object.fromEntries(servidor.pedidos.map((p) => [p.ruta, p.parametros]))).toEqual(
      expect.objectContaining({
        '/estadisticas/ingresos': { desde: HOY, hasta: HOY },
        '/estadisticas/saldos': { desde: DESDE_SIEMPRE, hasta: HOY },
        '/estadisticas/sin-recoger': { desde: DESDE_SIEMPRE, hasta: HOY },
      }),
    );
  });

  it('muestra los ingresos por sucursal y por forma de pago, con los totales tal como llegan', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Cobrado de hoy' });

    const cobrado = seccion('Cobrado');
    expect(within(cobrado).getAllByText('Bs 125,50')).not.toHaveLength(0);
    expect(within(cobrado).getByText('Centro: Bs 125,50')).toBeInTheDocument();
    expect(within(cobrado).getByText('Pago con QR').nextElementSibling).toHaveTextContent('Bs 25,50');
    expect(within(cobrado).getByText('Tarjeta').nextElementSibling).toHaveTextContent('Bs 0,00');
  });

  it('muestra los saldos y la ropa sin recoger con su antigüedad en días', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Falta cobrar hasta hoy' });

    const saldos = seccion('Falta cobrar');
    expect(within(saldos).getByText('Más de 30 días').nextElementSibling).toHaveTextContent('1 boleta — Bs 30,00');
    expect(within(saldos).getByText(/Debe Bs 30,00 de Bs 50,00 · Listo para retirar · hace 45 días/)).toBeInTheDocument();

    const ropa = seccion('Ropa sin recoger');
    expect(within(ropa).getByText('Hasta 7 días').nextElementSibling).toHaveTextContent('1 boleta');
    expect(within(ropa).getByText(/3 camisas · Centro · Bs 45,00 · hace 2 días/)).toBeInTheDocument();
    sinJerga();
  });

  it('con listas vacías lo dice en palabras', async () => {
    simularEstadisticas({
      ingresos: { status: 200, data: ingresosDePrueba({ total: '0.00', porSucursal: [] }) },
      saldos: { status: 200, data: saldosDePrueba({ total: '0.00', cantidad: 0, ordenes: [] }) },
      sinRecoger: { status: 200, data: sinRecogerDePrueba({ cantidad: 0, ordenes: [] }) },
    });
    await abrirPanel();

    expect(await screen.findByText('No hubo cobros en este período.')).toBeInTheDocument();
    expect(screen.getByText('Nadie debe nada en este período.')).toBeInTheDocument();
    expect(screen.getByText('No hay ropa sin recoger en este período.')).toBeInTheDocument();
  });

  it('elegir fechas y sucursal vuelve a pedir las tres secciones con ese período', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Cobrado de hoy' });

    fireEvent.click(await screen.findByRole('radio', { name: 'Centro' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

    expect(await screen.findByRole('heading', { name: 'Cobrado del 01/10/2026 al 15/10/2026' })).toBeInTheDocument();
    // El último pedido de cada una de las tres secciones de esta spec.
    const ultimoDe = (ruta: string) => servidor.pedidos.filter((p) => p.ruta === ruta).at(-1)?.parametros;
    const elegido = { desde: '2026-10-01', hasta: '2026-10-15', sucursal_id: SUCURSAL_CENTRO };
    expect(['/estadisticas/ingresos', '/estadisticas/saldos', '/estadisticas/sin-recoger'].map(ultimoDe)).toEqual(
      Array(3).fill(elegido),
    );
  });

  it('unas fechas al revés no se piden: se avisa qué corregir', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Cobrado de hoy' });
    const antes = servidor.pedidos.length;

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-15' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

    expect(screen.getByText(/no puede ser posterior a «hasta»/)).toBeInTheDocument();
    expect(servidor.pedidos).toHaveLength(antes);
  });

  it('sin internet dice que las estadísticas necesitan conexión y no muestra ningún número', async () => {
    simularEstadisticas('sin-conexion');
    await abrirPanel();

    expect(await screen.findByText('Las estadísticas necesitan conexión.')).toBeInTheDocument();
    expect(screen.queryByText(/Bs \d/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Cobrado/ })).not.toBeInTheDocument();
    sinJerga();
  });

  it('cuando vuelve internet, carga sola', async () => {
    simularEstadisticas('sin-conexion');
    await abrirPanel();
    await screen.findByText('Las estadísticas necesitan conexión.');

    simularEstadisticas();
    window.dispatchEvent(new Event('online'));

    expect(await screen.findByRole('heading', { name: 'Cobrado de hoy' })).toBeInTheDocument();
    expect(screen.queryByText('Las estadísticas necesitan conexión.')).not.toBeInTheDocument();
  });

  it('si la API responde un error, muestra su mensaje y deja probar de nuevo', async () => {
    const mensaje = 'La sucursal elegida no es válida. Volvé a elegirla de la lista.';
    simularEstadisticas({ saldos: { status: 400, data: cuerpoError('VALIDACION', mensaje) } });
    await abrirPanel();

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    simularEstadisticas();
    fireEvent.click(screen.getByRole('button', { name: 'Probar de nuevo' }));
    await waitFor(() => expect(screen.queryByText(mensaje)).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: 'Cobrado de hoy' })).toBeInTheDocument();
    sinJerga();
  });
});

describe('Panel de estadísticas: volumen, productividad y clientes — SPEC-KRILINXI-016', () => {
  it('sin elegir nada pide los últimos 30 días, y la primera página de clientes', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Clientes atendidos de los últimos 30 días' });

    const ultimos30 = { desde: '2026-09-17', hasta: HOY };
    const de = (ruta: string) => servidor.pedidos.find((p) => p.ruta === ruta)?.parametros;
    expect(de('/estadisticas/volumen')).toEqual(ultimos30);
    expect(de('/estadisticas/productividad')).toEqual(ultimos30);
    // El título de la sección se dibuja antes de que su pedido llegue al servidor (axios pasa por
    // sus interceptores, que son asíncronos): se espera el pedido, no el título. SPEC-KRILINXI-018
    // lo corrigió, porque fallaba de vez en cuando.
    await waitFor(() => expect(de('/estadisticas/clientes')).toEqual({ ...ultimos30, pagina: 1, por_pagina: 20 }));
  });

  it('muestra cada día del período, también los que quedaron en 0, con sus anuladas', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Ropa recibida de los últimos 30 días' });

    const volumen = seccion('Ropa recibida');
    expect(within(volumen).getByText('6 boletas')).toBeInTheDocument();
    expect(within(volumen).getByText('De esas, 1 anulada.')).toBeInTheDocument();
    expect(within(volumen).getByText('15/10/2026').nextElementSibling).toHaveTextContent('4 boletas (1 anulada)');
    expect(within(volumen).getByText('16/10/2026').nextElementSibling).toHaveTextContent('0 boletas');
    sinJerga();
  });

  it('muestra una fila por persona y por sucursal: quien trabajó en dos sale dos veces', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Lo que hizo cada persona de los últimos 30 días' });

    const personas = seccion('Lo que hizo cada persona');
    expect(within(personas).getByText('Ana Flores — Centro')).toBeInTheDocument();
    expect(within(personas).getByText('Ana Flores — Norte')).toBeInTheDocument();
    expect(within(personas).getByText('Recibió 12 · Cobró 9 veces (Bs 340,50) · Entregó 7')).toBeInTheDocument();
    sinJerga();
  });

  it('muestra los clientes con sus atenciones, cuánto pagaron, su última visita y cada sucursal', async () => {
    simularEstadisticas();
    await abrirPanel();

    const clientes = await screen.findByRole('region', { name: 'Clientes atendidos' });
    expect(await within(clientes).findByText('Rosa Quispe (70123456)')).toBeInTheDocument();
    expect(within(clientes).getByText('Vino 3 veces · Pagó Bs 150,00 · Última vez: 15/10/2026 18:30')).toBeInTheDocument();
    expect(within(clientes).getByText('Norte: Vino 1 vez · Pagó Bs 50,00 · Última vez: 20/09/2026 10:00')).toBeInTheDocument();
    sinJerga();
  });

  it('pagina los clientes pidiendo a la API la página que corresponde, sin volver a pedir el resto', async () => {
    const servidor = simularEstadisticas({ clientes: { status: 200, data: clientesDePrueba({ total: 45 }) } });
    await abrirPanel();
    const clientes = await screen.findByRole('region', { name: 'Clientes atendidos' });
    expect(await within(clientes).findByText('Página 1 de 3')).toBeInTheDocument();
    const antes = servidor.pedidos.length;

    fireEvent.click(within(clientes).getByRole('button', { name: 'Siguientes' }));

    await waitFor(() => expect(servidor.pedidos).toHaveLength(antes + 1));
    expect(servidor.pedidos.at(-1)).toEqual(
      expect.objectContaining({ ruta: '/estadisticas/clientes', parametros: expect.objectContaining({ pagina: 2 }) }),
    );
    expect(await within(clientes).findByText('Página 2 de 3')).toBeInTheDocument();
  });

  it('cambiar el período o la sucursal vuelve a pedir las tres, y los clientes desde la página 1', async () => {
    const servidor = simularEstadisticas({ clientes: { status: 200, data: clientesDePrueba({ total: 45 }) } });
    await abrirPanel();
    const clientes = await screen.findByRole('region', { name: 'Clientes atendidos' });
    fireEvent.click(await within(clientes).findByRole('button', { name: 'Siguientes' }));
    await within(clientes).findByText('Página 2 de 3');

    // Las sucursales del filtro se leen de la base local: hay que esperarlas (SPEC-KRILINXI-018 lo
    // corrigió: con `getByRole` este test fallaba 1 de cada 3 o 4 veces).
    fireEvent.click(await screen.findByRole('radio', { name: 'Centro' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

    await screen.findByRole('heading', { name: 'Clientes atendidos del 01/10/2026 al 15/10/2026' });
    const elegido = { desde: '2026-10-01', hasta: '2026-10-15', sucursal_id: SUCURSAL_CENTRO };
    const ultimoDe = (ruta: string) => servidor.pedidos.filter((p) => p.ruta === ruta).at(-1)?.parametros;
    await waitFor(() => expect(ultimoDe('/estadisticas/clientes')).toEqual({ ...elegido, pagina: 1, por_pagina: 20 }));
    expect(ultimoDe('/estadisticas/volumen')).toEqual(elegido);
    expect(ultimoDe('/estadisticas/productividad')).toEqual(elegido);
  });

  it('sin internet estas secciones tampoco muestran números', async () => {
    simularEstadisticas('sin-conexion');
    await abrirPanel();

    expect(await screen.findByText('Las estadísticas necesitan conexión.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ropa recibida' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Clientes atendidos' })).not.toBeInTheDocument();
  });

  it('si se corta internet al pasar de página, los clientes lo dicen y se puede probar de nuevo', async () => {
    simularEstadisticas({ clientes: { status: 200, data: clientesDePrueba({ total: 45 }) } });
    await abrirPanel();
    const clientes = await screen.findByRole('region', { name: 'Clientes atendidos' });
    await within(clientes).findByText('Página 1 de 3');

    simularEstadisticas('sin-conexion');
    fireEvent.click(within(clientes).getByRole('button', { name: 'Siguientes' }));

    expect(await within(clientes).findByText('Las estadísticas necesitan conexión.')).toBeInTheDocument();
    simularEstadisticas({ clientes: { status: 200, data: clientesDePrueba({ total: 45, pagina: 2 }) } });
    fireEvent.click(within(clientes).getByRole('button', { name: 'Probar de nuevo' }));
    expect(await within(clientes).findByText('Rosa Quispe (70123456)')).toBeInTheDocument();
    sinJerga();
  });
});

describe('Las barras del volumen sin estilos en línea — SPEC-KRILINXI-020', () => {
  it('el ancho va en una clase: la del día con más ropa es la más ancha, y un día sin ropa no tiene barra', async () => {
    simularEstadisticas();
    await abrirPanel();
    const volumen = await screen.findByRole('region', { name: 'Ropa recibida' });
    const barra = (fecha: string) => within(volumen).getByText(fecha).nextElementSibling?.querySelector('[aria-hidden="true"]');

    expect(barra('15/10/2026')).toHaveClass('w-[60%]');
    expect(barra('14/10/2026')).toHaveClass('w-[30%]');
    expect(barra('16/10/2026')).toHaveClass('w-0');
    expect(volumen.querySelector('[style]')).toBeNull();
  });
});
