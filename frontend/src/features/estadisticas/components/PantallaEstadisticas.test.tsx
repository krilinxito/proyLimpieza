import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { cuerpoError } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import {
  clientesDePrueba,
  ingresosDePrueba,
  ingresosPorDiaDeDias,
  ingresosPorDiaDePrueba,
  productividadDePrueba,
  saldosDePrueba,
  simularEstadisticas,
  sinRecogerDePrueba,
  SUCURSAL_CENTRO,
  SUCURSAL_NORTE,
  volumenDeDias,
} from '../../../test/estadisticasDePrueba';
import { sinJerga } from '../../../test/jerga';
import { tabletConRelojCorrido } from '../../../test/reloj';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';
import { DESDE_SIEMPRE } from '../periodo';
import { Esqueleto } from './Esqueleto';

// `tabletConRelojCorrido(0)` deja la tablet en el 16/10/2026, 10:05 en Bolivia.
const HOY = '2026-10-16';

/**
 * Abre "Ver más estadísticas" (SPEC-KRILINXI-050): ahí están las cinco tarjetas que no se ven de entrada. Espera a que el
 * panel esté listo, que es cuando aparece.
 */
async function desplegarMas() {
  const resumen = await screen.findByText('Ver más estadísticas');
  const detalle = resumen.closest('details');
  if (!detalle) throw new Error('"Ver más estadísticas" no está en un <details>.');
  if (!detalle.open) fireEvent.click(resumen);
  await waitFor(() => expect(detalle).toHaveAttribute('open'));
}

/**
 * El panel abierto por un ADMIN, con dos sucursales en la base local. Por defecto despliega "Ver más estadísticas" cuando
 * el panel está listo, para que los tests de cada tarjeta las encuentren todas (SPEC-KRILINXI-050); `desplegar: false`
 * para los que miran la carga, el error o la falta de internet, donde el panel no llega a estar listo.
 */
async function abrirPanel({ desplegar = true }: { desplegar?: boolean } = {}) {
  tabletConRelojCorrido(0);
  const { control, sembrar } = await baseLocalDePrueba();
  await sembrar('sucursales', [
    { id: SUCURSAL_CENTRO, nombre: 'Centro', activa: 1 },
    { id: '00000000-0000-4000-8000-0000000000c2', nombre: 'Norte', activa: 1 },
  ]);
  renderEnRuta(<App />, '/estadisticas', { sesion: sesionDePrueba({ rol: 'ADMIN' }), baseLocal: control });
  if (desplegar) await desplegarMas();
}

const seccion = (nombre: string) => screen.getByRole('region', { name: nombre });

/** El "Ver el detalle" plegado de una tarjeta (SPEC-KRILINXI-042). */
async function detalleDe(tarjeta: HTMLElement): Promise<HTMLElement> {
  const resumen = await within(tarjeta).findByText('Ver el detalle');
  const detalle = resumen.closest('details');
  if (!detalle) throw new Error('La tarjeta no tiene su "Ver el detalle".');
  return detalle;
}

/**
 * Las celdas de una fila de la tabla de un gráfico, por el encabezado de la fila. Desde
 * SPEC-KRILINXI-026 cada número del panel está en el dibujo y en su tabla: los tests leen la tabla,
 * que es lo que lee el lector de pantalla.
 */
function fila(contenedor: HTMLElement, tabla: string, encabezado: string): string[] {
  const deLaTabla = within(within(contenedor).getByRole('table', { name: tabla }));
  const celdas = deLaTabla.getByRole('rowheader', { name: encabezado }).closest('tr')?.children ?? [];
  return [...celdas].map((celda) => celda.textContent ?? '');
}

describe('Panel de estadísticas — SPEC-KRILINXI-015', () => {
  it('el ADMIN ve el panel en vez del aviso de en construcción', async () => {
    simularEstadisticas();
    await abrirPanel();

    expect(await screen.findByRole('heading', { name: '¿Cuánto se cobró en cada sucursal?' })).toBeInTheDocument();
    expect(screen.queryByText('Esta parte todavía no está hecha.')).not.toBeInTheDocument();
    sinJerga();
  });

  it('sin elegir nada pide los ingresos de hoy y todo lo pendiente hasta hoy, de todas las sucursales', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Cuánto se cobró en cada sucursal?' });

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
    await screen.findByRole('heading', { name: '¿Cuánto se cobró en cada sucursal?' });

    const cobrado = seccion('Cobrado por sucursal');
    expect(within(cobrado).getAllByText('Bs 125,50')).not.toHaveLength(0);
    expect(within(cobrado).getByText('Centro: Bs 125,50')).toBeInTheDocument();
    // Sucursal, Efectivo, Pago con QR, Tarjeta, Transferencia y Total (SPEC-KRILINXI-026: la tabla del gráfico).
    expect(fila(cobrado, 'Cobrado por sucursal y forma de pago', 'Centro')).toEqual([
      'Centro',
      'Bs 100,00',
      'Bs 25,50',
      'Bs 0,00',
      'Bs 0,00',
      'Bs 125,50',
    ]);
  });

  it('muestra los saldos y la ropa sin recoger con su antigüedad en días', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Cuánto falta cobrar, y desde hace cuánto?' });

    const saldos = seccion('Falta cobrar');
    expect(fila(saldos, 'Falta cobrar según los días', 'Más de 30 días')).toEqual(['Más de 30 días', '1 boleta', 'Bs 30,00']);
    expect(within(saldos).getByText(/Debe Bs 30,00 de Bs 50,00 · Listo para retirar · hace 45 días/)).toBeInTheDocument();

    const ropa = seccion('Ropa sin recoger');
    expect(fila(ropa, 'Ropa sin recoger según los días', 'Hasta 7 días')).toEqual(['Hasta 7 días', '1 boleta']);
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

    // Sin cobros no hay gráfico que dibujar, y lo dice (SPEC-KRILINXI-026).
    await screen.findByRole('heading', { name: '¿Cuánto se cobró en cada sucursal?' });
    expect(within(seccion('Cobrado por sucursal')).getByText('No hay datos en este período.')).toBeInTheDocument();
    expect(within(seccion('Cobrado por forma de pago')).getByText('No hay datos en este período.')).toBeInTheDocument();
    expect(screen.getByText('Nadie debe nada en este período.')).toBeInTheDocument();
    expect(screen.getByText('No hay ropa sin recoger en este período.')).toBeInTheDocument();
  });

  it('elegir fechas y sucursal vuelve a pedir las tres secciones con ese período', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Cuánto se cobró en cada sucursal?' });

    fireEvent.click(await screen.findByRole('radio', { name: 'Centro' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

    expect((await screen.findAllByText('Del 01/10/2026 al 15/10/2026')).length).toBeGreaterThan(0);
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
    await screen.findByRole('heading', { name: '¿Cuánto se cobró en cada sucursal?' });
    const antes = servidor.pedidos.length;

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-15' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

    expect(screen.getByText(/no puede ser posterior a «hasta»/)).toBeInTheDocument();
    expect(servidor.pedidos).toHaveLength(antes);
  });

  it('sin internet dice que las estadísticas necesitan conexión y no muestra ningún número', async () => {
    simularEstadisticas('sin-conexion');
    await abrirPanel({ desplegar: false });

    expect(await screen.findByText('Las estadísticas necesitan conexión.')).toBeInTheDocument();
    expect(screen.queryByText(/Bs \d/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Cobrado/ })).not.toBeInTheDocument();
    sinJerga();
  });

  it('cuando vuelve internet, carga sola', async () => {
    simularEstadisticas('sin-conexion');
    await abrirPanel({ desplegar: false });
    await screen.findByText('Las estadísticas necesitan conexión.');

    simularEstadisticas();
    window.dispatchEvent(new Event('online'));

    await desplegarMas();
    expect(await screen.findByRole('heading', { name: '¿Cuánto se cobró en cada sucursal?' })).toBeInTheDocument();
    expect(screen.queryByText('Las estadísticas necesitan conexión.')).not.toBeInTheDocument();
  });

  it('si la API responde un error, muestra su mensaje y deja probar de nuevo', async () => {
    const mensaje = 'La sucursal elegida no es válida. Vuelve a elegirla de la lista.';
    simularEstadisticas({ saldos: { status: 400, data: cuerpoError('VALIDACION', mensaje) } });
    await abrirPanel({ desplegar: false });

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    simularEstadisticas();
    fireEvent.click(screen.getByRole('button', { name: 'Probar de nuevo' }));
    await waitFor(() => expect(screen.queryByText(mensaje)).not.toBeInTheDocument());
    await desplegarMas();
    expect(await screen.findByRole('heading', { name: '¿Cuánto se cobró en cada sucursal?' })).toBeInTheDocument();
    sinJerga();
  });
});

