import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from './App';
import { simularApi } from './test/apiFalsa';
import { paginaDePrueba } from './test/auditoriaDePrueba';
import { baseLocalDePrueba } from './test/baseLocalDePrueba';
import { saldosDePrueba, simularEstadisticas, SUCURSAL_CENTRO } from './test/estadisticasDePrueba';
import { clienteDePrueba, ordenDePrueba } from './test/filasDePrueba';
import { boletaDePrueba, paginaDeBoletas } from './test/historialDePrueba';
import { cambiarAnchoDePantalla, conAnchoDePantalla } from './test/pantalla';
import { subirRechazando } from './test/rechazos';
import { tabletConRelojCorrido } from './test/reloj';
import { renderEnRuta } from './test/render';
import { sesionDePrueba } from './test/sesion';

/**
 * Ninguna lista larga se muestra de golpe — SPEC-KRILINXI-041. Cada pantalla con una lista que puede
 * crecer parte lo que muestra en páginas del tamaño que pide el ancho del dispositivo (6 en angosta,
 * 10 en mediana, 20 en ancha). Para no sembrar 21 filas por pantalla, los tests usan una pantalla
 * angosta (500px) y 7: seis en la primera página y una en la segunda.
 */
const ADMIN = sesionDePrueba({ rol: 'ADMIN' });
const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });

const boleta = (i: number) => String(i).padStart(6, '0');

/** `n` boletas de Rosa, una por día (la 1 es la más vieja). */
const ordenesDeRosa = (n: number, cambios: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) =>
    ordenDePrueba({
      cliente_id: ROSA.id,
      numero_boleta: boleta(i + 1),
      fecha_entrada: `2026-10-${String(1 + i).padStart(2, '0')}T12:00:00.000Z`,
      ...cambios,
    }),
  );

const barra = (nombre: string) => screen.queryByRole('navigation', { name: nombre });
const siguientes = (nombre: string) => fireEvent.click(within(screen.getByRole('navigation', { name: nombre })).getByRole('button', { name: 'Siguientes' }));
const enLaPantalla = () => within(screen.getByRole('main'));

/** Las boletas de Rosa que están en pantalla, como botones (la lista del Mostrador y la ficha). */
const botonesDeBoletas = () => screen.queryAllByRole('button', { name: /^Boleta \d+, Rosa Quispe$/ });

async function abrirMostrador(ruta: string, n: number) {
  tabletConRelojCorrido(0);
  simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  await prueba.sembrar('ordenes', ordenesDeRosa(n));
  renderEnRuta(<App />, ruta, { baseLocal: prueba.control });
  await screen.findAllByRole('button', { name: /^Boleta \d+, Rosa Quispe$/ });
}

describe('La ropa en el local se pagina — SPEC-KRILINXI-041', () => {
  it('en una pantalla angosta muestra seis, dice en qué página va y deja pasar a la siguiente', async () => {
    conAnchoDePantalla(500);
    await abrirMostrador('/mostrador', 7);

    expect(botonesDeBoletas()).toHaveLength(6);
    expect(within(screen.getByRole('navigation', { name: 'Páginas de la ropa en el local' })).getByText('Página 1 de 2')).toBeInTheDocument();

    siguientes('Páginas de la ropa en el local');

    await waitFor(() => expect(botonesDeBoletas()).toHaveLength(1));
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });

  it('si todo entra en una página, la barra se ve igual: "Página 1 de 1" con los botones apagados', async () => {
    await abrirMostrador('/mostrador', 7);

    expect(botonesDeBoletas()).toHaveLength(7);
    const paginas = within(screen.getByRole('navigation', { name: 'Páginas de la ropa en el local' }));
    expect(paginas.getByText('Página 1 de 1')).toBeInTheDocument();
    expect(paginas.getByRole('button', { name: 'Anteriores' })).toBeDisabled();
    expect(paginas.getByRole('button', { name: 'Siguientes' })).toBeDisabled();
  });

  it('sin ropa en el local no hay barra: no tendría nada que paginar', async () => {
    tabletConRelojCorrido(0);
    simularApi(() => 'sin-conexion');
    const prueba = await baseLocalDePrueba();
    renderEnRuta(<App />, '/mostrador', { baseLocal: prueba.control });

    expect(await screen.findByText('No hay ropa en el local.')).toBeInTheDocument();
    expect(barra('Páginas de la ropa en el local')).not.toBeInTheDocument();
  });

  it('si la tablet se gira a un ancho distinto, la lista se ajusta sola', async () => {
    await abrirMostrador('/mostrador', 7);
    expect(botonesDeBoletas()).toHaveLength(7);

    cambiarAnchoDePantalla(500);

    await waitFor(() => expect(botonesDeBoletas()).toHaveLength(6));
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();

    cambiarAnchoDePantalla(1200);

    await waitFor(() => expect(botonesDeBoletas()).toHaveLength(7));
    expect(screen.getByText('Página 1 de 1')).toBeInTheDocument();
  });

  it('en una pantalla mediana entran diez', async () => {
    conAnchoDePantalla(800);
    await abrirMostrador('/mostrador', 12);

    expect(botonesDeBoletas()).toHaveLength(10);
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
  });
});

