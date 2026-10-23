import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { escribirEnBuscador } from '../../../test/buscador';
import { clienteDePrueba, ordenDePrueba, pagoDePrueba } from '../../../test/filasDePrueba';
import { sinJerga } from '../../../test/jerga';
import { conAnchoDePantalla } from '../../../test/pantalla';
import { renderEnRuta } from '../../../test/render';
import { listarRecientes } from '../api/clientesLocal';

/**
 * Clientes sin buscar y las boletas de un cliente — SPEC-KRILINXI-061. La App entera, con la base local de
 * verdad y el servidor "sin internet": lo que se prueba va de la pantalla al SQL, y que no se le pida nada a la API.
 */
const ALTA = (dia: string) => `${dia}T12:00:00.000Z`;

// Cinco clientes con las fechas mezcladas a propósito: una boleta en formato de la tablet (ISO con Z) y otra en el
// formato del servidor (sin zona), dos clientes sin boletas, y uno con boleta vieja pero alta reciente.
const ANA = clienteDePrueba({ nombre: 'Ana Reciente', telefono: '70000001', fecha_registro: ALTA('2026-01-01') });
const BETO = clienteDePrueba({ nombre: 'Beto Medio', telefono: '70000002', fecha_registro: ALTA('2026-01-02') });
const CARLA = clienteDePrueba({ nombre: 'Carla Lejos', telefono: '70000003', fecha_registro: ALTA('2026-01-03') });
const DARIO = clienteDePrueba({ nombre: 'Darío Sin Boleta', telefono: '70000004', fecha_registro: ALTA('2026-09-01') });
const ELSA = clienteDePrueba({ nombre: 'Elsa Sin Boleta', telefono: '70000005', fecha_registro: ALTA('2026-10-01') });

const BOLETAS = [
  ordenDePrueba({ cliente_id: ANA.id, numero_boleta: '000001', fecha_entrada: '2026-10-15T14:00:00.000Z' }),
  ordenDePrueba({ cliente_id: BETO.id, numero_boleta: '000002', fecha_entrada: '2026-10-10T14:00:00.000Z' }),
  // Del servidor: sin zona. El 12 va entre las otras dos aunque "T" ordene distinto que " " como texto.
  ordenDePrueba({ cliente_id: CARLA.id, numero_boleta: '000003', fecha_entrada: '2026-10-12 14:00:00' }),
  // Una boleta más vieja de Ana: la que cuenta es la última.
  ordenDePrueba({ cliente_id: ANA.id, numero_boleta: '000004', fecha_entrada: '2026-02-01T14:00:00.000Z' }),
];

describe('Clientes por su última boleta (la consulta) — SPEC-KRILINXI-061', () => {
  it('va de la boleta más reciente a la más vieja, y los que no tienen ninguna al final, por su alta', async () => {
    const { control, sembrar } = await baseLocalDePrueba();
    await sembrar('clientes', [DARIO, BETO, ELSA, ANA, CARLA]);
    await sembrar('ordenes', BOLETAS);

    const clientes = await listarRecientes(control.base);

    expect(clientes.map((c) => c.nombre)).toEqual([
      'Ana Reciente',
      'Carla Lejos',
      'Beto Medio',
      'Elsa Sin Boleta',
      'Darío Sin Boleta',
    ]);
  });

  it('el orden es estable: con la misma fecha, desempata por nombre y después por id', async () => {
    const { control, sembrar } = await baseLocalDePrueba();
    const mismaFecha = '2026-10-01T10:00:00.000Z';
    const uno = clienteDePrueba({ nombre: 'Zoila', telefono: '70000011', fecha_registro: ALTA('2026-01-01') });
    const otro = clienteDePrueba({ nombre: 'Abel', telefono: '70000012', fecha_registro: ALTA('2026-01-01') });
    await sembrar('clientes', [uno, otro]);
    await sembrar('ordenes', [
      ordenDePrueba({ cliente_id: uno.id, numero_boleta: '000021', fecha_entrada: mismaFecha }),
      ordenDePrueba({ cliente_id: otro.id, numero_boleta: '000022', fecha_entrada: mismaFecha }),
    ]);

    const primera = (await listarRecientes(control.base)).map((c) => c.nombre);
    const segunda = (await listarRecientes(control.base)).map((c) => c.nombre);

    expect(primera).toEqual(['Abel', 'Zoila']);
    expect(segunda).toEqual(primera);
  });

  it('un cliente con varias boletas aparece una sola vez', async () => {
    const { control, sembrar } = await baseLocalDePrueba();
    await sembrar('clientes', [ANA]);
    await sembrar('ordenes', BOLETAS.filter((b) => b.cliente_id === ANA.id));

    expect(await listarRecientes(control.base)).toHaveLength(1);
  });
});