describe('Panel de estadísticas: volumen, productividad y clientes — SPEC-KRILINXI-016', () => {
  it('sin elegir nada pide los últimos 30 días, y la primera página de clientes', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Quiénes son los clientes que más vienen?' });

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
    await screen.findByRole('heading', { name: '¿Cuánta ropa entró cada día?' });

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
    await screen.findByRole('heading', { name: '¿Cuánto atendió cada persona?' });

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
    const detalle = within(await detalleDe(clientes));
    expect(await detalle.findByText('Rosa Quispe (70123456)')).toBeInTheDocument();
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

    await within(await screen.findByRole('region', { name: 'Clientes atendidos' })).findByText('Del 01/10/2026 al 15/10/2026');
    const elegido = { desde: '2026-10-01', hasta: '2026-10-15', sucursal_id: SUCURSAL_CENTRO };
    const ultimoDe = (ruta: string) => servidor.pedidos.filter((p) => p.ruta === ruta).at(-1)?.parametros;
    await waitFor(() => expect(ultimoDe('/estadisticas/clientes')).toEqual({ ...elegido, pagina: 1, por_pagina: 20 }));
    expect(ultimoDe('/estadisticas/volumen')).toEqual(elegido);
    expect(ultimoDe('/estadisticas/productividad')).toEqual(elegido);
  });

  it('sin internet estas secciones tampoco muestran números', async () => {
    simularEstadisticas('sin-conexion');
    await abrirPanel({ desplegar: false });

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
    expect(await within(await detalleDe(clientes)).findByText('Rosa Quispe (70123456)')).toBeInTheDocument();
    sinJerga();
  });
});

describe('Las barras del volumen sin estilos en línea — SPEC-KRILINXI-020', () => {
  // Desde SPEC-KRILINXI-026 las barras son columnas de un SVG: el alto va en un atributo, no en un
  // `style` ni en una clase. Desde SPEC-KRILINXI-036, en el `<svg data-barra>` que recorta la columna.
  it('el alto va en un atributo del SVG: la del día con más ropa es la más alta, y un día sin ropa no tiene columna', async () => {
    simularEstadisticas();
    await abrirPanel();
    const volumen = await screen.findByRole('region', { name: 'Ropa recibida' });
    const columna = (nombre: string) => within(volumen).getByRole('button', { name: nombre }).querySelector('[data-barra]');

    expect(columna('15/10/2026: 4 boletas (1 anulada)')).toHaveAttribute('height', '82%');
    expect(columna('14/10/2026: 2 boletas')).toHaveAttribute('height', '41%');
    expect(columna('16/10/2026: 0 boletas')).toBeNull();
    expect(volumen.querySelector('[style]')).toBeNull();
  });
});

