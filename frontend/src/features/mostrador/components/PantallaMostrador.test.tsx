import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { elegirEnBuscador } from '../../../test/buscador';
import { clienteDePrueba, entregaDePrueba, ordenDePrueba, pagoDePrueba } from '../../../test/filasDePrueba';
import { accionesPrincipales, usoDe } from '../../../test/jerarquia';
import { sinJerga } from '../../../test/jerga';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';
import { escribirPrenda } from '../../../test/renglones';

/**
 * El Mostrador sobre la App entera, con la base local de verdad y el servidor "sin internet": lo
 * que se prueba va de la pantalla al SQL — SPEC-KRILINXI-033.
 *
 * Los recorridos de Ropa en el local y Cobrar (SPEC-KRILINXI-008) vivían en /ropa; se reescribieron
 * acá contra /mostrador y conservan su etiqueta, para que `grep SPEC-KRILINXI-008` los siga
 * encontrando.
 */
const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });
const RECIBIDA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000001', descripcion: '2 pantalones' });
const ENTREGADA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000004', estado: 'RECIBIDO' });

async function abrir(ruta = '/mostrador') {
  const servidor = simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  await prueba.sembrar('ordenes', [RECIBIDA, ENTREGADA]);
  await prueba.sembrar('pagos', [pagoDePrueba({ orden_id: RECIBIDA.id, monto: '20.00' })]);
  await prueba.sembrar('entregas', [entregaDePrueba({ orden_id: ENTREGADA.id })]);
  renderEnRuta(<App />, ruta, { baseLocal: prueba.control });
  await screen.findByRole('button', { name: 'Boleta 000001, Rosa Quispe' });
  return { ...prueba, servidor };
}

/** Desde la ropa en el local, abre una boleta: la ficha de su cliente, con esa boleta abierta. */
async function abrirDetalle(boleta = '000001') {
  fireEvent.click(screen.getByRole('button', { name: `Boleta ${boleta}, Rosa Quispe` }));
  return screen.findByRole('region', { name: `Boleta ${boleta}` });
}

/** Busca una boleta por su número y la elige: abre la ficha con esa boleta. */
async function buscarBoleta(boleta: string) {
  await elegirEnBuscador(boleta, new RegExp(`Boleta ${boleta}`));
  return screen.findByRole('region', { name: `Boleta ${boleta}` });
}

/**
 * Una boleta RECIBIDA y otra guardada como LISTO por una versión anterior a SPEC-KRILINXI-067 (todavía sin
 * sincronizar, se lee como recibida), las dos de Rosa y sin entregar (SPEC-KRILINXI-037 y SPEC-KRILINXI-038).
 */
const LISTA = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000007', estado: 'LISTO' });

async function abrirConRopaLista() {
  simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  await prueba.sembrar('ordenes', [RECIBIDA, LISTA]);
  renderEnRuta(<App />, '/mostrador', { baseLocal: prueba.control });
  await screen.findByRole('button', { name: 'Boleta 000001, Rosa Quispe' });
}

const boton = (nombre: string) => within(screen.getByRole('main')).getByRole('button', { name: nombre });

/** Una flechita: un botón sin texto visible, con su nombre en aria-label y title, y un ícono decorativo (SPEC-KRILINXI-057). */
const esFlechita = (b: HTMLElement) =>
  b.textContent === '' &&
  b.getAttribute('title') === b.getAttribute('aria-label') &&
  b.querySelector('svg')?.getAttribute('aria-hidden') === 'true' &&
  b.classList.contains('size-12');

function datoDelDetalle(detalle: HTMLElement, dato: string) {
  const termino = within(detalle).getByText(dato, { selector: 'dt' });
  return termino.nextElementSibling?.textContent;
}