async function abrirClientes(ruta = '/clientes', clientes = [ANA, BETO, CARLA, DARIO, ELSA]) {
  const servidor = simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', clientes);
  await prueba.sembrar('ordenes', BOLETAS);
  await prueba.sembrar('pagos', [pagoDePrueba({ orden_id: BOLETAS[0]?.id, monto: '20.00' })]);
  renderEnRuta(<App />, ruta, { baseLocal: prueba.control });
  return { ...prueba, servidor };
}

const recientes = async () => within(await screen.findByRole('region', { name: 'Últimos clientes' }));
const nombres = async () => (await recientes()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('Clientes: los últimos atendidos, sin buscar — SPEC-KRILINXI-061', () => {
  it('sin escribir nada, lista los clientes por su última boleta y sin pedirle nada a la API', async () => {
    const { servidor } = await abrirClientes();

    await (await recientes()).findByRole('heading', { name: 'Ana Reciente' });
    expect(await nombres()).toEqual(['Ana Reciente', 'Carla Lejos', 'Beto Medio', 'Elsa Sin Boleta', 'Darío Sin Boleta']);
    expect(servidor.pedidos).toEqual([]);
    sinJerga();
  });

  it('pasa de a 20: con más clientes, páginas, y la segunda sigue el orden', async () => {
    const muchos = Array.from({ length: 25 }, (_, i) =>
      clienteDePrueba({
        nombre: `Cliente ${String(i + 1).padStart(2, '0')}`,
        telefono: `7100${String(i + 1).padStart(4, '0')}`,
        // Sin boletas: el más nuevo de alta va primero, o sea el 25.
        fecha_registro: ALTA(`2026-09-${String(i + 1).padStart(2, '0')}`),
      }),
    );
    await abrirClientes('/clientes', muchos);

    await (await recientes()).findByRole('heading', { name: 'Cliente 25' });
    expect(await nombres()).toHaveLength(20);
    expect((await nombres())[0]).toBe('Cliente 25');
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Siguientes' }));

    await (await recientes()).findByRole('heading', { name: 'Cliente 05' });
    expect(await nombres()).toEqual(['Cliente 05', 'Cliente 04', 'Cliente 03', 'Cliente 02', 'Cliente 01']);
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });

  it('en una pantalla angosta caben menos por página', async () => {
    conAnchoDePantalla(500);
    const muchos = Array.from({ length: 7 }, (_, i) =>
      clienteDePrueba({ nombre: `Cliente ${i + 1}`, telefono: `7200000${i + 1}`, fecha_registro: ALTA(`2026-09-0${i + 1}`) }),
    );
    await abrirClientes('/clientes', muchos);

    await (await recientes()).findByRole('heading', { name: 'Cliente 7' });
    expect(await nombres()).toHaveLength(6);
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
  });

  it('sin ningún cliente lo dice en palabras', async () => {
    await abrirClientes('/clientes', []);

    expect(await screen.findByText(/Todavía no hay clientes/)).toBeInTheDocument();
  });

  it('al escribir en el buscador, sus resultados reemplazan la lista; al vaciarlo, vuelve', async () => {
    await abrirClientes();
    await (await recientes()).findByRole('heading', { name: 'Ana Reciente' });

    const campo = await escribirEnBuscador('carla');
    await screen.findByRole('option', { name: /Carla Lejos/ });
    expect(screen.queryByRole('region', { name: 'Últimos clientes' })).not.toBeInTheDocument();

    fireEvent.change(campo, { target: { value: '' } });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Últimos clientes' })).toBeInTheDocument());
  });

  it('"Ver datos" abre la tarjeta del cliente, y se puede volver a la lista', async () => {
    await abrirClientes();
    const tarjeta = (await (await recientes()).findByRole('heading', { name: 'Beto Medio' })).closest('section') as HTMLElement;

    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Ver datos' }));

    expect(await screen.findByRole('button', { name: 'Cambiar datos' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Últimos clientes' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Volver a la lista de clientes' }));

    expect(await screen.findByRole('region', { name: 'Últimos clientes' })).toBeInTheDocument();
  });

  it('cada cliente tiene su enlace "Ver sus boletas", que lleva a las suyas', async () => {
    await abrirClientes();
    const tarjeta = (await (await recientes()).findByRole('heading', { name: 'Ana Reciente' })).closest('section') as HTMLElement;

    fireEvent.click(within(tarjeta).getByRole('link', { name: 'Ver sus boletas' }));

    expect(await screen.findByRole('heading', { name: 'Boletas de Ana Reciente' })).toBeInTheDocument();
  });
});

describe('Las boletas de un cliente — SPEC-KRILINXI-061', () => {
  it('muestra todas las suyas, la más nueva primero, con su estado, su saldo y su fecha, y lleva al Mostrador', async () => {
    const { servidor } = await abrirClientes();
    const tarjeta = (await (await recientes()).findByRole('heading', { name: 'Ana Reciente' })).closest('section') as HTMLElement;
    fireEvent.click(within(tarjeta).getByRole('link', { name: 'Ver sus boletas' }));

    const region = within(await screen.findByRole('region', { name: 'Las boletas' }));
    const enlaces = region.getAllByRole('link');
    expect(enlaces.map((e) => e.getAttribute('aria-label'))).toEqual([
      'Boleta 000001, Ana Reciente',
      'Boleta 000004, Ana Reciente',
    ]);
    expect(enlaces[0]).toHaveTextContent('Recibido');
    expect(enlaces[0]).toHaveTextContent('Falta pagar Bs 30,00');
    expect(enlaces[0]).toHaveTextContent('Entró el 15/10/2026');
    expect(enlaces[0]).toHaveAttribute('href', expect.stringMatching(/^\/mostrador\?boleta=.+&cliente=.+$/));
    expect(screen.getByText('Página 1 de 1')).toBeInTheDocument();
    expect(servidor.pedidos).toEqual([]);
    sinJerga();
  });

  it('no mezcla las boletas de otra sucursal', async () => {
    simularApi(() => 'sin-conexion');
    const prueba = await baseLocalDePrueba();
    await prueba.sembrar('clientes', [ANA]);
    await prueba.sembrar('ordenes', [
      ordenDePrueba({ cliente_id: ANA.id, numero_boleta: '000201' }),
      ordenDePrueba({ cliente_id: ANA.id, numero_boleta: '000202', sucursal_id: '00000000-0000-4000-8000-0000000000ff' }),
    ]);
    renderEnRuta(<App />, `/clientes/boletas?cliente=${ANA.id}`, { baseLocal: prueba.control });

    const region = within(await screen.findByRole('region', { name: 'Las boletas' }));
    expect(region.getAllByRole('link').map((e) => e.getAttribute('aria-label'))).toEqual(['Boleta 000201, Ana Reciente']);
  });

  it('pagina: en pantalla angosta, de a 6', async () => {
    conAnchoDePantalla(500);
    const servidor = simularApi(() => 'sin-conexion');
    const prueba = await baseLocalDePrueba();
    await prueba.sembrar('clientes', [ANA]);
    await prueba.sembrar(
      'ordenes',
      Array.from({ length: 7 }, (_, i) =>
        ordenDePrueba({ cliente_id: ANA.id, numero_boleta: `00010${i}`, fecha_entrada: `2026-10-0${i + 1}T14:00:00.000Z` }),
      ),
    );
    renderEnRuta(<App />, `/clientes/boletas?cliente=${ANA.id}`, { baseLocal: prueba.control });

    const region = within(await screen.findByRole('region', { name: 'Las boletas' }));
    expect(region.getAllByRole('link')).toHaveLength(6);
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(servidor.pedidos).toEqual([]);
  });

  it('un cliente sin boletas en esta sucursal lo dice en palabras', async () => {
    await abrirClientes(`/clientes/boletas?cliente=${DARIO.id}`);

    expect(await screen.findByText('Este cliente todavía no dejó ropa en esta sucursal.')).toBeInTheDocument();
  });

  it('un cliente que no existe lo dice, en vez de una lista vacía', async () => {
    await abrirClientes('/clientes/boletas?cliente=no-existe');

    expect(await screen.findByText(/No encontramos a ese cliente/)).toBeInTheDocument();
  });
});
