import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { cuerpoError } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import {
  clientesDePrueba,
  ingresosDePrueba,
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
    await screen.findByRole('heading', { name: 'Falta cobrar hasta hoy' });

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
    await screen.findByRole('heading', { name: 'Cobrado de hoy' });
    expect(within(seccion('Cobrado')).getByText('No hay datos en este período.')).toBeInTheDocument();
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
  // Desde SPEC-KRILINXI-026 las barras son columnas de un SVG: el alto va en un atributo, no en un
  // `style` ni en una clase.
  it('el alto va en un atributo del SVG: la del día con más ropa es la más alta, y un día sin ropa no tiene columna', async () => {
    simularEstadisticas();
    await abrirPanel();
    const volumen = await screen.findByRole('region', { name: 'Ropa recibida' });
    const columna = (nombre: string) => within(volumen).getByRole('button', { name: nombre }).querySelector('rect');

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
    await screen.findByRole('heading', { name: 'Cobrado de hoy' });
    const cobrado = grafico('Cobrado por sucursal y forma de pago');

    // La leyenda, con los cuatro métodos en su orden fijo.
    const leyenda = within(cobrado).getByRole('list', { name: 'Formas de pago' });
    expect(within(leyenda).getAllByRole('listitem').map((m) => m.textContent)).toEqual(['Efectivo', 'Pago con QR', 'Tarjeta', 'Transferencia']);

    // Centro: efectivo y QR. La tarjeta, en cero, no ocupa lugar ni se rotula.
    const centro = within(cobrado).getByRole('button', { name: /^Centro:/ });
    expect([...centro.querySelectorAll('rect')].map((r) => r.getAttribute('class'))).toEqual([
      'fill-serie-1 stroke-superficie',
      'fill-serie-2 stroke-superficie',
    ]);
    expect(within(centro).getByText('Efectivo Bs 100,00')).toBeInTheDocument();
    expect(within(centro).getByText('Pago con QR Bs 25,50')).toBeInTheDocument();
    expect(within(centro).queryByText(/Tarjeta/)).not.toBeInTheDocument();

    // El color sigue al método, no a su lugar: la transferencia del Norte es la serie 4 aunque vaya sola.
    const norte = within(cobrado).getByRole('button', { name: /^Norte:/ });
    expect(norte.querySelector('rect')).toHaveClass('fill-serie-4');
    // La barra más larga llega al tope (72 %), y las demás se miden con la misma escala.
    expect(centro.querySelector('rect')).toHaveAttribute('width', '57.37%');
    expect(norte.querySelector('rect')).toHaveAttribute('width', '14.06%');
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
    await screen.findByRole('heading', { name: 'Falta cobrar hasta hoy' });

    const saldos = grafico('Falta cobrar según los días');
    const tramo = (nombre: RegExp) => within(saldos).getByRole('button', { name: nombre });
    expect(tramo(/^Hasta 7 días/).querySelector('rect')).toHaveClass('fill-antiguedad-1');
    expect(tramo(/^De 8 a 30 días/).querySelector('rect')).toHaveClass('fill-antiguedad-2');
    expect(tramo(/^Más de 30 días/).querySelector('rect')).toHaveClass('fill-antiguedad-3');
    // La cantidad y el monto, en la punta de cada barra; y la barra mide la plata, no las boletas.
    expect(within(tramo(/^De 8 a 30 días/)).getByText('1 boleta — Bs 40,00')).toBeInTheDocument();
    expect(tramo(/^De 8 a 30 días/).querySelector('rect')).toHaveAttribute('width', '72%');

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
    await screen.findByRole('heading', { name: 'Lo que hizo cada persona de los últimos 30 días' });

    const barras = within(grafico('Ropa recibida por cada persona')).getAllByRole('button');
    expect(barras.map((b) => b.querySelector('span')?.textContent)).toEqual(['Ana Flores (Centro)', 'Ana Flores (Norte)']);
    expect(within(barras[0] as HTMLElement).getByText('Recibió 12')).toBeInTheDocument();
    // La lista de abajo sigue en el orden en que llegó.
    const personas = within(seccion('Lo que hizo cada persona')).getByRole('list', { name: 'Personas' });
    expect(within(personas).getAllByRole('listitem')[0]).toHaveTextContent('Ana Flores — Norte');
  });

  it('nada se ve solo con el mouse: tocar o enfocar una barra escribe su detalle en palabras', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Ropa recibida de los últimos 30 días' });
    const porDia = grafico('Ropa recibida por día');
    expect(within(porDia).getByText('Tocá un día para ver cuánta ropa entró.')).toBeInTheDocument();

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
    await screen.findByRole('heading', { name: 'Ropa recibida de los últimos 30 días' });

    for (const nombre of [
      'Cobrado por sucursal y forma de pago',
      'Falta cobrar según los días',
      'Ropa sin recoger según los días',
      'Ropa recibida por día',
      'Ropa recibida por cada persona',
    ]) {
      const tabla = within(grafico(nombre)).getByRole('table', { name: nombre });
      expect(tabla).toHaveClass('sr-only');
    }
    expect(fila(seccion('Ropa recibida'), 'Ropa recibida por día', '15/10/2026')).toEqual(['15/10/2026', '4 boletas (1 anulada)']);
    // Ana sale dos veces (una por sucursal): la fila se busca por su lugar, no por su nombre.
    const personas = within(within(grafico('Ropa recibida por cada persona')).getByRole('table')).getAllByRole('row');
    expect([...(personas[1]?.children ?? [])].map((c) => c.textContent)).toEqual(['Ana Flores', 'Centro', '12', '9 veces', 'Bs 340,50', '7']);
  });

  it('debajo de cada gráfico sigue el detalle de siempre', async () => {
    simularEstadisticas();
    await abrirPanel();
    await screen.findByRole('heading', { name: 'Falta cobrar hasta hoy' });

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
    await abrirPanel();

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