describe('Mostrador: una sola pantalla — SPEC-KRILINXI-033', () => {
  it('el menú muestra Mostrador en lugar de Ropa en el local, Cobrar y Entregar ropa', async () => {
    await abrir();
    const menu = screen.getByRole('navigation', { name: 'Menú principal' });
    const nombres = within(menu).getAllByRole('link').map((enlace) => enlace.textContent);
    expect(nombres).toContain('Mostrador');
    for (const viejo of ['Ropa en el local', 'Cobrar', 'Entregar ropa']) expect(nombres).not.toContain(viejo);
  });

  it.each(['/ropa', '/cobrar', '/entregar'])('%s lleva al Mostrador', async (ruta) => {
    await abrir(ruta);
    expect(screen.getByRole('heading', { name: 'Mostrador', level: 1 })).toBeInTheDocument();
  });

  it('al elegir un cliente se ve su ficha con su ropa de esta sucursal, la que sigue en el local primero', async () => {
    await abrir();
    await elegirEnBuscador('rosa', /Rosa Quispe/);

    const ficha = await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });
    expect(within(ficha).getByText('Rosa Quispe', { selector: 'dd' })).toBeInTheDocument();
    const boletas = within(ficha)
      .getAllByRole('button', { name: /^Boleta/ })
      .map((b) => b.getAttribute('aria-label'));
    expect(boletas).toEqual(['Boleta 000001, Rosa Quispe', 'Boleta 000004, Rosa Quispe']);
    sinJerga();
  });

  it('al elegir una boleta se abre dentro de la ficha de su cliente', async () => {
    await abrir();
    const detalle = await buscarBoleta('000004');
    const ficha = screen.getByRole('region', { name: 'Ficha de Rosa Quispe' });
    expect(ficha).toContainElement(detalle);
    // Y se vuelve a toda la ropa del cliente, sin buscar de nuevo.
    fireEvent.click(within(detalle).getByRole('button', { name: 'Ver toda la ropa de Rosa Quispe' }));
    expect(await within(ficha).findByRole('heading', { name: 'Su ropa en esta sucursal' })).toBeInTheDocument();
  });

  it('después de cobrar, la ficha dice qué se hizo y muestra el saldo nuevo, sin volver al buscador', async () => {
    await abrir();
    const detalle = await abrirDetalle();
    fireEvent.click(within(detalle).getByRole('button', { name: 'Cobrar' }));
    const formulario = within(detalle).getByRole('form', { name: 'Cobrar' });
    fireEvent.change(within(formulario).getByLabelText('Cuánto paga (Bs)'), { target: { value: '10' } });
    fireEvent.click(within(formulario).getByLabelText('Efectivo'));
    fireEvent.click(within(formulario).getByRole('button', { name: 'Guardar cobro' }));

    expect(await within(detalle).findByText('Cobro guardado.')).toBeInTheDocument();
    await waitFor(() => expect(datoDelDetalle(detalle, 'Falta pagar')).toBe('Bs 20,00'));
    expect(screen.getByRole('region', { name: 'Ficha de Rosa Quispe' })).toContainElement(detalle);
  });

  it('la flechita de volver al mostrador lleva a la ropa en el local — SPEC-KRILINXI-057', async () => {
    await abrir();
    await abrirDetalle();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mostrador' }));
    expect(await screen.findByRole('heading', { name: 'Ropa en el local' })).toBeInTheDocument();
  });

  it('sin internet, ninguna lectura va al servidor', async () => {
    const { servidor } = await abrir();
    await buscarBoleta('000001');
    expect(servidor.pedidos).toEqual([]);
  });
});

describe('Mostrador: la ropa en el local — SPEC-KRILINXI-008 y SPEC-KRILINXI-033', () => {
  it('muestra la abierta con su estado y lo que falta pagar, y no la entregada sin sincronizar', async () => {
    const { servidor } = await abrir();
    const tarjeta = screen.getByRole('button', { name: 'Boleta 000001, Rosa Quispe' });
    expect(tarjeta).toHaveTextContent('Recibido');
    expect(tarjeta).toHaveTextContent('Falta pagar Bs 30,00');
    expect(screen.queryByRole('button', { name: /Boleta 000004/ })).not.toBeInTheDocument();
    expect(servidor.pedidos).toEqual([]);
    sinJerga();
  });

  it('busca por teléfono y, en la ficha, encuentra también la entregada, que figura Entregado', async () => {
    await abrir();
    await elegirEnBuscador('7012 3456', /Rosa Quispe/);
    const entregada = await screen.findByRole('button', { name: 'Boleta 000004, Rosa Quispe' });
    expect(entregada).toHaveTextContent('Entregado');
    sinJerga();
  });
});