describe('La ropa de un cliente se pagina — SPEC-KRILINXI-041', () => {
  it('su ficha muestra la ropa de a páginas', async () => {
    conAnchoDePantalla(500);
    await abrirMostrador(`/mostrador?cliente=${ROSA.id}`, 7);

    expect(botonesDeBoletas()).toHaveLength(6);
    siguientes('Páginas de la ropa del cliente');
    await waitFor(() => expect(botonesDeBoletas()).toHaveLength(1));
  });
});

describe('Lo de hoy en la sucursal se pagina — SPEC-KRILINXI-041', () => {
  it('la ropa por entregar se muestra de a páginas, y el título sigue diciendo cuántas hay', async () => {
    conAnchoDePantalla(500);
    tabletConRelojCorrido(0);
    simularApi(() => 'sin-conexion');
    const prueba = await baseLocalDePrueba();
    await prueba.sembrar('clientes', [ROSA]);
    await prueba.sembrar('ordenes', ordenesDeRosa(7, { estado: 'RECIBIDO' }));
    renderEnRuta(<App />, '/', { baseLocal: prueba.control });

    const lista = await screen.findByRole('region', { name: 'Ropa por entregar (7 boletas)' });
    expect(within(lista).getAllByRole('link')).toHaveLength(6);

    siguientes('Páginas de ropa por entregar');

    await waitFor(() => expect(within(lista).getAllByRole('link')).toHaveLength(1));
  });
});

/** Un administrador con la base local de la lista que pide el test. */
async function abrirComoAdmin(ruta: string, sembrar: (prueba: Awaited<ReturnType<typeof baseLocalDePrueba>>) => Promise<void>) {
  const prueba = await baseLocalDePrueba();
  await sembrar(prueba);
  renderEnRuta(<App />, ruta, { sesion: ADMIN, baseLocal: prueba.control });
  return prueba;
}

