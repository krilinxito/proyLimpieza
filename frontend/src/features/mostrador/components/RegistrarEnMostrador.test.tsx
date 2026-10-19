import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { elegirEnBuscador, escribirEnBuscador } from '../../../test/buscador';
import { sinJerga } from '../../../test/jerga';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';

/**
 * Registrar ropa en el Mostrador, de punta a punta: la App entera, la base local de verdad y el
 * servidor "sin internet" — SPEC-KRILINXI-034.
 *
 * Los recorridos de SPEC-KRILINXI-006 vivían en /registrar-ropa; se reescribieron acá y conservan
 * su etiqueta, para que `grep SPEC-KRILINXI-006` los siga encontrando.
 */
const EMPLEADA = sesionDePrueba();
const ROSA = { id: randomUUID(), nombre: 'Rosa Quispe', telefono: '70123456' };

/** El Mostrador con el formulario abierto, como queda al entrar por /registrar-ropa. */
async function abrir(ruta = '/registrar-ropa') {
  const servidor = simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  await prueba.sembrar('ordenes', [
    { id: randomUUID(), sucursal_id: EMPLEADA.usuario.sucursalId, numero_boleta: '000999', cliente_id: ROSA.id },
  ]);
  renderEnRuta(<App />, ruta, { sesion: EMPLEADA, baseLocal: prueba.control });
  await escribirEnBuscador('');
  return { ...prueba, servidor };
}

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

/** Busca a Rosa en el formulario y la elige: queda como cliente, sin salir del formulario. */
async function elegirARosa() {
  await elegirEnBuscador('70123456', /Rosa Quispe/);
  return screen.findByRole('form', { name: 'Datos de la ropa' });
}

function cargarRopa(boleta: string) {
  escribir('Número de la boleta', boleta);
  escribir('Qué ropa deja', 'Camisa');
  escribir('Precio (Bs)', '10');
}

async function guardar() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
}

/**
 * El resumen final como { dato: valor }. Espera primero el aviso de éxito: hasta entonces en
 * pantalla está la tarjeta del cliente, que también es una lista de datos.
 */
async function resumen() {
  await screen.findByText(/^Ropa registrada con la boleta/);
  const terminos = screen.getAllByRole('term').map((t) => t.textContent);
  const valores = screen.getAllByRole('definition').map((d) => d.textContent);
  return Object.fromEntries(terminos.map((t, i) => [t, valores[i]]));
}

/** La cola de subida como [operación, tabla]: lo que le va a llegar al servidor, en orden. */
async function cola(db: Awaited<ReturnType<typeof abrir>>['db']) {
  return ((await db.getCrudBatch(100))?.crud ?? []).map((c) => [c.op, c.table]);
}

describe('Registrar ropa: el recorrido — SPEC-KRILINXI-006 y SPEC-KRILINXI-034', () => {
  it('busca al cliente, carga la ropa con adelanto y muestra el resumen en Bs, sin internet', async () => {
    const { db, servidor } = await abrir();
    const formulario = await elegirARosa();
    expect(within(formulario).getByText('Rosa Quispe')).toBeInTheDocument();

    escribir('Número de la boleta', '001234');
    escribir('Qué ropa deja', '2 pantalones, 1 saco');
    escribir('Precio (Bs)', '50');
    escribir('Para cuándo estará lista (si se sabe)', '2026-10-10');
    escribir('Cuánto deja de adelanto (Bs, si deja)', '20,50');
    fireEvent.click(screen.getByLabelText('Pago con QR'));
    await guardar();

    expect(await screen.findByText('Ropa registrada con la boleta 001234.')).toBeInTheDocument();
    expect(await resumen()).toEqual({
      Boleta: '001234',
      Cliente: 'Rosa Quispe',
      Ropa: '2 pantalones, 1 saco',
      Precio: 'Bs 50,00',
      Adelanto: 'Bs 20,50',
      'Falta pagar': 'Bs 29,50',
      'Estará lista': '10/10/2026',
    });
    expect(await cola(db)).toEqual([
      ['PUT', 'ordenes'],
      ['PUT', 'pagos'],
    ]);
    expect(servidor.pedidos).toEqual([]);
  });

  it('sin adelanto ni fecha, el resumen lo dice en palabras', async () => {
    await abrir();
    await elegirARosa();
    escribir('Número de la boleta', '001235');
    escribir('Qué ropa deja', 'Un vestido');
    escribir('Precio (Bs)', '30');
    await guardar();

    expect(await resumen()).toMatchObject({ Adelanto: 'No dejó', 'Falta pagar': 'Bs 30,00', 'Estará lista': 'Sin fecha' });
  });

  it('pregunta cómo paga solo cuando hay adelanto', async () => {
    await abrir();
    await elegirARosa();
    expect(screen.queryByRole('group', { name: '¿Cómo paga el adelanto?' })).not.toBeInTheDocument();
    escribir('Cuánto deja de adelanto (Bs, si deja)', '10');
    expect(screen.getByRole('group', { name: '¿Cómo paga el adelanto?' })).toBeInTheDocument();
  });

  it('"Cambiar de cliente" vuelve al buscador sin perder la ropa escrita', async () => {
    await abrir();
    await elegirARosa();
    escribir('Qué ropa deja', 'Camisa');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de cliente' }));
    expect(await screen.findByRole('combobox', { name: /Buscar cliente/ })).toHaveValue('');
    expect(screen.getByLabelText('Qué ropa deja')).toHaveValue('Camisa');
  });
});