describe('Mostrador: la boleta — SPEC-KRILINXI-008 y SPEC-KRILINXI-033', () => {
  it('muestra los datos, los pagos y el saldo', async () => {
    await abrir();
    const detalle = await abrirDetalle();
    expect(datoDelDetalle(detalle, 'Precio')).toBe('Bs 50,00');
    expect(datoDelDetalle(detalle, 'Pagó')).toBe('Bs 20,00');
    expect(datoDelDetalle(detalle, 'Falta pagar')).toBe('Bs 30,00');
    expect(within(detalle).getByRole('list', { name: 'Pagos' })).toHaveTextContent('Adelanto — Efectivo — Bs 20,00');
    sinJerga();
  });

  it('SPEC-KRILINXI-067: la ropa recibida no tiene pasos intermedios: no ofrece lavar ni marcar como lista', async () => {
    const { db } = await abrir();
    const detalle = await abrirDetalle();

    expect(datoDelDetalle(detalle, 'Cómo va')).toBe('Recibido');
    for (const nombre of ['Empezar a lavar', 'Marcar como lista']) {
      expect(within(detalle).queryByRole('button', { name: nombre })).not.toBeInTheDocument();
    }
    // Lo que sí ofrece: cobrar, entregar y, aparte, anular.
    for (const nombre of ['Cobrar', 'Entregar la ropa', 'Anular']) {
      expect(within(detalle).getByRole('button', { name: nombre })).toBeInTheDocument();
    }
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('anular pide confirmación; cancelar no cambia nada y confirmar la cierra', async () => {
    const { db } = await abrir();
    const detalle = await abrirDetalle();

    fireEvent.click(within(detalle).getByRole('button', { name: 'Anular' }));
    expect(screen.getByRole('dialog', { name: '¿Anular la boleta 000001?' })).toHaveTextContent(
      'Esta acción no se puede deshacer.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await db.getCrudBatch()).toBeNull();

    // Boton queda ocupado hasta que termina su acción: hay que esperar a que se libere,
    // como esperaría una persona, antes de tocarlo otra vez.
    const anular = within(detalle).getByRole('button', { name: 'Anular' });
    await waitFor(() => expect(anular).toBeEnabled());
    fireEvent.click(anular);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, anular' }));

    await waitFor(() => expect(datoDelDetalle(detalle, 'Cómo va')).toBe('Anulado'));
    // Cerrada: ya no ofrece nada.
    for (const nombre of ['Anular', 'Cobrar', 'Entregar la ropa']) {
      expect(within(detalle).queryByRole('button', { name: nombre })).not.toBeInTheDocument();
    }
  });

  it('cobra a cuenta y el saldo baja', async () => {
    await abrir();
    const detalle = await abrirDetalle();
    fireEvent.click(within(detalle).getByRole('button', { name: 'Cobrar' }));
    const formulario = within(detalle).getByRole('form', { name: 'Cobrar' });
    fireEvent.change(within(formulario).getByLabelText('Cuánto paga (Bs)'), { target: { value: '10' } });
    fireEvent.click(within(formulario).getByLabelText('Pago con QR'));
    fireEvent.click(within(formulario).getByRole('button', { name: 'Guardar cobro' }));

    await waitFor(() => expect(datoDelDetalle(detalle, 'Falta pagar')).toBe('Bs 20,00'));
    expect(within(detalle).getByRole('list', { name: 'Pagos' })).toHaveTextContent('Adelanto — Pago con QR — Bs 10,00');
    sinJerga();
  });

  it('no deja cobrar más de lo que falta, y lo dice', async () => {
    const { db } = await abrir();
    const detalle = await abrirDetalle();
    fireEvent.click(within(detalle).getByRole('button', { name: 'Cobrar' }));
    fireEvent.change(within(detalle).getByLabelText('Cuánto paga (Bs)'), { target: { value: '31' } });
    fireEvent.click(within(detalle).getByLabelText('Efectivo'));
    fireEvent.click(within(detalle).getByRole('button', { name: 'Guardar cobro' }));

    expect(await within(detalle).findByText('El cobro no puede ser mayor que lo que falta pagar.')).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('una ropa entregada no ofrece anular, cobrar ni entregar', async () => {
    await abrir();
    const detalle = await buscarBoleta('000004');

    expect(datoDelDetalle(detalle, 'Cómo va')).toBe('Entregado');
    for (const nombre of ['Anular', 'Cobrar', 'Entregar la ropa']) {
      expect(within(detalle).queryByRole('button', { name: nombre })).not.toBeInTheDocument();
    }
  });

  it('una entregada sin boleta dice quién la retiró, leído de la base local y sin internet — SPEC-KRILINXI-060', async () => {
    const sinBoleta = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000005', estado: 'RECIBIDO' });
    const { sembrar } = await abrir();
    await sembrar('ordenes', [sinBoleta]);
    await sembrar('entregas', [
      entregaDePrueba({
        orden_id: sinBoleta.id,
        tipo_retiro: 'SIN_BOLETA',
        retirado_por_nombre: 'Luis Mamani',
        retirado_por_carnet: '1234567 LP',
      }),
    ]);
    const detalle = await buscarBoleta('000005');

    expect(datoDelDetalle(detalle, 'Retiró')).toBe('Luis Mamani, 1234567 LP');
    sinJerga();
  });

  it('una entregada con boleta lo dice — SPEC-KRILINXI-060', async () => {
    await abrir();
    const detalle = await buscarBoleta('000004');

    expect(datoDelDetalle(detalle, 'Retiró')).toBe('Con la boleta');
  });

  it('una boleta sin entregar no muestra nada de retiro — SPEC-KRILINXI-060', async () => {
    await abrir();
    const detalle = await abrirDetalle('000001');

    expect(within(detalle).queryByText('Retiró')).not.toBeInTheDocument();
  });

  it('un ADMIN que no está atendiendo ve cómo empezar (SPEC-KRILINXI-029)', () => {
    renderEnRuta(<App />, '/mostrador', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    expect(screen.getByText(/elige en qué sucursal vas a atender/)).toBeInTheDocument();
  });
});

describe('Mostrador: una lectura vieja no pisa la búsqueda — SPEC-KRILINXI-019 y SPEC-KRILINXI-033', () => {
  it('si la lista del local llega después de elegir una boleta, se sigue viendo la boleta', async () => {
    simularApi(() => 'sin-conexion');
    const prueba = await baseLocalDePrueba();
    const rosa = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });
    const entregada = ordenDePrueba({ cliente_id: rosa.id, numero_boleta: '001234', estado: 'RECIBIDO' });
    await prueba.sembrar('clientes', [rosa]);
    await prueba.sembrar('ordenes', [entregada]);
    await prueba.sembrar('entregas', [entregaDePrueba({ orden_id: entregada.id })]);

    // La lista del local (la consulta de órdenes sin filtro) tarda; la búsqueda y la ficha, no. Así
    // la respuesta vieja llega siempre última.
    const { base } = prueba.control;
    const lenta = {
      ...base,
      consultar: async (sql: string, parametros?: unknown[]) => {
        if (/FROM ordenes/.test(sql) && !/numero_boleta LIKE|cliente_id = \?|o\.id = \?/.test(sql)) {
          await new Promise((r) => setTimeout(r, 300));
        }
        return base.consultar(sql, parametros);
      },
    };
    renderEnRuta(<App />, '/mostrador', { baseLocal: { ...prueba.control, base: lenta } });

    await elegirEnBuscador('001234', /Boleta 001234/);
    expect(await screen.findByRole('region', { name: 'Boleta 001234' })).toBeInTheDocument();
    // Y sigue ahí cuando llega la lista vieja.
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByRole('region', { name: 'Boleta 001234' })).toBeInTheDocument();
  });
});

describe('Mostrador con el tema — SPEC-KRILINXI-025 y SPEC-KRILINXI-033', () => {
  it('cada ropa de la lista es una tarjeta con su estado en una insignia del tono que le toca', async () => {
    await abrir();
    const tarjeta = screen.getByRole('button', { name: 'Boleta 000001, Rosa Quispe' });
    expect(tarjeta).toHaveClass('rounded-2xl', 'bg-superficie');
    // La palabra está siempre; el tono solo ayuda a encontrarla (TONO_ESTADO: RECIBIDO, neutro).
    expect(within(tarjeta).getByText('Recibido')).toHaveClass('rounded-full', 'bg-fondo');
    expect(within(tarjeta).getByText('Falta pagar Bs 30,00')).toHaveClass('text-peligro-texto');
  });

  it('la entregada sin sincronizar figura con la insignia de Entregado (estadoEfectivo)', async () => {
    await abrir();
    await elegirEnBuscador('70123456', /Rosa Quispe/);
    const tarjeta = await screen.findByRole('button', { name: 'Boleta 000004, Rosa Quispe' });
    expect(within(tarjeta).getByText('Entregado')).toHaveClass('rounded-full');
  });

  it('el detalle agrupa la ropa, las cuentas y los pagos en tarjetas, y destaca lo que falta pagar', async () => {
    await abrir();
    const detalle = await abrirDetalle();
    expect(within(detalle).getByRole('region', { name: 'La ropa' })).toBeInTheDocument();
    expect(within(detalle).getByRole('heading', { level: 3, name: 'Cuentas' })).toBeInTheDocument();
    expect(within(within(detalle).getByRole('region', { name: 'Pagos' })).getByRole('list', { name: 'Pagos' })).toBeInTheDocument();

    const saldo = within(detalle).getByText('Falta pagar', { selector: 'dt' }).nextElementSibling;
    expect(saldo).toHaveClass('text-3xl', 'text-peligro-texto');
    expect(within(detalle).getByText('Recibido', { selector: 'dd span' })).toHaveClass('rounded-full');
  });

  it('el error de un cobro es un aviso de error del tema, con su rol de alerta', async () => {
    await abrir();
    const detalle = await abrirDetalle();
    fireEvent.click(within(detalle).getByRole('button', { name: 'Cobrar' }));
    fireEvent.change(within(detalle).getByLabelText('Cuánto paga (Bs)'), { target: { value: '31' } });
    fireEvent.click(within(detalle).getByLabelText('Efectivo'));
    // El método elegido se distingue por algo más que el color: negrita.
    expect(within(detalle).getByLabelText('Efectivo').closest('label')).toHaveClass('font-semibold', 'border-marca');
    fireEvent.click(within(detalle).getByRole('button', { name: 'Guardar cobro' }));

    const aviso = await within(detalle).findByRole('alert');
    expect(aviso).toHaveTextContent('El cobro no puede ser mayor que lo que falta pagar.');
    expect(aviso).toHaveClass('bg-peligro-fondo');
  });

  it('la ropa entregada lo dice en un aviso de información', async () => {
    await abrir();
    const detalle = await buscarBoleta('000004');
    expect(within(detalle).getByText('Esta ropa ya fue entregada.').closest('[role="status"]')).toHaveClass('bg-info-fondo');
  });
});

/**
 * La jerarquía en el Mostrador — SPEC-KRILINXI-037: en cada vista hay una sola acción principal, y
 * volver o cambiar de vista tienen el estilo de navegación. `accionesPrincipales` y `usoDe` leen con
 * qué estilo se armó cada botón (ver `test/jerarquia.ts`).
 */
describe('Mostrador: una sola acción principal a la vista — SPEC-KRILINXI-037', () => {
  it('sin buscar nada, la única principal es Registrar ropa, y cada boleta es una tarjeta que se toca', async () => {
    await abrirConRopaLista();
    expect(accionesPrincipales()).toEqual(['Registrar ropa']);
    // La señal de que lleva a algo: la flecha, además del texto que la nombra.
    expect(boton('Boleta 000001, Rosa Quispe')).toHaveClass('shadow-md');
    expect(boton('Boleta 000001, Rosa Quispe').querySelectorAll('svg')).toHaveLength(1);
  });

  it('con una boleta recibida abierta, la principal es entregarla; cobrar y anular van chicos, en una fila', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    expect(accionesPrincipales()).toEqual(['Entregar la ropa']);
    // Dentro de una boleta no se está en el mostrador (SPEC-KRILINXI-057): ni "Registrar ropa" ni el buscador.
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Registrar ropa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Buscar cliente o boleta/ })).not.toBeInTheDocument();
    expect(usoDe(boton('Entregar la ropa'))).toBe('primario');
    expect(boton('Cobrar')).toHaveClass('min-h-12');
    expect(usoDe(boton('Anular'))).toBe('peligro');
    expect(usoDe(boton('Ver toda la ropa de Rosa Quispe'))).toBe('navegacion');
  });

  it('SPEC-KRILINXI-067: una boleta guardada como LISTO por una versión anterior se abre como recibida, con entregar de principal', async () => {
    await abrirConRopaLista();
    const detalle = await abrirDetalle('000007');
    expect(datoDelDetalle(detalle, 'Cómo va')).toBe('Recibido');
    expect(accionesPrincipales()).toEqual(['Entregar la ropa']);
  });

  it('en la ficha, volver al mostrador es una flechita, y no una acción más', async () => {
    await abrirConRopaLista();
    await elegirEnBuscador('rosa', /Rosa Quispe/);
    await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });
    expect(accionesPrincipales()).toEqual(['Registrar ropa']);
    expect(esFlechita(boton('Volver al mostrador'))).toBe(true);
    // Y como no es una acción, no cuenta entre las principales.
    expect(accionesPrincipales()).toEqual(['Registrar ropa']);
  });

  it('registrando, la única principal es Guardar, y salir sin guardar es una flechita', async () => {
    await abrirConRopaLista();
    fireEvent.click(boton('Registrar ropa'));
    // Primero se elige el cliente: ahí todavía no hay nada que guardar (SPEC-KRILINXI-057).
    await elegirEnBuscador('zz', 'Cliente nuevo');
    await screen.findByRole('form', { name: 'Datos de la ropa' });
    expect(accionesPrincipales()).toEqual(['Guardar']);
    expect(esFlechita(boton('Volver al mostrador sin guardar'))).toBe(true);
  });
});