describe('El panel como tablero — SPEC-KRILINXI-026', () => {
  /** Lo que vale un indicador de la fila de arriba, por su nombre. */
  const indicador = (nombre: string) => within(seccion('Resumen')).getByText(nombre, { selector: 'dt' }).parentElement;
  const grafico = (nombre: string) => screen.getByRole('figure', { name: nombre });

  it('arriba van los cuatro indicadores, con los montos tal como llegan, sin sumarlos', async () => {
    // El total no es la suma de las sucursales a propósito: si el panel sumara, se notaría.
    simularEstadisticas({ ingresos: { status: 200, data: ingresosDePrueba({ total: '999.99' }) } });
    await abrirPanel();
    await screen.findByRole('region', { name: 'Resumen' });

    expect(indicador('Cobrado de hoy')).toHaveTextContent('Bs 999,99');
    expect(indicador('Falta cobrar hasta hoy')).toHaveTextContent('Bs 30,00En 1 boleta');
    expect(indicador('Ropa sin recoger hasta hoy')).toHaveTextContent('1 boleta');
    expect(indicador('Ropa recibida de los últimos 30 días')).toHaveTextContent('6 boletas');
    sinJerga();
  });

  it('los ingresos son una barra por sucursal, apilada por forma de pago, con leyenda y cada monto rotulado', async () => {
    simularEstadisticas({
      ingresos: {
        status: 200,
        data: ingresosDePrueba({
          total: '150.00',
          porSucursal: [
            ...ingresosDePrueba().porSucursal,
            {
              sucursalId: SUCURSAL_NORTE,
              sucursal: 'Norte',
              total: '24.50',
              porMetodo: { EFECTIVO: '0.00', QR: '0.00', TARJETA: '0.00', TRANSFERENCIA: '24.50' },
            },
          ],
        }),
      },
    });
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Cuánto se cobró en cada sucursal?' });
    const cobrado = grafico('Cobrado por sucursal y forma de pago');

    // La leyenda, con los cuatro métodos en su orden fijo.
    const leyenda = within(cobrado).getByRole('list', { name: 'Formas de pago' });
    expect(within(leyenda).getAllByRole('listitem').map((m) => m.textContent)).toEqual(['Efectivo', 'Pago con QR', 'Tarjeta', 'Transferencia']);

    // Centro: efectivo y QR. La tarjeta, en cero, no ocupa lugar ni se rotula.
    const centro = within(cobrado).getByRole('button', { name: /^Centro:/ });
    expect([...centro.querySelectorAll('rect')].map((r) => r.getAttribute('class'))).toEqual([
      'fill-serie-1',
      'fill-serie-2',
    ]);
    expect(within(centro).getByText('Efectivo Bs 100,00')).toBeInTheDocument();
    expect(within(centro).getByText('Pago con QR Bs 25,50')).toBeInTheDocument();
    expect(within(centro).queryByText(/Tarjeta/)).not.toBeInTheDocument();

    // El color sigue al método, no a su lugar: la transferencia del Norte es la serie 4 aunque vaya sola.
    const norte = within(cobrado).getByRole('button', { name: /^Norte:/ });
    expect(norte.querySelector('rect')).toHaveClass('fill-serie-4');
    // La barra más larga llega a todo el ancho, y las demás se miden con la misma escala.
    expect(centro.querySelector('rect')).toHaveAttribute('width', '79.68%');
    expect(norte.querySelector('[data-barra]')).toHaveAttribute('width', '19.52%');
  });

  it('el volumen es una columna por día, con el total arriba y el eje de fechas sin amontonar', async () => {
    simularEstadisticas({ volumen: { status: 200, data: volumenDeDias(30) } });
    await abrirPanel();
    const volumen = await screen.findByRole('region', { name: 'Ropa recibida' });
    const porDia = within(volumen).getByRole('figure', { name: 'Ropa recibida por día' });

    // Treinta columnas, también las de los días en cero (i % 4 = 0, el primero de cada cuatro):
    // 0+1+2+3 siete veces, y 0+1 los dos últimos días, son 43.
    expect(within(porDia).getAllByRole('button')).toHaveLength(30);
    expect(within(porDia).getByRole('button', { name: '17/09/2026: 0 boletas' }).querySelector('rect')).toBeNull();
    // El total va arriba del gráfico, y solo seis fechas escritas en el eje: con treinta no entrarían.
    expect(within(volumen).getByText('43 boletas').compareDocumentPosition(porDia)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const eje = [...porDia.querySelectorAll('[aria-hidden="true"] > span')].map((s) => s.textContent).filter(Boolean);
    expect(eje).toEqual(['17/09', '23/09', '29/09', '05/10', '11/10', '16/10']);
  });

  it('los saldos y la ropa sin recoger van por antigüedad, más oscuros cuanto más viejos, con lo de cada tramo rotulado', async () => {
    simularEstadisticas({
      saldos: {
        status: 200,
        data: saldosDePrueba({
          total: '80.00',
          cantidad: 3,
          porAntiguedad: [
            { tramo: 'HASTA_7_DIAS', cantidad: 1, total: '10.00' },
            { tramo: 'DE_8_A_30_DIAS', cantidad: 1, total: '40.00' },
            { tramo: 'MAS_DE_30_DIAS', cantidad: 1, total: '30.00' },
          ],
        }),
      },
    });
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Cuánto falta cobrar, y desde hace cuánto?' });

    const saldos = grafico('Falta cobrar según los días');
    const tramo = (nombre: RegExp) => within(saldos).getByRole('button', { name: nombre });
    expect(tramo(/^Hasta 7 días/).querySelector('rect')).toHaveClass('fill-antiguedad-1');
    expect(tramo(/^De 8 a 30 días/).querySelector('rect')).toHaveClass('fill-antiguedad-2');
    expect(tramo(/^Más de 30 días/).querySelector('rect')).toHaveClass('fill-antiguedad-3');
    // La cantidad y el monto, rotulados en cada barra; y la barra mide la plata, no las boletas.
    expect(within(tramo(/^De 8 a 30 días/)).getByText('1 boleta — Bs 40,00')).toBeInTheDocument();
    expect(tramo(/^De 8 a 30 días/).querySelector('[data-barra]')).toHaveAttribute('width', '100%');

    // La ropa, sin monto: un tramo en cero no tiene barra, pero sí su rótulo.
    const ropa = grafico('Ropa sin recoger según los días');
    expect(within(ropa).getByRole('button', { name: /^Hasta 7 días/ }).querySelector('rect')).toHaveClass('fill-antiguedad-1');
    const vacio = within(ropa).getByRole('button', { name: /^Más de 30 días/ });
    expect(vacio.querySelector('rect')).toBeNull();
    expect(within(vacio).getByText('0 boletas')).toBeInTheDocument();
  });

  it('la productividad va de quien más ropa recibió a quien menos, con el nombre y el número', async () => {
    const [centro, norte] = productividadDePrueba().porEmpleado;
    simularEstadisticas({ productividad: { status: 200, data: productividadDePrueba({ porEmpleado: [norte, centro] }) } });
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Cuánto atendió cada persona?' });

    const barras = within(grafico('Ropa recibida por cada persona')).getAllByRole('button');
    expect(barras.map((b) => b.querySelector('span > span')?.textContent)).toEqual(['Ana Flores (Centro)', 'Ana Flores (Norte)']);
    expect(within(barras[0] as HTMLElement).getByText('Recibió 12')).toBeInTheDocument();
    // La lista de abajo sigue en el orden en que llegó.
    const personas = within(seccion('Lo que hizo cada persona')).getByRole('list', { name: 'Personas' });
    expect(within(personas).getAllByRole('listitem')[0]).toHaveTextContent('Ana Flores — Norte');
  });

  it('nada se ve solo con el mouse: tocar o enfocar una barra escribe su detalle en palabras', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Cuánta ropa entró cada día?' });
    const porDia = grafico('Ropa recibida por día');
    expect(within(porDia).getByText('Toca un día para ver cuánta ropa entró.')).toBeInTheDocument();

    // Con el dedo.
    fireEvent.click(within(porDia).getByRole('button', { name: '15/10/2026: 4 boletas (1 anulada)' }));
    expect(within(porDia).getByText('15/10/2026: 4 boletas (1 anulada)', { selector: '[aria-live]' })).toBeInTheDocument();

    // Con el teclado: es un botón, se llega con Tab. `focus()` a mano va dentro de `act`, para que
    // React dibuje el detalle antes de mirarlo (fireEvent lo hace solo; un focus() suelto, no).
    const centro = within(grafico('Cobrado por sucursal y forma de pago')).getByRole('button', { name: /^Centro:/ });
    act(() => centro.focus());
    expect(centro).toHaveFocus();
    expect(
      within(grafico('Cobrado por sucursal y forma de pago')).getByText(
        'Centro: Bs 125,50 cobrado. Efectivo Bs 100,00, Pago con QR Bs 25,50.',
        { selector: '[aria-live]' },
      ),
    ).toBeInTheDocument();
    sinJerga();
  });

  it('cada gráfico tiene nombre, y su tabla con los mismos números para el lector de pantalla', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Cuánta ropa entró cada día?' });

    for (const nombre of [
      'Cobrado por sucursal y forma de pago',
      'Falta cobrar según los días',
      'Ropa sin recoger según los días',
      'Ropa recibida por día',
      'Ropa recibida por cada persona',
    ]) {
      const tabla = within(grafico(nombre)).getByRole('table', { name: nombre });
      // Oculta con un contenedor, no con la tabla misma: Chrome dibujaba el caption (SPEC-KRILINXI-036).
      expect(tabla.parentElement).toHaveClass('sr-only');
    }
    expect(fila(seccion('Ropa recibida'), 'Ropa recibida por día', '15/10/2026')).toEqual(['15/10/2026', '4 boletas (1 anulada)']);
    // Ana sale dos veces (una por sucursal): la fila se busca por su lugar, no por su nombre.
    const personas = within(within(grafico('Ropa recibida por cada persona')).getByRole('table')).getAllByRole('row');
    expect([...(personas[1]?.children ?? [])].map((c) => c.textContent)).toEqual(['Ana Flores', 'Centro', '12', '9 veces', 'Bs 340,50', '7']);
  });

  it('debajo de cada gráfico sigue el detalle de siempre', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: '¿Cuánto falta cobrar, y desde hace cuánto?' });

    const saldos = seccion('Falta cobrar');
    expect(grafico('Falta cobrar según los días').compareDocumentPosition(within(saldos).getByRole('list', { name: 'Boletas con saldo' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(seccion('Ropa sin recoger')).getByRole('list', { name: 'Boletas sin recoger' })).toHaveTextContent('Boleta 004321 — Juan Mamani');
  });

  it('un período sin datos lo dice en vez de dibujar un gráfico vacío', async () => {
    simularEstadisticas({ volumen: { status: 200, data: volumenDeDias(3, () => 0) } });
    await abrirPanel();
    const volumen = await screen.findByRole('region', { name: 'Ropa recibida' });

    expect(within(volumen).getByText('No hay datos en este período.')).toBeInTheDocument();
    expect(within(volumen).queryByRole('figure')).not.toBeInTheDocument();
  });

  it('sin internet no hay indicadores ni gráficos', async () => {
    simularEstadisticas('sin-conexion');
    await abrirPanel({ desplegar: false });

    expect(await screen.findByText('Las estadísticas necesitan conexión.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Resumen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });

  it('el tablero no tiene ningún estilo en línea', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('region', { name: 'Resumen' });
    expect(screen.getByRole('main').querySelector('[style]')).toBeNull();
  });
});

describe('El panel como dashboard — SPEC-KRILINXI-042', () => {
  /** Cada pregunta del tablero: su tarjeta, cómo se lee en voz alta y el gráfico que la contesta. */
  // Las tres de a la vista, en su orden, y las cinco que se despliegan con "Ver más estadísticas" (SPEC-KRILINXI-050).
  const A_LA_VISTA = [
    { region: 'Cobrado por día', pregunta: '¿Cómo vino la caja día a día?', grafico: 'Cobrado por día' },
    { region: 'Cobrado por forma de pago', pregunta: '¿Cuánto se cobró con cada forma de pago?', grafico: 'Cobrado con cada forma de pago' },
    { region: 'Falta cobrar', pregunta: '¿Cuánto falta cobrar, y desde hace cuánto?', grafico: 'Falta cobrar según los días' },
  ] as const;
  const PLEGADAS = [
    { region: 'Cobrado por sucursal', pregunta: '¿Cuánto se cobró en cada sucursal?', grafico: 'Cobrado por sucursal y forma de pago' },
    { region: 'Ropa recibida', pregunta: '¿Cuánta ropa entró cada día?', grafico: 'Ropa recibida por día' },
    { region: 'Ropa sin recoger', pregunta: '¿Cuánta ropa falta recoger, y desde hace cuánto?', grafico: 'Ropa sin recoger según los días' },
    { region: 'Lo que hizo cada persona', pregunta: '¿Cuánto atendió cada persona?', grafico: 'Ropa recibida por cada persona' },
    { region: 'Clientes atendidos', pregunta: '¿Quiénes son los clientes que más vienen?', grafico: 'Veces que vino cada cliente' },
  ] as const;
  const TARJETAS = [...A_LA_VISTA, ...PLEGADAS];

  it('debajo de los indicadores hay una grilla de tarjetas: una por fila en angosta y dos desde 1024px', async () => {
    simularEstadisticas();
    await abrirPanel();
    const primera = await screen.findByRole('region', { name: 'Cobrado por forma de pago' });

    const grilla = primera.parentElement as HTMLElement;
    // `lg:grid-cols-2` es desde 1024px; sin prefijo, una sola columna.
    expect(grilla).toHaveClass('grid', 'grid-cols-1', 'gap-6', 'lg:grid-cols-2');
    expect(grilla).not.toHaveClass('grid-cols-2');
    // Desde SPEC-KRILINXI-050 las de a la vista son tres, hijas de la misma grilla y después de los indicadores;
    // las otras cinco están en otra grilla igual, dentro de "Ver más estadísticas".
    expect([...grilla.children].map((c) => c.getAttribute('aria-label'))).toEqual(A_LA_VISTA.map((t) => t.region));
    expect(seccion('Resumen').compareDocumentPosition(grilla)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const plegadas = seccion('Cobrado por sucursal').parentElement as HTMLElement;
    expect(plegadas).toHaveClass('grid', 'grid-cols-1', 'gap-6', 'lg:grid-cols-2');
    expect([...plegadas.children].map((c) => c.getAttribute('aria-label'))).toEqual(PLEGADAS.map((t) => t.region));
  });

  it('lo que necesita ancho (la caja y la ropa de treinta días) ocupa la fila entera; las demás, una celda', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('region', { name: 'Cobrado por forma de pago' });

    const anchas = ['Ropa recibida', 'Cobrado por día'];
    for (const region of anchas) expect(seccion(region)).toHaveClass('lg:col-span-2');
    for (const { region } of TARJETAS.filter((t) => !anchas.includes(t.region))) {
      expect(seccion(region)).not.toHaveClass('lg:col-span-2');
    }
  });

  it.each(TARJETAS)('"$pregunta" tiene su título en palabras, su gráfico con nombre y su tabla para el lector de pantalla', async ({ region, pregunta, grafico }) => {
    simularEstadisticas();
    await abrirPanel();
    const tarjeta = await screen.findByRole('region', { name: region });

    expect(within(tarjeta).getByRole('heading', { name: pregunta, level: 2 })).toBeInTheDocument();
    const figura = await within(tarjeta).findByRole('figure', { name: grafico });
    const tabla = within(figura).getByRole('table', { name: grafico });
    expect(tabla.parentElement).toHaveClass('sr-only');
    sinJerga();
  });

  it('cada tarjeta dice qué período mira, debajo de su pregunta', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('region', { name: 'Cobrado por forma de pago' });

    expect(within(seccion('Cobrado por forma de pago')).getByText('De hoy')).toBeInTheDocument();
    expect(within(seccion('Falta cobrar')).getByText('Hasta hoy')).toBeInTheDocument();
    expect(within(seccion('Ropa recibida')).getByText('De los últimos 30 días')).toBeInTheDocument();
  });

  it('el gráfico de forma de pago suma lo de todas las sucursales, con el color de cada forma y las cuatro en su orden', async () => {
    simularEstadisticas({
      ingresos: {
        status: 200,
        data: ingresosDePrueba({
          total: '160.00',
          porSucursal: [
            ...ingresosDePrueba().porSucursal,
            {
              sucursalId: SUCURSAL_NORTE,
              sucursal: 'Norte',
              total: '34.50',
              porMetodo: { EFECTIVO: '10.00', QR: '0.00', TARJETA: '0.00', TRANSFERENCIA: '24.50' },
            },
          ],
        }),
      },
    });
    await abrirPanel();
    const tarjeta = await screen.findByRole('region', { name: 'Cobrado por forma de pago' });
    const figura = within(tarjeta).getByRole('figure', { name: 'Cobrado con cada forma de pago' });

    const barras = within(figura).getAllByRole('button');
    expect(barras.map((b) => b.querySelector('span > span')?.textContent)).toEqual(['Efectivo', 'Pago con QR', 'Tarjeta', 'Transferencia']);
    // Efectivo: 100 del Centro + 10 del Norte. QR: solo el Centro. Tarjeta, nada. Transferencia: solo el Norte.
    expect(within(figura).getByRole('button', { name: 'Efectivo: Bs 110,00 cobrado.' })).toBeInTheDocument();
    expect(within(figura).getByRole('button', { name: 'Pago con QR: Bs 25,50 cobrado.' })).toBeInTheDocument();
    expect(within(figura).getByRole('button', { name: 'Tarjeta: Bs 0,00 cobrado.' })).toBeInTheDocument();
    expect(within(figura).getByRole('button', { name: 'Transferencia: Bs 24,50 cobrado.' })).toBeInTheDocument();
    // El color sigue a la forma de pago, como en todo el panel; la que está en cero no tiene barra.
    expect(barras[0]?.querySelector('rect')).toHaveClass('fill-serie-1');
    expect(barras[1]?.querySelector('rect')).toHaveClass('fill-serie-2');
    expect(barras[2]?.querySelector('rect')).toBeNull();
    expect(barras[3]?.querySelector('rect')).toHaveClass('fill-serie-4');
    // La más larga llega a todo el ancho, y las demás se miden con su escala.
    expect(barras[0]?.querySelector('[data-barra]')).toHaveAttribute('width', '100%');
    expect(barras[1]?.querySelector('[data-barra]')).toHaveAttribute('width', '23.18%');
    // El total general, tal como lo manda el servidor; y la tabla para el lector de pantalla.
    expect(within(tarjeta).getByText('Bs 160,00')).toBeInTheDocument();
    expect(fila(tarjeta, 'Cobrado con cada forma de pago', 'Efectivo')).toEqual(['Efectivo', 'Bs 110,00']);
  });

  it('el detalle en listas va en "Ver el detalle", plegado por defecto, y se abre con un toque', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('region', { name: 'Cobrado por forma de pago' });

    for (const region of ['Falta cobrar', 'Ropa sin recoger', 'Lo que hizo cada persona', 'Clientes atendidos']) {
      const detalle = await detalleDe(seccion(region));
      expect(detalle).not.toHaveAttribute('open');
      expect(within(detalle).getByText('Ver el detalle')).toBeInTheDocument();
      // El gráfico queda a la vista, fuera del detalle plegado.
      expect(detalle.contains(within(seccion(region)).getByRole('figure'))).toBe(false);
    }

    const saldos = await detalleDe(seccion('Falta cobrar'));
    fireEvent.click(within(saldos).getByText('Ver el detalle'));
    expect(saldos).toHaveAttribute('open');
    expect(within(saldos).getByRole('list', { name: 'Boletas con saldo' })).toHaveTextContent('Boleta 001234 — Rosa Quispe');
  });

  it('las tarjetas que se leen enteras en su gráfico no tienen detalle que plegar', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('region', { name: 'Cobrado por forma de pago' });

    for (const region of ['Cobrado por forma de pago', 'Cobrado por sucursal', 'Ropa recibida']) {
      expect(within(seccion(region)).queryByText('Ver el detalle')).not.toBeInTheDocument();
    }
  });

  it('los clientes que más vienen son una barra por cliente con cuántas veces vino, y la barra de páginas va arriba del detalle', async () => {
    simularEstadisticas({ clientes: { status: 200, data: clientesDePrueba({ total: 45 }) } });
    await abrirPanel();
    const tarjeta = await screen.findByRole('region', { name: 'Clientes atendidos' });
    const figura = await within(tarjeta).findByRole('figure', { name: 'Veces que vino cada cliente' });

    const barra = within(figura).getByRole('button', { name: /^Rosa Quispe \(70123456\): Vino 3 veces · Pagó Bs 150,00/ });
    expect(within(barra).getByText('Vino 3 veces')).toBeInTheDocument();
    expect(barra.querySelector('rect')).toHaveClass('fill-serie-1');
    expect(fila(tarjeta, 'Veces que vino cada cliente', 'Rosa Quispe (70123456)')).toEqual([
      'Rosa Quispe (70123456)',
      '3 veces',
      'Bs 150,00',
      '15/10/2026 18:30',
    ]);
    // Pasar de página cambia también el gráfico, no solo la lista: por eso no está dentro del detalle.
    const paginas = within(tarjeta).getByRole('navigation', { name: 'Páginas de clientes' });
    expect(paginas.compareDocumentPosition(await detalleDe(tarjeta))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('sin clientes en el período, lo dice en palabras en vez de dibujar un gráfico vacío', async () => {
    simularEstadisticas({ clientes: { status: 200, data: clientesDePrueba({ clientes: [], total: 0 }) } });
    await abrirPanel();
    const tarjeta = await screen.findByRole('region', { name: 'Clientes atendidos' });

    expect(await within(tarjeta).findByText('No vino ningún cliente en este período.')).toBeInTheDocument();
    expect(within(tarjeta).queryByRole('figure')).not.toBeInTheDocument();
  });

  it('el filtro de arriba cambia todas las tarjetas a la vez', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('region', { name: 'Cobrado por forma de pago' });

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

    for (const { region } of TARJETAS) {
      expect(await within(await screen.findByRole('region', { name: region })).findByText('Del 01/10/2026 al 15/10/2026')).toBeInTheDocument();
    }
  });

  it('sin internet dice que las estadísticas necesitan conexión y no dibuja ninguna tarjeta', async () => {
    simularEstadisticas('sin-conexion');
    await abrirPanel({ desplegar: false });

    expect(await screen.findByText('Las estadísticas necesitan conexión.')).toBeInTheDocument();
    for (const { region } of TARJETAS) expect(screen.queryByRole('region', { name: region })).not.toBeInTheDocument();
  });
});

describe('La tendencia de lo cobrado — SPEC-KRILINXI-044', () => {
  const tarjeta = async () => screen.findByRole('region', { name: 'Cobrado por día' });
  const figura = async () => within(await tarjeta()).findByRole('figure', { name: 'Cobrado por día' });
  /** Las líneas de una serie (los segmentos) y sus puntos, tal como las dibuja el SVG. */
  const serie = (dibujo: HTMLElement, clave: string) => {
    const grupo = dibujo.querySelector(`[data-serie="${clave}"]`);
    return { lineas: [...(grupo?.querySelectorAll('line') ?? [])], puntos: [...(grupo?.querySelectorAll('circle') ?? [])] };
  };

  it('pide a la API lo cobrado día por día: los últimos 30 días si no se eligió nada', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel();
    await figura();

    const pedido = servidor.pedidos.find((p) => p.ruta === '/estadisticas/ingresos-por-dia');
    // No "hoy", que sería un solo punto: una tendencia necesita varios días.
    expect(pedido?.parametros).toEqual({ desde: '2026-09-17', hasta: HOY });
  });

  it('con fechas y sucursal elegidas pide esas, como el resto del panel', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel();
    await figura();

    fireEvent.click(await screen.findByRole('radio', { name: 'Centro' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

    await waitFor(() =>
      expect(servidor.pedidos.filter((p) => p.ruta === '/estadisticas/ingresos-por-dia').at(-1)?.parametros).toEqual({
        desde: '2026-10-01',
        hasta: '2026-10-15',
        sucursal_id: SUCURSAL_CENTRO,
      }),
    );
  });

  it('dibuja una línea con el total de cada día: un punto por día y un tramo entre cada par', async () => {
    simularEstadisticas();
    await abrirPanel();
    const dibujo = await figura();

    const { lineas, puntos } = serie(dibujo, 'total');
    expect(puntos).toHaveLength(3);
    expect(lineas).toHaveLength(2);
    // Cada día en el centro de su lugar: 1/6, 3/6 y 5/6 del ancho. El día más alto (Bs 125,50) llega arriba.
    expect(puntos.map((p) => p.getAttribute('cx'))).toEqual(['16.67%', '50%', '83.33%']);
    expect(puntos.map((p) => p.getAttribute('cy'))).toEqual(['73.86%', '18%', '100%']);
    expect(puntos[0]).toHaveClass('fill-serie-1');
    expect(lineas[0]).toHaveClass('stroke-serie-1');
  });

  it('un día sin cobros se dibuja en cero y la línea sigue hasta ahí, sin cortarse', async () => {
    simularEstadisticas();
    await abrirPanel();
    const { lineas, puntos } = serie(await figura(), 'total');

    // El 16/10 no cobró nada: su punto está sobre la línea de base, y el tramo que llega a él existe.
    expect(puntos[2]?.getAttribute('cy')).toBe('100%');
    expect(lineas[1]).toHaveAttribute('x2', '83.33%');
    expect(lineas[1]).toHaveAttribute('y2', '100%');
    // Y el tramo empieza donde terminó el anterior: sin saltos.
    expect(lineas[1]?.getAttribute('x1')).toBe(lineas[0]?.getAttribute('x2'));
    expect(lineas[1]?.getAttribute('y1')).toBe(lineas[0]?.getAttribute('y2'));
  });

  it('con treinta días dibuja treinta puntos, también los que están en cero, y el eje con unas pocas fechas', async () => {
    simularEstadisticas({ ingresosPorDia: { status: 200, data: ingresosPorDiaDeDias(30, (i) => (i % 3 === 0 ? 0 : i * 10)) } });
    await abrirPanel();
    const dibujo = await figura();

    expect(serie(dibujo, 'total').puntos).toHaveLength(30);
    expect(within(dibujo).getAllByRole('button')).toHaveLength(30);
    const eje = [...dibujo.querySelectorAll('[aria-hidden="true"] > span')].map((s) => s.textContent).filter(Boolean);
    expect(eje).toEqual(['17/09', '23/09', '29/09', '05/10', '11/10', '16/10']);
  });

  it('se puede ver también por forma de pago: una línea por cada una, con su color y la leyenda de siempre', async () => {
    simularEstadisticas();
    await abrirPanel();
    const dibujo = await figura();
    // En el total no hay leyenda: con una sola serie, el color no dice nada solo.
    expect(within(dibujo).queryByRole('list', { name: 'Formas de pago' })).not.toBeInTheDocument();

    fireEvent.click(within(await tarjeta()).getByRole('radio', { name: 'Por forma de pago' }));

    const formas = await within(await tarjeta()).findByRole('figure', { name: 'Cobrado por día' });
    expect(formas.querySelectorAll('[data-serie]')).toHaveLength(4);
    for (const [metodo, n] of [['EFECTIVO', 1], ['QR', 2], ['TARJETA', 3], ['TRANSFERENCIA', 4]] as const) {
      const { lineas, puntos } = serie(formas, metodo);
      expect(lineas[0]).toHaveClass(`stroke-serie-${n}`);
      expect(puntos[0]).toHaveClass(`fill-serie-${n}`);
      expect(puntos).toHaveLength(3);
    }
    const leyenda = within(formas).getByRole('list', { name: 'Formas de pago' });
    expect(within(leyenda).getAllByRole('listitem').map((m) => m.textContent)).toEqual(['Efectivo', 'Pago con QR', 'Tarjeta', 'Transferencia']);
    // El QR solo cobró el 15: su línea sube ese día y baja a cero los otros. Se mide contra el máximo de las formas (100).
    expect(serie(formas, 'QR').puntos.map((p) => p.getAttribute('cy'))).toEqual(['100%', '79.09%', '100%']);
    expect(serie(formas, 'EFECTIVO').puntos.map((p) => p.getAttribute('cy'))).toEqual(['67.2%', '18%', '100%']);
  });

  it('volver a "El total" deja una sola línea', async () => {
    simularEstadisticas();
    await abrirPanel();
    await figura();
    fireEvent.click(within(await tarjeta()).getByRole('radio', { name: 'Por forma de pago' }));
    fireEvent.click(within(await tarjeta()).getByRole('radio', { name: 'El total' }));

    expect((await figura()).querySelectorAll('[data-serie]')).toHaveLength(1);
  });

  it('nada se ve solo con el mouse: tocar o enfocar un día escribe su detalle en palabras', async () => {
    simularEstadisticas();
    await abrirPanel();
    const dibujo = await figura();
    expect(within(dibujo).getByText('Toca un día para ver cuánto se cobró y con qué.')).toBeInTheDocument();

    // Con el dedo.
    fireEvent.click(within(dibujo).getByRole('button', { name: '15/10/2026: Bs 125,50. Efectivo Bs 100,00, Pago con QR Bs 25,50.' }));
    expect(within(dibujo).getByText('15/10/2026: Bs 125,50. Efectivo Bs 100,00, Pago con QR Bs 25,50.', { selector: '[aria-live]' })).toBeInTheDocument();

    // Con el teclado: es un botón, se llega con Tab. Un día sin cobros también se puede leer.
    const vacio = within(dibujo).getByRole('button', { name: '16/10/2026: Bs 0,00.' });
    act(() => vacio.focus());
    expect(vacio).toHaveFocus();
    expect(within(dibujo).getByText('16/10/2026: Bs 0,00.', { selector: '[aria-live]' })).toBeInTheDocument();
    sinJerga();
  });

  it('tiene nombre accesible y su tabla con los mismos números para el lector de pantalla', async () => {
    simularEstadisticas();
    await abrirPanel();
    const dibujo = await figura();

    const tabla = within(dibujo).getByRole('table', { name: 'Cobrado por día' });
    expect(tabla.parentElement).toHaveClass('sr-only');
    expect(fila(await tarjeta(), 'Cobrado por día', '15/10/2026')).toEqual(['15/10/2026', 'Bs 125,50', 'Bs 100,00', 'Bs 25,50', 'Bs 0,00', 'Bs 0,00']);
    // El día sin cobros también está en la tabla, en cero.
    expect(fila(await tarjeta(), 'Cobrado por día', '16/10/2026')).toEqual(['16/10/2026', 'Bs 0,00', 'Bs 0,00', 'Bs 0,00', 'Bs 0,00', 'Bs 0,00']);
  });

  it('el total de arriba es el que manda el servidor: el panel no suma los días', async () => {
    // A propósito, no es la suma de los días: si el panel sumara, se notaría.
    simularEstadisticas({ ingresosPorDia: { status: 200, data: ingresosPorDiaDePrueba({ total: '999.99' }) } });
    await abrirPanel();
    await figura();

    expect(within(await tarjeta()).getByText('Bs 999,99')).toBeInTheDocument();
  });

  it('sin ningún cobro en el período lo dice en palabras en vez de dibujar un gráfico vacío', async () => {
    const dias = ingresosPorDiaDeDias(3, () => 0);
    simularEstadisticas({ ingresosPorDia: { status: 200, data: dias } });
    await abrirPanel();
    const t = await tarjeta();

    expect(await within(t).findByText('No hay datos en este período.')).toBeInTheDocument();
    expect(within(t).queryByRole('figure')).not.toBeInTheDocument();
  });

  it('si la respuesta no encaja con su contrato, lo dice y se puede probar de nuevo, sin romper el resto del panel', async () => {
    simularEstadisticas({ ingresosPorDia: { status: 200, data: { desde: '2026-10-14', hasta: '2026-10-16', total: 'mucho', porDia: [] } } });
    await abrirPanel();
    const t = await tarjeta();

    expect(await within(t).findByText(/llegaron incompletas/)).toBeInTheDocument();
    expect(within(t).getByRole('button', { name: 'Probar de nuevo' })).toBeInTheDocument();
    // Las demás tarjetas siguen ahí.
    expect(screen.getByRole('region', { name: 'Cobrado por forma de pago' })).toBeInTheDocument();
    sinJerga();
  });

  it('si se corta internet al pedirla, la tarjeta dice que las estadísticas necesitan conexión', async () => {
    simularEstadisticas({ ingresosPorDia: 'sin-conexion' });
    await abrirPanel();

    expect(await within(await tarjeta()).findByText('Las estadísticas necesitan conexión.')).toBeInTheDocument();
  });

  it('el gráfico no tiene estilos en línea', async () => {
    simularEstadisticas();
    await abrirPanel();

    expect((await figura()).querySelector('[style]')).toBeNull();
  });
});

describe('Las tarjetas no se pisan en una pantalla media — SPEC-KRILINXI-044', () => {
  // jsdom no mide anchos: no puede ver una tarjeta que se sale de su columna. Lo que sí ve son las clases que lo
  // evitan. Una tarjeta es una columna que puede ENCOGERSE (`min-w-0`, `grid-cols-1`): sin eso, su contenido
  // (la barra de páginas, un gráfico) la ensancha y pisa a la vecina cuando la grilla de dos columnas queda angosta.
  it('cada tarjeta es una columna que puede encogerse, para que su contenido no la ensanche', async () => {
    simularEstadisticas();
    await abrirPanel();
    const regiones = ['Cobrado por forma de pago', 'Cobrado por sucursal', 'Cobrado por día', 'Ropa recibida', 'Falta cobrar', 'Ropa sin recoger', 'Lo que hizo cada persona', 'Clientes atendidos'];
    await screen.findByRole('region', { name: 'Cobrado por forma de pago' });

    for (const region of regiones) {
      expect(seccion(region)).toHaveClass('grid', 'min-w-0', 'grid-cols-1');
    }
  });

  it('la barra de páginas de una tarjeta se acomoda en renglones en vez de salirse', async () => {
    simularEstadisticas({ clientes: { status: 200, data: clientesDePrueba({ total: 45 }) } });
    await abrirPanel();
    const paginas = await within(await screen.findByRole('region', { name: 'Clientes atendidos' })).findByRole('navigation', { name: 'Páginas de clientes' });

    expect(paginas).toHaveClass('flex', 'flex-wrap');
    // Con tres columnas `1fr auto 1fr` cada `1fr` no baja del ancho de su botón: era lo que la sacaba de la tarjeta.
    expect(paginas.className).not.toMatch(/grid-cols-\[/);
  });
});

describe('El tablero con una pregunta principal y el resto a pedido — SPEC-KRILINXI-050', () => {
  const PLEGADAS_ = ['Cobrado por sucursal', 'Ropa recibida', 'Ropa sin recoger', 'Lo que hizo cada persona', 'Clientes atendidos'];
  const A_LA_VISTA_ = ['Cobrado por día', 'Cobrado por forma de pago', 'Falta cobrar'];

  it('de entrada se ven los cuatro indicadores y tres tarjetas, con la caja día a día primero; las otras cinco, plegadas', async () => {
    simularEstadisticas();
    await abrirPanel({ desplegar: false });
    await screen.findByText('Ver más estadísticas');

    expect(within(seccion('Resumen')).getAllByRole('definition').length).toBeGreaterThanOrEqual(4);
    const grilla = seccion('Cobrado por día').parentElement as HTMLElement;
    expect([...grilla.children].map((c) => c.getAttribute('aria-label'))).toEqual(A_LA_VISTA_);
    for (const region of PLEGADAS_) expect(screen.queryByRole('region', { name: region })).not.toBeInTheDocument();
    expect(screen.getByText('Ver más estadísticas').closest('details')).not.toHaveAttribute('open');
  });

  it('"Ver más estadísticas" despliega las otras cinco con lo de siempre, y se vuelve a plegar', async () => {
    simularEstadisticas();
    await abrirPanel({ desplegar: false });
    await desplegarMas();
    for (const region of PLEGADAS_) expect(await screen.findByRole('region', { name: region })).toBeInTheDocument();
    expect(fila(seccion('Cobrado por sucursal'), 'Cobrado por sucursal y forma de pago', 'Centro')[5]).toBe('Bs 125,50');

    fireEvent.click(screen.getByText('Ver más estadísticas'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Cobrado por sucursal' })).not.toBeInTheDocument());
    // Las de a la vista no se mueven.
    for (const region of A_LA_VISTA_) expect(seccion(region)).toBeInTheDocument();
  });

  it('plegar y desplegar no pierde el filtro elegido', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel({ desplegar: false });
    await desplegarMas();
    fireEvent.click(await screen.findByRole('radio', { name: 'Centro' }));
    await waitFor(() => expect(servidor.pedidos.some((p) => (p.parametros as { sucursal_id?: string })?.sucursal_id === SUCURSAL_CENTRO)).toBe(true));

    fireEvent.click(screen.getByText('Ver más estadísticas'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Clientes atendidos' })).not.toBeInTheDocument());
    await desplegarMas();

    expect(screen.getByRole('radio', { name: 'Centro' })).toBeChecked();
    expect(await screen.findByRole('region', { name: 'Clientes atendidos' })).toBeInTheDocument();
  });

  it('la productividad y los clientes no se piden hasta que se despliega; lo que alimenta los indicadores sí', async () => {
    const servidor = simularEstadisticas();
    await abrirPanel({ desplegar: false });
    await screen.findByText('Ver más estadísticas');
    const rutas = () => servidor.pedidos.map((p) => p.ruta);

    for (const ruta of ['/estadisticas/ingresos', '/estadisticas/saldos', '/estadisticas/sin-recoger', '/estadisticas/volumen', '/estadisticas/ingresos-por-dia']) {
      expect(rutas()).toContain(ruta);
    }
    expect(rutas()).not.toContain('/estadisticas/productividad');
    expect(rutas()).not.toContain('/estadisticas/clientes');

    await desplegarMas();
    await screen.findByRole('region', { name: 'Lo que hizo cada persona' });
    await waitFor(() => {
      expect(rutas()).toContain('/estadisticas/productividad');
      expect(rutas()).toContain('/estadisticas/clientes');
    });
    // Con los mismos últimos 30 días que el volumen.
    const de = (ruta: string) => servidor.pedidos.find((p) => p.ruta === ruta)?.parametros;
    expect(de('/estadisticas/productividad')).toEqual(de('/estadisticas/volumen'));
  });

  it('mientras llega el panel hay un esqueleto, y ningún número', async () => {
    simularEstadisticas();
    await abrirPanel({ desplegar: false });
    const carga = await screen.findByText('Buscando las estadísticas…');

    // Se mira el esqueleto en sí (puede que el panel ya haya llegado cuando corre la comprobación): es un estado, y
    // lo único que dice es que está buscando, sin ningún monto ni cantidad.
    const estado = carga.closest('[role="status"]');
    expect(estado).not.toBeNull();
    expect(estado?.textContent).toBe('Buscando las estadísticas…');
  });

  it('si una tarjeta que pide su propio dato falla, lo dice ahí, con "Probar de nuevo", y el resto sigue a la vista', async () => {
    simularEstadisticas({ productividad: 'sin-conexion' });
    await abrirPanel({ desplegar: false });
    await desplegarMas();

    const persona = await screen.findByRole('region', { name: 'Lo que hizo cada persona' });
    expect(await within(persona).findByText('Las estadísticas necesitan conexión.')).toBeInTheDocument();
    expect(within(persona).getByRole('button', { name: 'Probar de nuevo' })).toBeInTheDocument();
    // Las demás, con sus números.
    expect(within(seccion('Clientes atendidos')).queryByText('Las estadísticas necesitan conexión.')).not.toBeInTheDocument();
    expect(within(seccion('Falta cobrar')).getAllByText(/Bs 30,00/).length).toBeGreaterThan(0);
    expect(within(seccion('Cobrado por día')).queryByText('Las estadísticas necesitan conexión.')).not.toBeInTheDocument();
  });

  it('sin internet, el tablero dice "Las estadísticas necesitan conexión" una sola vez y no muestra ninguna tarjeta', async () => {
    simularEstadisticas('sin-conexion');
    await abrirPanel({ desplegar: false });

    expect(await screen.findAllByText('Las estadísticas necesitan conexión.')).toHaveLength(1);
    expect(screen.queryByText('Ver más estadísticas')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cobrado por día' })).not.toBeInTheDocument();
  });

  it('el esqueleto de una tarjeta tiene un alto fijo y se anuncia como estado, sin dibujar nada', () => {
    render(<Esqueleto texto="Buscando algo…" />);
    const estado = screen.getByRole('status');

    expect(within(estado).getByText('Buscando algo…')).toHaveClass('sr-only');
    expect(estado.querySelector('[aria-hidden="true"]')).toHaveClass('h-64');
  });
});