describe('Personal y Sucursales se paginan — SPEC-KRILINXI-041', () => {
  it('las cuentas se muestran de a páginas', async () => {
    conAnchoDePantalla(500);
    simularApi(() => 'sin-conexion');
    await abrirComoAdmin('/personal', async ({ sembrar }) => {
      await sembrar('sucursales', [{ id: SUCURSAL_CENTRO, nombre: 'Centro', activa: 1 }]);
      await sembrar(
        'usuarios',
        Array.from({ length: 7 }, (_, i) => ({
          id: i === 0 ? ADMIN.usuario.id : `00000000-0000-4000-8000-00000000e00${i}`,
          nombre_completo: `Persona ${i + 1}`,
          username: `persona${i + 1}`,
          rol: i === 0 ? 'ADMIN' : 'EMPLEADO',
          sucursal_id: i === 0 ? null : SUCURSAL_CENTRO,
          activo: 1,
        })),
      );
    });

    await screen.findByText('Persona 1');
    expect(enLaPantalla().getAllByRole('listitem')).toHaveLength(6);

    siguientes('Páginas del personal');

    await waitFor(() => expect(enLaPantalla().getAllByRole('listitem')).toHaveLength(1));
  });

  it('las sucursales se muestran de a páginas', async () => {
    conAnchoDePantalla(500);
    simularApi(() => 'sin-conexion');
    await abrirComoAdmin('/sucursales', async ({ sembrar }) => {
      await sembrar(
        'sucursales',
        Array.from({ length: 7 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000c00${i}`, nombre: `Sucursal ${i + 1}`, activa: 1 })),
      );
    });

    await screen.findByText('Sucursal 1');
    expect(enLaPantalla().getAllByRole('listitem')).toHaveLength(6);

    siguientes('Páginas de las sucursales');

    await waitFor(() => expect(enLaPantalla().getAllByRole('listitem')).toHaveLength(1));
  });
});

describe('Los registros para corregir se paginan — SPEC-KRILINXI-041', () => {
  /** Siete boletas que el servidor rechazó, y la pantalla de lo que hay que corregir. */
  async function abrirConSieteRechazadas() {
    conAnchoDePantalla(500);
    const { control, db } = await baseLocalDePrueba();
    for (let i = 1; i <= 7; i++) {
      await control.base.ejecutar('INSERT INTO ordenes (id, numero_boleta, precio_total) VALUES (uuid(), ?, ?)', [boleta(i), '50.00']);
    }
    await subirRechazando(db, 409, 'BOLETA_DUPLICADA', 'Ese número de boleta ya está usado en esta sucursal.');
    renderEnRuta(<App />, '/para-corregir', { baseLocal: control });
    await screen.findAllByText(/Ropa con la boleta/, undefined, { timeout: 3000 });
  }

  it('se muestran de a páginas', async () => {
    await abrirConSieteRechazadas();

    expect(enLaPantalla().getAllByRole('listitem')).toHaveLength(6);
    siguientes('Páginas de los registros para corregir');
    await waitFor(() => expect(enLaPantalla().getAllByRole('listitem')).toHaveLength(1));
  });

  it('al descartar el único de la última página, pasa a la anterior en vez de quedar vacía', async () => {
    await abrirConSieteRechazadas();
    siguientes('Páginas de los registros para corregir');
    await waitFor(() => expect(enLaPantalla().getAllByRole('listitem')).toHaveLength(1));

    fireEvent.click(enLaPantalla().getByRole('button', { name: 'Descartar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, descartar' }));

    // Quedan seis: una sola página, y la barra lo dice.
    await waitFor(() => expect(enLaPantalla().getAllByRole('listitem')).toHaveLength(6));
    expect(within(screen.getByRole('navigation', { name: 'Páginas de los registros para corregir' })).getByText('Página 1 de 1')).toBeInTheDocument();
  });
});

describe('Las listas de las estadísticas se paginan — SPEC-KRILINXI-041', () => {
  it('las boletas con saldo se muestran de a páginas', async () => {
    conAnchoDePantalla(500);
    tabletConRelojCorrido(0);
    const ordenes = Array.from({ length: 7 }, (_, i) => ({
      ...saldosDePrueba().ordenes[0],
      ordenId: `00000000-0000-4000-8000-00000000a00${i}`,
      numeroBoleta: boleta(i + 1),
    }));
    simularEstadisticas({ saldos: { status: 200, data: saldosDePrueba({ ordenes, cantidad: 7 }) } });
    await abrirComoAdmin('/estadisticas', async ({ sembrar }) => {
      await sembrar('sucursales', [{ id: SUCURSAL_CENTRO, nombre: 'Centro', activa: 1 }]);
    });

    const lista = await screen.findByRole('list', { name: 'Boletas con saldo' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(6);

    siguientes('Páginas de las boletas con saldo');

    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Boletas con saldo' })).getAllByRole('listitem')).toHaveLength(1));
  });
});

describe('Lo que se pide a la API depende de la pantalla — SPEC-KRILINXI-041', () => {
  const ANCHOS = [
    [500, 6],
    [800, 10],
    [1024, 20],
  ] as const;

  it.each(ANCHOS)('el historial completo de una pantalla de %ipx pide %i por página', async (ancho, esperadas) => {
    conAnchoDePantalla(ancho);
    tabletConRelojCorrido(0);
    const servidor = simularApi(() => ({ status: 200, data: paginaDeBoletas([boletaDePrueba()], { porPagina: esperadas }) }));
    await abrirComoAdmin('/boletas', async () => undefined);

    await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });
    expect(servidor.pedidos[0]?.parametros).toMatchObject({ por_pagina: esperadas, pagina: 1 });
  });

  it.each(ANCHOS)('la auditoría de una pantalla de %ipx pide %i por página', async (ancho, esperadas) => {
    conAnchoDePantalla(ancho);
    tabletConRelojCorrido(0);
    const servidor = simularApi(() => ({ status: 200, data: paginaDePrueba([], { porPagina: esperadas }) }));
    await abrirComoAdmin('/quien-hizo-que', async () => undefined);

    await screen.findByText('No hay nada registrado en este período.');
    expect(servidor.pedidos[0]?.parametros).toMatchObject({ por_pagina: esperadas });
  });

  it.each(ANCHOS)('los clientes de las estadísticas de una pantalla de %ipx piden %i por página', async (ancho, esperadas) => {
    conAnchoDePantalla(ancho);
    tabletConRelojCorrido(0);
    const servidor = simularEstadisticas();
    await abrirComoAdmin('/estadisticas', async () => undefined);
    // Los clientes están en "Ver más estadísticas" y no se piden hasta que se despliega (SPEC-KRILINXI-050).
    fireEvent.click(await screen.findByText('Ver más estadísticas'));

    await waitFor(() => expect(servidor.pedidos.some((p) => p.ruta === '/estadisticas/clientes')).toBe(true));
    expect(servidor.pedidos.find((p) => p.ruta === '/estadisticas/clientes')?.parametros).toMatchObject({ por_pagina: esperadas });
  });

  it('si la tablet se gira, vuelve a pedir la primera página con el tamaño nuevo', async () => {
    conAnchoDePantalla(500);
    tabletConRelojCorrido(0);
    const servidor = simularApi(() => ({ status: 200, data: paginaDeBoletas([boletaDePrueba()], { total: 41, porPagina: 6 }) }));
    await abrirComoAdmin('/boletas', async () => undefined);
    await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' });
    siguientes('Páginas del historial');
    await waitFor(() => expect(servidor.pedidos.at(-1)?.parametros).toMatchObject({ pagina: 2, por_pagina: 6 }));

    cambiarAnchoDePantalla(1200);

    // La página 2 de a 6 no es la página 2 de a 20: vuelve a empezar.
    await waitFor(() => expect(servidor.pedidos.at(-1)?.parametros).toMatchObject({ pagina: 1, por_pagina: 20 }));
  });
});

describe('El historial de la sucursal se pagina — SPEC-KRILINXI-041', () => {
  it('en una pantalla angosta muestra seis boletas por página', async () => {
    conAnchoDePantalla(500);
    tabletConRelojCorrido(0);
    simularApi(() => 'sin-conexion');
    const prueba = await baseLocalDePrueba();
    await prueba.sembrar('clientes', [ROSA]);
    await prueba.sembrar('ordenes', ordenesDeRosa(7));
    renderEnRuta(<App />, '/boletas', { baseLocal: prueba.control });

    const lista = await screen.findByRole('region', { name: 'Las boletas' });
    await waitFor(() => expect(within(lista).getAllByRole('link')).toHaveLength(6));
    expect(within(screen.getByRole('navigation', { name: 'Páginas del historial' })).getByText('Página 1 de 2')).toBeInTheDocument();
  });
});