/**
 * Las acciones de la boleta en fila — SPEC-KRILINXI-038. jsdom no calcula la disposición, así que se
 * comprueba con qué clases se armó la fila (grilla de dos columnas en angosta, flex desde `sm`) y qué
 * hay dentro y fuera de ella, buscándola por su nombre: "Qué hacer con esta ropa".
 */
describe('Mostrador: las acciones de la boleta en fila, con su símbolo — SPEC-KRILINXI-038', () => {
  const fila = () => screen.getByRole('group', { name: 'Qué hacer con esta ropa' });
  const nombres = (dentro: HTMLElement) => within(dentro).getAllByRole('button').map((b) => b.textContent?.trim());

  it('van en una fila: dos columnas en pantalla angosta y de corrido en ancha, nunca una barra por renglón', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    expect(fila()).toHaveClass('grid-cols-2', 'sm:flex', 'sm:flex-wrap');
    for (const accion of within(fila()).getAllByRole('button')) {
      expect(accion).not.toHaveClass('w-full');
      // De dedo: el compacto mide 48px (min-h-12).
      expect(accion).toHaveClass('min-h-12');
    }
  });

  it('cada acción lleva su ícono, decorativo: el nombre sigue siendo su palabra', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    // Sin pasos intermedios (SPEC-KRILINXI-067): solo cobrar y entregar.
    expect(nombres(fila())).toEqual(['Cobrar', 'Entregar la ropa']);
    for (const accion of within(fila()).getAllByRole('button')) {
      expect(accion.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('entregar es la principal, cobrar es secundaria, y anular de peligro, fuera de la fila', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    expect(accionesPrincipales(fila())).toEqual(['Entregar la ropa']);
    expect(usoDe(boton('Cobrar'))).toBe('secundario');
    expect(usoDe(boton('Entregar la ropa'))).toBe('primario');
    expect(usoDe(boton('Anular'))).toBe('peligro');
    // Desde SPEC-KRILINXI-049 anular ya no comparte fila con las acciones de todos los días.
    expect(fila()).not.toContainElement(boton('Anular'));
  });

  it('con la ropa lista, entregar es la que sigue', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000007');
    expect(accionesPrincipales(fila())).toEqual(['Entregar la ropa']);
  });

  it('volver a la ropa del cliente es navegación y va fuera de la fila', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    const volver = boton('Ver toda la ropa de Rosa Quispe');
    expect(usoDe(volver)).toBe('navegacion');
    expect(fila()).not.toContainElement(volver);
    expect(fila()).not.toContainElement(boton('Volver al mostrador'));
  });

  it('al abrir el formulario de entrega, ocupa la fila entera', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000007');
    fireEvent.click(boton('Entregar la ropa'));
    const formulario = await within(fila()).findByRole('form');
    expect(formulario.closest('.col-span-2')).toHaveClass('sm:basis-full');
  });

  it('una boleta cerrada no ofrece acciones', async () => {
    await abrir();
    // Entregada: ya no está en la ropa del local, se llega por el buscador.
    await buscarBoleta('000004');
    expect(screen.queryByRole('group', { name: 'Qué hacer con esta ropa' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument();
  });
});

/**
 * Las acciones de la boleta, justo debajo de lo que falta pagar — SPEC-KRILINXI-049. jsdom no mide
 * la pantalla, así que "arriba" se comprueba por el orden en el documento.
 */
describe('Mostrador: las acciones de la boleta suben y anular queda aparte — SPEC-KRILINXI-049', () => {
  const fila = () => screen.getByRole('group', { name: 'Qué hacer con esta ropa' });
  const despues = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('la fila de acciones está después de "Falta pagar" y antes de los pagos', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    const faltaPagar = screen.getByText('Falta pagar', { selector: 'dt' });
    const pagos = screen.getByRole('heading', { name: 'Pagos' });

    expect(despues(faltaPagar, fila())).toBe(true);
    expect(despues(fila(), pagos)).toBe(true);
  });

  it('la fila tiene como mucho cuatro botones y anular no está en ella', async () => {
    await abrirConRopaLista();
    for (const boleta of ['000001', '000007']) {
      if (boleta !== '000001') {
        fireEvent.click(boton('Ver toda la ropa de Rosa Quispe'));
      }
      if (boleta === '000007') fireEvent.click(await screen.findByRole('button', { name: 'Boleta 000007, Rosa Quispe' }));
      else await abrirDetalle(boleta);
      await screen.findByRole('region', { name: `Boleta ${boleta}` });
      expect(within(fila()).getAllByRole('button').length).toBeLessThanOrEqual(4);
      expect(within(fila()).queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument();
    }
  });

  it('anular queda al final de la boleta, después de los pagos, con su confirmación de siempre', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    const anular = boton('Anular');
    expect(despues(screen.getByRole('heading', { name: 'Pagos' }), anular)).toBe(true);
    expect(usoDe(anular)).toBe('peligro');
    expect(anular.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(anular);
    expect(screen.getByRole('dialog', { name: '¿Anular la boleta 000001?' })).toHaveTextContent(
      'Esta acción no se puede deshacer.',
    );
  });

  it('cobrar abre su formulario en el mismo lugar que la fila: debajo de lo que falta pagar', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    fireEvent.click(boton('Cobrar'));
    const formulario = await screen.findByRole('form', { name: 'Cobrar' });

    expect(screen.queryByRole('group', { name: 'Qué hacer con esta ropa' })).not.toBeInTheDocument();
    expect(despues(screen.getByText('Falta pagar', { selector: 'dt' }), formulario)).toBe(true);
    expect(despues(formulario, screen.getByRole('heading', { name: 'Pagos' }))).toBe(true);
  });

  it('sigue habiendo una sola acción principal, la misma de antes', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    expect(accionesPrincipales()).toEqual(['Entregar la ropa']);
  });
});

