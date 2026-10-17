import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { cuerpoError } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import {
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

    expect(Object.fromEntries(servidor.pedidos.map((p) => [p.ruta, p.parametros]))).toEqual({
      '/estadisticas/ingresos': { desde: HOY, hasta: HOY },
      '/estadisticas/saldos': { desde: DESDE_SIEMPRE, hasta: HOY },
      '/estadisticas/sin-recoger': { desde: DESDE_SIEMPRE, hasta: HOY },
    });
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
    const ultimos = servidor.pedidos.slice(-3).map((p) => p.parametros);
    expect(ultimos).toEqual(Array(3).fill({ desde: '2026-10-01', hasta: '2026-10-15', sucursal_id: SUCURSAL_CENTRO }));
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
