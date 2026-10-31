import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { elegirEnBuscador, escribirEnBuscador } from '../../../test/buscador';
import { hoyEnBolivia } from '../../../lib/diaDelNegocio';
import { CARNET_INVALIDO, TELEFONO_INVALIDO } from '../../clientes/api/clientesLocal';
import { MENSAJES } from '../../ordenes/api/ordenesLocal';
import { sumarDias } from '../../ordenes/components/atajosDeFecha';
import { escribirPrenda, escribirPrendas, renglon } from '../../../test/renglones';
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

/** Elige "Deja adelanto": hasta entonces el formulario no pide ni el importe ni cómo paga (SPEC-KRILINXI-048). */
function dejaAdelanto() {
  fireEvent.click(screen.getByLabelText('Deja adelanto'));
}

/** Busca a Rosa en el formulario y la elige: queda como cliente, sin salir del formulario. */
async function elegirARosa() {
  await elegirEnBuscador('70123456', /Rosa Quispe/);
  return screen.findByRole('form', { name: 'Datos de la ropa' });
}

function cargarRopa(boleta: string) {
  escribir('Número de la boleta', boleta);
  escribirPrenda(1, { que: 'Camisa', precio: '10' });
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
    escribirPrendas([
      { que: 'pantalones', cuantas: '2', precio: '15' },
      { que: 'saco', precio: '20' },
    ]);
    escribir('Para cuándo estará lista (si se sabe)', '2026-10-10');
    dejaAdelanto();
    escribir('Cuánto deja de adelanto (Bs)', '20,50');
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
      ['PUT', 'orden_items'],
      ['PUT', 'orden_items'],
      ['PUT', 'pagos'],
    ]);
    expect(servidor.pedidos).toEqual([]);
  });

  it('sin adelanto ni fecha, el resumen lo dice en palabras', async () => {
    await abrir();
    await elegirARosa();
    escribir('Número de la boleta', '001235');
    escribirPrenda(1, { que: 'Un vestido', precio: '30' });
    await guardar();

    expect(await resumen()).toMatchObject({ Adelanto: 'No dejó', 'Falta pagar': 'Bs 30,00', 'Estará lista': 'Sin fecha' });
  });

  it('pregunta cómo paga solo cuando hay adelanto', async () => {
    await abrir();
    await elegirARosa();
    expect(screen.queryByRole('group', { name: '¿Cómo paga el adelanto?' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cuánto deja de adelanto (Bs)')).not.toBeInTheDocument();
    dejaAdelanto();
    expect(screen.getByLabelText('Cuánto deja de adelanto (Bs)')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '¿Cómo paga el adelanto?' })).toBeInTheDocument();
  });

  it('el adelanto se pregunta primero: sin elegir "Deja adelanto" no hay importe ni forma de pago — SPEC-KRILINXI-048', async () => {
    await abrir();
    await elegirARosa();
    expect(screen.getByLabelText('No deja adelanto')).toBeChecked();

    // Al volver a "No deja adelanto" se ocultan, y lo escrito no se guarda.
    dejaAdelanto();
    escribir('Cuánto deja de adelanto (Bs)', '10');
    fireEvent.click(screen.getByLabelText('No deja adelanto'));
    expect(screen.queryByLabelText('Cuánto deja de adelanto (Bs)')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '¿Cómo paga el adelanto?' })).not.toBeInTheDocument();
  });

  it('guardar sin adelanto crea solo la orden, aunque se haya escrito un adelanto y se haya arrepentido — SPEC-KRILINXI-048', async () => {
    const { db } = await abrir();
    await elegirARosa();
    cargarRopa('001260');
    dejaAdelanto();
    escribir('Cuánto deja de adelanto (Bs)', '4');
    fireEvent.click(screen.getByLabelText('Efectivo'));
    fireEvent.click(screen.getByLabelText('No deja adelanto'));
    await guardar();

    expect(await resumen()).toMatchObject({ Adelanto: 'No dejó', 'Falta pagar': 'Bs 10,00' });
    expect(await cola(db)).toEqual([['PUT', 'ordenes'], ['PUT', 'orden_items']]);
  });

  it('si elige "Deja adelanto" y no escribe el importe, lo dice y no guarda nada — SPEC-KRILINXI-048', async () => {
    const { db } = await abrir();
    await elegirARosa();
    cargarRopa('001261');
    dejaAdelanto();
    await guardar();

    expect(await screen.findByText('Escribe cuánto deja de adelanto, o elige «No deja adelanto».')).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('los atajos de fecha llenan "Para cuándo estará lista" con el día de Bolivia — SPEC-KRILINXI-048', async () => {
    await abrir();
    await elegirARosa();
    const campo = screen.getByLabelText('Para cuándo estará lista (si se sabe)');
    const atajos = within(screen.getByRole('group', { name: 'Para cuándo, en un toque' }));
    expect(atajos.getAllByRole('button').map((b) => b.textContent)).toEqual(['Mañana', 'En 3 días', 'En una semana']);

    for (const [texto, dias] of [['Mañana', 1], ['En 3 días', 3], ['En una semana', 7]] as const) {
      fireEvent.click(atajos.getByRole('button', { name: texto }));
      expect(campo).toHaveValue(sumarDias(hoyEnBolivia(), dias));
    }
    // El selector sigue sirviendo para cualquier otra fecha.
    escribir('Para cuándo estará lista (si se sabe)', '2026-12-24');
    expect(campo).toHaveValue('2026-12-24');
  });

  it('"Cambiar de cliente" vuelve al buscador, y al elegir de nuevo la ropa escrita sigue ahí — SPEC-KRILINXI-057', async () => {
    await abrir();
    await elegirARosa();
    fireEvent.change(within(renglon(1)).getByLabelText('Qué es'), { target: { value: 'Camisa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de cliente' }));
    expect(await screen.findByRole('combobox', { name: /Buscar cliente/ })).toHaveValue('');
    // Mientras se elige cliente no se ve la boleta (ni se puede guardar)…
    expect(screen.queryByRole('group', { name: 'Prenda 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    // …pero lo escrito no se pierde.
    await elegirARosa();
    expect(within(renglon(1)).getByLabelText('Qué es')).toHaveValue('Camisa');
  });
});

describe('Registrar ropa: lo que se corrige en pantalla — SPEC-KRILINXI-006 y SPEC-KRILINXI-034', () => {
  it('avisa de la boleta repetida en la sucursal y no guarda', async () => {
    const { db } = await abrir();
    await elegirARosa();
    cargarRopa('000999');
    await guardar();

    expect(
      await screen.findByText('Ese número de boleta ya está usado en esta sucursal. Revisa el papel y vuelve a escribirlo.'),
    ).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('marca cada campo que falta, todos a la vez, también los del cliente nuevo', async () => {
    await abrir();
    // Sin cliente no hay qué guardar (SPEC-KRILINXI-057): con uno nuevo en blanco, falta todo.
    await elegirEnBuscador('zz', 'Cliente nuevo');
    await guardar();

    expect(await screen.findByText('Escribe el número de teléfono del cliente.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el número de la boleta.')).toBeInTheDocument();
    // Lo que deja, en su prenda (SPEC-KRILINXI-068): la cantidad ya viene en 1, así que faltan qué es y su precio.
    expect(screen.getByText('Escribe qué es, por ejemplo «Camisa» o «Edredón».')).toBeInTheDocument();
    expect(screen.getByText('Escribe el precio de cada una con números, por ejemplo 15 o 15,50.')).toBeInTheDocument();
  });

  it('con un adelanto mayor que el total no guarda nada', async () => {
    const { db } = await abrir();
    await elegirARosa();
    cargarRopa('001237');
    dejaAdelanto();
    escribir('Cuánto deja de adelanto (Bs)', '15');
    fireEvent.click(screen.getByLabelText('Efectivo'));
    await guardar();

    expect(await screen.findByText('El adelanto no puede ser mayor que el total.')).toBeInTheDocument();
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
    // El alta antes que la orden, y la orden antes que su renglón (SPEC-KRILINXI-068): el servidor no puede recibir
    // ropa de un cliente que no conoce, ni un renglón de una boleta que no tiene.
    expect(await cola(db)).toEqual([
      ['PUT', 'clientes'],
      ['PUT', 'ordenes'],
      ['PUT', 'orden_items'],
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

    expect(await screen.findByText('Escribe el nombre del cliente.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el número de teléfono del cliente.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el número de la boleta.')).toBeInTheDocument();
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
    expect(await cola(db)).toEqual([['PUT', 'ordenes'], ['PUT', 'orden_items']]);
  });

  it('el botón de la tarjeta del cliente nuevo dice "Atrás" (y no "Buscar un cliente que ya existe") y vuelve a elegir sin guardar nada — SPEC-KRILINXI-057', async () => {
    const { db } = await abrir();
    await elegirEnBuscador('zz', 'Cliente nuevo');
    expect(screen.queryByRole('button', { name: 'Buscar un cliente que ya existe' })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Atrás' }));

    expect(await screen.findByRole('combobox', { name: /Buscar cliente/ })).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
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

  it('/registrar-ropa lleva al Mostrador y empieza por elegir al cliente, sin la boleta todavía', async () => {
    await abrir();
    expect(screen.getByRole('heading', { name: 'Mostrador', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Buscar cliente/ })).toBeInTheDocument();
    // SPEC-KRILINXI-057: ni los datos de la boleta ni "Guardar" hasta que haya un cliente.
    expect(screen.queryByRole('form', { name: 'Datos de la ropa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('"Volver al mostrador sin guardar" no guarda nada, y con algo escrito pide confirmar antes', async () => {
    const { db } = await abrir();
    await elegirARosa();
    cargarRopa('001243');
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mostrador sin guardar' }));

    const aviso = await screen.findByRole('dialog');
    expect(within(aviso).getByText('¿Salir sin guardar?')).toBeInTheDocument();
    expect(within(aviso).getByText(/Se pierde lo que escribiste/)).toBeInTheDocument();
    fireEvent.click(within(aviso).getByRole('button', { name: 'Sí, salir' }));
    expect(await screen.findByRole('heading', { name: 'Ropa en el local' })).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('cancelar la confirmación deja el formulario como estaba — SPEC-KRILINXI-048', async () => {
    await abrir();
    await elegirARosa();
    cargarRopa('001244');
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mostrador sin guardar' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Seguir escribiendo' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Número de la boleta')).toHaveValue('001244');
    expect(within(renglon(1)).getByLabelText('Qué es')).toHaveValue('Camisa');
  });

  it('con el formulario vacío, volver no pregunta nada — SPEC-KRILINXI-048', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mostrador sin guardar' }));

    expect(await screen.findByRole('heading', { name: 'Ropa en el local' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el cliente que ya viene de su ficha no cuenta como escrito: volver no pregunta — SPEC-KRILINXI-048', async () => {
    await abrir('/mostrador');
    await elegirEnBuscador('rosa', /Rosa Quispe/);
    await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Registrar ropa' }));
    await screen.findByRole('form', { name: 'Datos de la ropa' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mostrador sin guardar' }));

    expect(await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un cliente elegido a mano cuenta como escrito: volver pregunta aunque no se haya cargado la ropa — SPEC-KRILINXI-048', async () => {
    await abrir();
    await elegirARosa();
    // Rosa se eligió en el buscador (el formulario no la traía de una ficha), así que se perdería.
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mostrador sin guardar' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('un ADMIN que no está atendiendo ve cómo empezar, no el formulario (SPEC-KRILINXI-029)', async () => {
    renderEnRuta(<App />, '/registrar-ropa', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    expect(await screen.findByText(/elige en qué sucursal vas a atender/)).toBeInTheDocument();
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
    await screen.findByText('Escribe el número de la boleta.');
    sinJerga();

    cargarRopa('001238');
    dejaAdelanto();
    escribir('Cuánto deja de adelanto (Bs)', '5');
    fireEvent.click(screen.getByLabelText('Tarjeta'));
    await guardar();
    await screen.findByText('Ropa registrada con la boleta 001238.');
    sinJerga();
  });
});

describe('Registrar ropa: elegir al cliente primero y guardar al final — SPEC-KRILINXI-057', () => {
  it('con un cliente elegido hay un solo "Guardar", y es el último control de la boleta', async () => {
    await abrir();
    const formulario = await elegirARosa();

    const guardares = within(formulario).getAllByRole('button', { name: 'Guardar' });
    expect(guardares).toHaveLength(1);
    const controles = within(formulario).getAllByRole('button');
    expect(controles.at(-1)).toBe(guardares[0]);
    // Es el que envía el formulario; los demás (atajos, cambiar de cliente…) no envían.
    expect(guardares[0]).toHaveAttribute('type', 'submit');
    expect(controles.filter((c) => c.getAttribute('type') === 'submit')).toHaveLength(1);
  });

  it('el cliente nuevo se escribe en la misma boleta y todo se guarda junto, al final: alta, ropa y adelanto o nada', async () => {
    const { db } = await abrir();
    await elegirEnBuscador('Beto Mamani', 'Cliente nuevo');
    escribir('Teléfono', '71111111');
    cargarRopa('001300');
    dejaAdelanto();
    escribir('Cuánto deja de adelanto (Bs)', '4');
    fireEvent.click(screen.getByLabelText('Efectivo'));
    // Hasta apretar "Guardar" no se escribe nada: ni el cliente, ni la ropa, ni el adelanto.
    expect(await db.getCrudBatch()).toBeNull();
    await guardar();

    expect(await resumen()).toMatchObject({ Cliente: 'Beto Mamani' });
    expect(await cola(db)).toEqual([['PUT', 'clientes'], ['PUT', 'ordenes'], ['PUT', 'orden_items'], ['PUT', 'pagos']]);
  });

  it('salir pregunta solo si ya se eligió o escribió algo: en el primer paso, vuelve directo', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mostrador sin guardar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Mostrador', level: 1 })).toBeInTheDocument();
  });

  it('sin jerga en ninguno de los dos pasos', async () => {
    await abrir();
    sinJerga();
    await elegirARosa();
    sinJerga();
  });
});

/**
 * El visto de cada campo y de cada tarjeta, con reglas de verdad — SPEC-KRILINXI-058. Lo que se ve bien tiene que ser lo que
 * el guardado acepta: un texto en el número de boleta o en el teléfono ya no pasa por bueno. La revisión espera una pausa
 * entre teclas, así que lo que cambia se espera con findBy / waitFor.
 */
describe('Registrar ropa: el visto de cada campo y de cada tarjeta — SPEC-KRILINXI-058', () => {
  const tarjeta = (nombre: string) => within(screen.getByRole('region', { name: nombre }));
  const campo = (etiqueta: string) => screen.getByLabelText(etiqueta);
  const salirDe = (etiqueta: string) => fireEvent.blur(campo(etiqueta));
  const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

  it('un número de boleta con letras y sin ningún número no pasa por bueno: sin visto, y el error al salir del campo', async () => {
    await abrir();
    await elegirARosa();

    escribir('Número de la boleta', 'abc');
    salirDe('Número de la boleta');

    expect(await screen.findByText(MENSAJES.boletaInvalida)).toBeInTheDocument();
    expect(campo('Número de la boleta')).toHaveAccessibleDescription(MENSAJES.boletaInvalida);
    expect(await tarjeta('La ropa').findByText('Hay datos para corregir')).toBeInTheDocument();
  });

  it('un número de boleta bien escrito muestra su visto (con el texto "Correcto" para el lector de pantalla)', async () => {
    await abrir();
    await elegirARosa();

    escribir('Número de la boleta', 'B-1003');
    await waitFor(() => expect(campo('Número de la boleta')).toHaveAccessibleDescription('Correcto'));
  });

  it('no regaña mientras se escribe: el error aparece al salir del campo, no antes', async () => {
    await abrir();
    await elegirARosa();

    escribir('Número de la boleta', 'abc');
    await esperar(350);
    expect(screen.queryByText(MENSAJES.boletaInvalida)).not.toBeInTheDocument();
    expect(tarjeta('La ropa').queryByText('Hay datos para corregir')).not.toBeInTheDocument();
  });

  it('una boleta ya usada en la sucursal no tiene visto: es la misma regla que al guardar', async () => {
    await abrir();
    await elegirARosa();

    escribir('Número de la boleta', '000999');
    salirDe('Número de la boleta');

    expect(await screen.findByText(MENSAJES.boletaOcupada)).toBeInTheDocument();
  });

  it('la tarjeta de la ropa marca el visto cuando boleta, qué deja y precio están bien, y lo quita si algo deja de estarlo', async () => {
    await abrir();
    await elegirARosa();
    expect(tarjeta('La ropa').queryByText('Completo')).not.toBeInTheDocument();

    cargarRopa('001301');
    expect(await tarjeta('La ropa').findByText('Completo')).toBeInTheDocument();

    fireEvent.change(within(renglon(1)).getByLabelText('Precio de cada una (Bs)'), { target: { value: 'mucho' } });
    await waitFor(() => expect(tarjeta('La ropa').queryByText('Completo')).not.toBeInTheDocument());
  });

  it('un cliente que ya existe es una tarjeta completa desde que se elige', async () => {
    await abrir();
    await elegirARosa();
    expect(tarjeta('Cliente').getByText('Completo')).toBeInTheDocument();
  });

  it('el cliente nuevo: teléfono con letras o carnet que no lo es muestran su error, y bien escritos completan la tarjeta', async () => {
    await abrir();
    await elegirEnBuscador('Beto Mamani', 'Cliente nuevo');

    escribir('Teléfono', '7012345a');
    salirDe('Teléfono');
    expect(await screen.findByText(TELEFONO_INVALIDO)).toBeInTheDocument();
    expect(await tarjeta('Cliente nuevo').findByText('Hay datos para corregir')).toBeInTheDocument();

    escribir('Teléfono', '7111 1111');
    escribir('Carnet (si lo da)', 'abcdefg');
    salirDe('Carnet (si lo da)');
    expect(await screen.findByText(CARNET_INVALIDO)).toBeInTheDocument();
    expect(tarjeta('Cliente nuevo').queryByText('Completo')).not.toBeInTheDocument();

    escribir('Carnet (si lo da)', '1234567 LP');
    expect(await tarjeta('Cliente nuevo').findByText('Completo')).toBeInTheDocument();
    expect(screen.queryByText(CARNET_INVALIDO)).not.toBeInTheDocument();
    await waitFor(() => expect(campo('Teléfono')).toHaveAccessibleDescription('Correcto'));
    expect(campo('Nombre completo')).toHaveAccessibleDescription('Correcto');
  });

  it('el carnet es opcional: vacío no estorba para completar la tarjeta del cliente nuevo', async () => {
    await abrir();
    await elegirEnBuscador('Beto Mamani', 'Cliente nuevo');
    escribir('Teléfono', '71111111');
    expect(await tarjeta('Cliente nuevo').findByText('Completo')).toBeInTheDocument();
    expect(campo('Carnet (si lo da)')).not.toHaveAccessibleDescription('Correcto');
  });

  it('un teléfono que ya es de otro cliente no completa la tarjeta', async () => {
    await abrir();
    await elegirEnBuscador('Otra Persona', 'Cliente nuevo');
    escribir('Teléfono', '7012 3456');
    await esperar(350);
    expect(tarjeta('Cliente nuevo').queryByText('Completo')).not.toBeInTheDocument();
    expect(campo('Teléfono')).not.toHaveAccessibleDescription('Correcto');
  });

  it('el adelanto: la tarjeta se completa con el importe y cómo paga; sin eso, no', async () => {
    await abrir();
    await elegirARosa();
    // "No deja adelanto" (lo de siempre): no hay nada que completar, y la tarjeta no marca nada.
    expect(tarjeta('Adelanto').queryByText('Completo')).not.toBeInTheDocument();

    dejaAdelanto();
    escribir('Cuánto deja de adelanto (Bs)', '4');
    cargarRopa('001302');
    await esperar(350);
    expect(tarjeta('Adelanto').queryByText('Completo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Efectivo'));
    expect(await tarjeta('Adelanto').findByText('Completo')).toBeInTheDocument();
  });

  it('al intentar guardar con un número de boleta de letras, no guarda, lo dice y marca la tarjeta', async () => {
    const { db } = await abrir();
    await elegirARosa();
    cargarRopa('abc');
    await guardar();

    expect(await screen.findByText(MENSAJES.boletaInvalida)).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
    expect(await tarjeta('La ropa').findByText('Hay datos para corregir')).toBeInTheDocument();
  });

  it('arreglar el campo después de un intento quita su error enseguida, sin tener que guardar de nuevo', async () => {
    await abrir();
    await elegirARosa();
    cargarRopa('abc');
    await guardar();
    expect(await screen.findByText(MENSAJES.boletaInvalida)).toBeInTheDocument();

    escribir('Número de la boleta', '001303');
    await waitFor(() => expect(screen.queryByText(MENSAJES.boletaInvalida)).not.toBeInTheDocument());
    expect(await tarjeta('La ropa').findByText('Completo')).toBeInTheDocument();
  });

  it('el visto y la marca no dependen solo del color: llevan ícono y texto', async () => {
    await abrir();
    await elegirARosa();
    cargarRopa('001304');
    // El texto (para el lector de pantalla) está dentro de la marca, que es la que lleva el ícono y el título.
    const marca = (await tarjeta('La ropa').findByText('Completo')).parentElement;
    expect(marca?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(marca).toHaveAttribute('title', 'Completo');
  });
});

describe('Registrar ropa renglón por renglón — SPEC-KRILINXI-068', () => {
  it('arranca con una prenda, suma el subtotal de cada una y el total, y ya no deja escribir el total a mano', async () => {
    await abrir();
    await elegirARosa();
    expect(screen.queryByLabelText('Precio (Bs)')).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: /^Prenda \d+$/ })).toHaveLength(1);
    // La cantidad ya viene en 1: casi siempre es una.
    expect(within(renglon(1)).getByLabelText('Cuántas')).toHaveValue('1');

    escribirPrendas([
      { que: 'Camisa', cuantas: '2', precio: '15' },
      { que: 'Ropa por kilo', cuantas: '2,5', precio: '3,33' },
    ]);

    expect(within(renglon(1)).getByText('Bs 30,00')).toBeInTheDocument();
    // 2,5 × 3,33 = 8,325: se redondea al centavo, como en el servidor.
    expect(within(renglon(2)).getByText('Bs 8,33')).toBeInTheDocument();
    expect(screen.getByText(/^Total:/)).toHaveTextContent('Total: Bs 38,33');
  });

  it('guarda la orden con el total y la descripción armada, y sus renglones después, en una sola vez', async () => {
    const { db } = await abrir();
    await elegirARosa();
    escribir('Número de la boleta', '001305');
    escribirPrendas([
      { que: 'Camisa', cuantas: '2', precio: '15' },
      { que: 'Edredón king', precio: '35,50' },
    ]);
    await guardar();

    expect(await resumen()).toMatchObject({ Ropa: '2 Camisa, 1 Edredón king', Precio: 'Bs 65,50' });
    const operaciones = (await db.getCrudBatch(100))?.crud ?? [];
    expect(operaciones.map((c) => c.table)).toEqual(['ordenes', 'orden_items', 'orden_items']);
    expect(operaciones[0]?.opData).toMatchObject({ precio_total: '65.50', descripcion: '2 Camisa, 1 Edredón king' });
    expect(operaciones[2]?.opData).toMatchObject({ momento: 'INGRESO', posicion: 1, descripcion: 'Edredón king' });
  });

  it('una prenda se puede quitar, pero la última no: siempre hay al menos una', async () => {
    await abrir();
    await elegirARosa();
    expect(within(renglon(1)).queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument();

    escribirPrendas([
      { que: 'Camisa', precio: '10' },
      { que: 'Saco', precio: '20' },
    ]);
    fireEvent.click(within(renglon(1)).getByRole('button', { name: 'Quitar' }));

    expect(screen.getAllByRole('group', { name: /^Prenda \d+$/ })).toHaveLength(1);
    expect(within(renglon(1)).getByLabelText('Qué es')).toHaveValue('Saco');
    expect(screen.getByText(/^Total:/)).toHaveTextContent('Total: Bs 20,00');
  });

  it('cada campo mal escrito dice qué hacer, en su prenda, al intentar guardar', async () => {
    const { db } = await abrir();
    await elegirARosa();
    escribir('Número de la boleta', '001306');
    escribirPrenda(1, { que: '', cuantas: '0', precio: 'quince' });
    await guardar();

    const prenda = within(renglon(1));
    expect(await prenda.findByText('Escribe qué es, por ejemplo «Camisa» o «Edredón».')).toBeInTheDocument();
    expect(prenda.getByText('Escribe cuántas son, con números mayores que cero, por ejemplo 2 o 2,5.')).toBeInTheDocument();
    expect(prenda.getByText('Escribe el precio de cada una con números, por ejemplo 15 o 15,50.')).toBeInTheDocument();
    expect((await db.getCrudBatch(100))?.crud ?? []).toEqual([]);
  });

  it('el adelanto no puede pasar del total de las prendas', async () => {
    await abrir();
    await elegirARosa();
    cargarRopa('001307');
    dejaAdelanto();
    escribir('Cuánto deja de adelanto (Bs)', '10,01');
    fireEvent.click(screen.getByLabelText('Efectivo'));
    await guardar();

    expect(await screen.findByText(MENSAJES.adelantoMayor)).toBeInTheDocument();
  });

  it('una prenda escrita cuenta como algo escrito: volver sin guardar pregunta antes', async () => {
    await abrir();
    await elegirARosa();
    fireEvent.change(within(renglon(1)).getByLabelText('Qué es'), { target: { value: 'Camisa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mostrador sin guardar' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