/**
 * Otra boleta del mismo cliente desde el detalle de una boleta — SPEC-KRILINXI-057. Es el atajo para
 * cargar la segunda prenda de quien ya está en el mostrador, sin volver a buscarlo.
 */
describe('Mostrador: "Nueva boleta de este cliente" dentro de una boleta — SPEC-KRILINXI-057', () => {
  const NUEVA = 'Nueva boleta de este cliente';
  const escribir = (etiqueta: string, valor: string) =>
    fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

  it('abre Registrar ropa con el cliente de la boleta ya elegido, sin buscador, y al guardar vuelve a su ficha con la boleta nueva', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');

    fireEvent.click(boton(NUEVA));

    const formulario = await screen.findByRole('form', { name: 'Datos de la ropa' });
    // Rosa ya viene elegida, y no hay dónde buscar a otro cliente en la boleta.
    expect(within(formulario).getByRole('region', { name: 'Cliente' })).toHaveTextContent('Rosa Quispe');
    expect(screen.queryByRole('combobox', { name: /Buscar cliente/ })).not.toBeInTheDocument();

    escribir('Número de la boleta', '000050');
    escribirPrenda(1, { que: '1 camisa', precio: '12' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Ver la boleta en la ficha de Rosa Quispe' }));
    expect(await screen.findByRole('region', { name: 'Boleta 000050' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ficha de Rosa Quispe' })).toBeInTheDocument();
  });

  it('es un botón secundario, fuera de la fila de acciones, y la principal sigue siendo una sola', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    const fila = screen.getByRole('group', { name: 'Qué hacer con esta ropa' });

    expect(usoDe(boton(NUEVA))).toBe('secundario');
    expect(fila).not.toContainElement(boton(NUEVA));
    // La fila sigue con sus cuatro botones como mucho (SPEC-KRILINXI-049).
    expect(within(fila).getAllByRole('button').length).toBeLessThanOrEqual(4);
    expect(accionesPrincipales()).toEqual(['Entregar la ropa']);
    expect(boton(NUEVA).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    sinJerga();
  });

  it('solo está dentro de una boleta: en la lista de la ropa del cliente queda "Registrar ropa", como siempre', async () => {
    await abrirConRopaLista();
    await elegirEnBuscador('rosa', /Rosa Quispe/);
    await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });

    expect(within(screen.getByRole('main')).queryByRole('button', { name: NUEVA })).not.toBeInTheDocument();
    expect(boton('Registrar ropa')).toBeInTheDocument();
  });
});

describe('Mostrador: dentro de una boleta ya no se está en el mostrador — SPEC-KRILINXI-057', () => {
  const buscador = () => screen.queryByRole('combobox', { name: /Buscar cliente o boleta/ });
  const registrar = () => within(screen.getByRole('main')).queryByRole('button', { name: 'Registrar ropa' });

  it('con una boleta abierta no están "Registrar ropa" ni el buscador, y al volver a la ficha reaparecen', async () => {
    await abrirConRopaLista();
    // En el mostrador, los dos están.
    expect(buscador()).toBeInTheDocument();
    expect(registrar()).toBeInTheDocument();

    await abrirDetalle('000001');
    expect(buscador()).not.toBeInTheDocument();
    expect(registrar()).not.toBeInTheDocument();
    // En su lugar, el camino propio de la boleta: otra del mismo cliente, y volver.
    expect(boton('Nueva boleta de este cliente')).toBeInTheDocument();
    expect(boton('Ver toda la ropa de Rosa Quispe')).toBeInTheDocument();

    fireEvent.click(boton('Ver toda la ropa de Rosa Quispe'));
    expect(await screen.findByRole('combobox', { name: /Buscar cliente o boleta/ })).toBeInTheDocument();
    expect(registrar()).toBeInTheDocument();
  });

  it('abriendo la boleta desde el Inicio por su dirección tampoco muestra el buscador', async () => {
    const { control } = await baseLocalDePrueba().then(async (p) => {
      await p.sembrar('clientes', [ROSA]);
      await p.sembrar('ordenes', [RECIBIDA]);
      return p;
    });
    simularApi(() => 'sin-conexion');
    renderEnRuta(<App />, `/mostrador?cliente=${ROSA.id}&boleta=${RECIBIDA.id}`, { baseLocal: control });

    await screen.findByRole('region', { name: 'Boleta 000001' });
    expect(buscador()).not.toBeInTheDocument();
    expect(registrar()).not.toBeInTheDocument();
  });
});

/**
 * Volver a tocar "Mostrador" en el menú, y el volver arriba de todo — SPEC-KRILINXI-057. Las boletas no son rutas
 * aparte: se abren en la misma pantalla, así que antes tocar "Mostrador" estando ahí no hacía nada, y el botón de volver
 * estaba al final de la boleta.
 */
describe('Mostrador: volver sin bajar la página — SPEC-KRILINXI-057', () => {
  const menu = () => screen.getByRole('navigation', { name: 'Menú principal' });
  const tocarMostradorEnElMenu = () => fireEvent.click(within(menu()).getByRole('link', { name: 'Mostrador' }));

  it('tocar "Mostrador" en el menú con una boleta abierta vuelve al principio del mostrador', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    expect(screen.getByRole('region', { name: 'Boleta 000001' })).toBeInTheDocument();

    tocarMostradorEnElMenu();

    // Otra vez el mostrador: la ropa en el local, el buscador y "Registrar ropa"; la boleta ya no.
    expect(await screen.findByRole('heading', { name: 'Ropa en el local' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Boleta 000001' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Buscar cliente o boleta/ })).toBeInTheDocument();
    expect(boton('Registrar ropa')).toBeInTheDocument();
  });

  it('también desde la ficha de un cliente, y se puede repetir las veces que haga falta', async () => {
    await abrirConRopaLista();
    for (const _vez of [1, 2]) {
      await elegirEnBuscador('rosa', /Rosa Quispe/);
      await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });
      tocarMostradorEnElMenu();
      expect(await screen.findByRole('heading', { name: 'Ropa en el local' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Ficha de Rosa Quispe' })).not.toBeInTheDocument();
    }
  });

  it('registrando ropa sin escribir nada, vuelve; con algo escrito, pregunta antes de descartarlo', async () => {
    await abrirConRopaLista();
    fireEvent.click(boton('Registrar ropa'));
    await elegirEnBuscador('zz', 'Cliente nuevo');
    await screen.findByRole('form', { name: 'Datos de la ropa' });

    // Con el cliente nuevo ya elegido hay algo escrito: no se descarta en silencio.
    tocarMostradorEnElMenu();
    const aviso = await screen.findByRole('dialog');
    expect(within(aviso).getByText('¿Salir sin guardar?')).toBeInTheDocument();
    fireEvent.click(within(aviso).getByRole('button', { name: 'Seguir escribiendo' }));
    expect(screen.getByRole('form', { name: 'Datos de la ropa' })).toBeInTheDocument();
  });

  it('tocar el menú en otra pantalla sigue yendo a esa pantalla, como siempre', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    fireEvent.click(within(menu()).getByRole('link', { name: 'Inicio' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Mostrador', level: 1 })).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Boleta 000001' })).not.toBeInTheDocument();
  });

  it('con una boleta abierta, "Ver toda la ropa de Rosa" sigue al final de la boleta, y la flechita arriba vuelve al mostrador', async () => {
    await abrirConRopaLista();
    await abrirDetalle('000001');
    const ficha = screen.getByRole('region', { name: 'Ficha de Rosa Quispe' });
    const detalle = screen.getByRole('region', { name: 'Boleta 000001' });

    // El de la ropa del cliente: dentro de la boleta, al final, como siempre.
    const delCliente = within(detalle).getAllByRole('button', { name: 'Ver toda la ropa de Rosa Quispe' });
    expect(delCliente).toHaveLength(1);
    expect(usoDe(delCliente[0] as HTMLElement)).toBe('navegacion');
    // El de volver al mostrador: la flechita, antes de todo lo demás.
    const atras = boton('Volver al mostrador');
    expect(esFlechita(atras)).toBe(true);
    expect(atras.compareDocumentPosition(ficha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(screen.getByRole('main')).getAllByRole('button')[0]).toBe(atras);
    // Ya no existe el botón de texto del final.
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Ver toda la ropa en el local' })).not.toBeInTheDocument();
  });

  it('la flechita está en la ficha de un cliente y en la boleta, pero no en el inicio del mostrador', async () => {
    await abrirConRopaLista();
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Volver al mostrador' })).not.toBeInTheDocument();

    await elegirEnBuscador('rosa', /Rosa Quispe/);
    await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });
    expect(boton('Volver al mostrador')).toBeInTheDocument();
  });

  it('registrando, "Volver al mostrador sin guardar" va arriba del formulario, no al final', async () => {
    await abrirConRopaLista();
    fireEvent.click(boton('Registrar ropa'));
    await elegirEnBuscador('zz', 'Cliente nuevo');
    const formulario = await screen.findByRole('form', { name: 'Datos de la ropa' });

    const volver = boton('Volver al mostrador sin guardar');
    expect(esFlechita(volver)).toBe(true);
    expect(volver.compareDocumentPosition(formulario) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Mostrador: lo que deja el cliente en varias líneas — SPEC-KRILINXI-058', () => {
  it('la tarjeta de la boleta y su detalle respetan los saltos de línea de lo que dejó', async () => {
    simularApi(() => 'sin-conexion');
    const prueba = await baseLocalDePrueba();
    const MUCHAS = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000030', descripcion: '2 camisas\n1 pantalón azul' });
    await prueba.sembrar('clientes', [ROSA]);
    await prueba.sembrar('ordenes', [MUCHAS]);
    renderEnRuta(<App />, '/mostrador', { baseLocal: prueba.control });

    // En la lista: la tarjeta de la boleta.
    const tarjeta = await screen.findByRole('button', { name: 'Boleta 000030, Rosa Quispe' });
    expect(within(tarjeta).getByText(/2 camisas/)).toHaveClass('whitespace-pre-line');

    // Y en el detalle de la boleta.
    fireEvent.click(tarjeta);
    const detalle = await screen.findByRole('region', { name: 'Boleta 000030' });
    expect(within(detalle).getByText(/2 camisas/).closest('dd')).toHaveClass('whitespace-pre-line');
  });
});