describe('Registrar ropa: lo que se corrige en pantalla — SPEC-KRILINXI-006 y SPEC-KRILINXI-034', () => {
  it('avisa de la boleta repetida en la sucursal y no guarda', async () => {
    const { db } = await abrir();
    await elegirARosa();
    cargarRopa('000999');
    await guardar();

    expect(
      await screen.findByText('Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo.'),
    ).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('marca cada campo que falta, todos a la vez, también el cliente', async () => {
    await abrir();
    await guardar();

    expect(await screen.findByText('Falta elegir el cliente que deja la ropa.')).toBeInTheDocument();
    expect(screen.getByText('Escribí el número de la boleta.')).toBeInTheDocument();
    expect(screen.getByText('Escribí qué ropa deja el cliente.')).toBeInTheDocument();
    expect(screen.getByText('Escribí el precio con números, por ejemplo 25 o 25,50.')).toBeInTheDocument();
  });

  it('con un adelanto mayor que el precio no guarda nada', async () => {
    const { db } = await abrir();
    await elegirARosa();
    cargarRopa('001237');
    escribir('Cuánto deja de adelanto (Bs, si deja)', '15');
    fireEvent.click(screen.getByLabelText('Efectivo'));
    await guardar();

    expect(await screen.findByText('El adelanto no puede ser mayor que el precio.')).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });
});

describe('Registrar ropa con un cliente nuevo — SPEC-KRILINXI-034', () => {
  it('"Cliente nuevo" despliega sus datos en el mismo formulario, con lo escrito, y se guarda todo junto', async () => {
    const { db } = await abrir();
    await elegirEnBuscador('71111111', 'Cliente nuevo');
    const formulario = await screen.findByRole('form', { name: 'Datos de la ropa' });
    const nuevo = within(formulario).getByRole('region', { name: 'Cliente nuevo' });
    expect(within(nuevo).getByLabelText('Teléfono')).toHaveValue('71111111');

    fireEvent.change(within(nuevo).getByLabelText('Nombre completo'), { target: { value: 'Juan Mamani' } });
    cargarRopa('001240');
    await guardar();

    expect(await resumen()).toMatchObject({ Boleta: '001240', Cliente: 'Juan Mamani' });
    // El alta antes que la orden: el servidor no puede recibir ropa de un cliente que no conoce.
    expect(await cola(db)).toEqual([
      ['PUT', 'clientes'],
      ['PUT', 'ordenes'],
    ]);
  });

  it('si lo escrito es un nombre, va al nombre', async () => {
    await abrir();
    await elegirEnBuscador('Juan Nuevo', 'Cliente nuevo');
    expect(await screen.findByLabelText('Nombre completo')).toHaveValue('Juan Nuevo');
  });

  it('los datos del cliente nuevo que faltan se marcan junto con los de la ropa, y no se guarda nada', async () => {
    const { db } = await abrir();
    await elegirEnBuscador('zz', 'Cliente nuevo');
    escribir('Nombre completo', '');
    await guardar();

    expect(await screen.findByText('Escribí el nombre del cliente.')).toBeInTheDocument();
    expect(screen.getByText('Escribí el número de teléfono del cliente.')).toBeInTheDocument();
    expect(screen.getByText('Escribí el número de la boleta.')).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('si el teléfono ya es de otro cliente, lo dice y ofrece elegir a ese, sin perder la ropa', async () => {
    const { db } = await abrir();
    await elegirEnBuscador('Otra Persona', 'Cliente nuevo');
    escribir('Teléfono', '7012 3456');
    cargarRopa('001241');
    await guardar();

    expect(await screen.findByText(/Ese teléfono ya es de Rosa Quispe/)).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Es Rosa Quispe' }));
    expect(screen.getByLabelText('Número de la boleta')).toHaveValue('001241');
    await guardar();
    expect(await resumen()).toMatchObject({ Cliente: 'Rosa Quispe' });
    expect(await cola(db)).toEqual([['PUT', 'ordenes']]);
  });

  it('"Buscar un cliente que ya existe" vuelve al buscador', async () => {
    await abrir();
    await elegirEnBuscador('zz', 'Cliente nuevo');
    fireEvent.click(await screen.findByRole('button', { name: 'Buscar un cliente que ya existe' }));
    expect(await screen.findByRole('combobox', { name: /Buscar cliente/ })).toBeInTheDocument();
  });
});

describe('Registrar ropa desde el Mostrador — SPEC-KRILINXI-034', () => {
  it('el Mostrador tiene "Registrar ropa" a mano, y el menú ya no la lista aparte', async () => {
    await abrir('/mostrador');
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Registrar ropa' })).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: 'Menú principal' });
    expect(within(menu).queryByRole('link', { name: 'Registrar ropa' })).not.toBeInTheDocument();
  });

  it('desde la ficha de un cliente, "Registrar ropa" lo trae ya elegido', async () => {
    await abrir('/mostrador');
    await elegirEnBuscador('rosa', /Rosa Quispe/);
    await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Registrar ropa' }));

    const formulario = await screen.findByRole('form', { name: 'Datos de la ropa' });
    expect(within(formulario).getByText('Rosa Quispe', { selector: 'dd' })).toBeInTheDocument();
    expect(within(formulario).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('al guardar, del resumen se va a la ficha del cliente con la boleta nueva abierta', async () => {
    await abrir();
    await elegirARosa();
    cargarRopa('001242');
    await guardar();
    await resumen();

    fireEvent.click(screen.getByRole('button', { name: 'Ver la boleta en la ficha de Rosa Quispe' }));
    const ficha = await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });
    expect(await within(ficha).findByRole('region', { name: 'Boleta 001242' })).toBeInTheDocument();
  });

  it('/registrar-ropa lleva al Mostrador con el formulario abierto', async () => {
    await abrir();
    expect(screen.getByRole('heading', { name: 'Mostrador', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Datos de la ropa' })).toBeInTheDocument();
  });

  it('"Volver al mostrador sin guardar" no guarda nada', async () => {
    const { db } = await abrir();
    await elegirARosa();
    cargarRopa('001243');
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mostrador sin guardar' }));
    expect(await screen.findByRole('heading', { name: 'Ropa en el local' })).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('un ADMIN que no está atendiendo ve cómo empezar, no el formulario (SPEC-KRILINXI-029)', async () => {
    renderEnRuta(<App />, '/registrar-ropa', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    expect(await screen.findByText(/elegí en qué sucursal vas a atender/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Buscar cliente/ })).not.toBeInTheDocument();
  });
});

describe('Registrar ropa: el idioma del mostrador — SPEC-KRILINXI-006 y SPEC-KRILINXI-034', () => {
  it('ningún paso usa palabras del sistema', async () => {
    await abrir();
    sinJerga();
    await elegirARosa();
    sinJerga();
    await guardar();
    await screen.findByText('Escribí el número de la boleta.');
    sinJerga();

    cargarRopa('001238');
    escribir('Cuánto deja de adelanto (Bs, si deja)', '5');
    fireEvent.click(screen.getByLabelText('Tarjeta'));
    await guardar();
    await screen.findByText('Ropa registrada con la boleta 001238.');
    sinJerga();
  });
});
