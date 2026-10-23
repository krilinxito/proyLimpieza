import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { elegirEnBuscador, escribirEnBuscador } from '../../../test/buscador';
import { sinJerga } from '../../../test/jerga';
import { renderEnRuta } from '../../../test/render';

/**
 * Como en el ingreso, se monta la App entera en /clientes y con la base local de verdad
 * (SQLite de Node): lo que se prueba es el recorrido del empleado, de la ruta al SQL.
 */
const ROSA = { id: randomUUID(), nombre: 'Rosa Quispe', telefono: '70123456', carnet: '4455667' };


async function abrirClientes() {
  const servidor = simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  renderEnRuta(<App />, '/clientes', { baseLocal: prueba.control });
  // El buscador está deshabilitado hasta que la base local termina de abrirse.
  await escribirEnBuscador('');
  return { ...prueba, servidor };
}

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

/** Escribe en el buscador, sin elegir nada (SPEC-KRILINXI-032). */
async function buscar(texto: string) {
  await escribirEnBuscador(texto);
}

/** Escribe y elige al cliente que aparece: Rosa, salvo que se diga otro. */
async function encontrar(texto: string, nombre: RegExp = /Rosa Quispe/) {
  await elegirEnBuscador(texto, nombre);
}

/** La tarjeta de datos del cliente, como pares [dato, valor]. */
async function datosMostrados() {
  const terminos = (await screen.findAllByRole('term')).map((t) => t.textContent);
  const valores = screen.getAllByRole('definition').map((d) => d.textContent);
  return terminos.map((t, i) => [t, valores[i]]);
}

describe('Pantalla de clientes: buscar — SPEC-KRILINXI-005', () => {
  it('muestra nombre, teléfono y carnet del cliente encontrado, sin pedir nada al servidor', async () => {
    const { servidor } = await abrirClientes();
    await encontrar('7012-3456');

    expect(await screen.findByText('Rosa Quispe')).toBeInTheDocument();
    expect(await datosMostrados()).toEqual([
      ['Nombre', 'Rosa Quispe'],
      ['Teléfono', '70123456'],
      ['Carnet', '4455667'],
    ]);
    expect(servidor.pedidos).toEqual([]);
  });

  it('si no lo encuentra, lo dice y ofrece registrarlo con el teléfono ya cargado', async () => {
    await abrirClientes();
    await buscar('7999 9999');

    expect(
      await screen.findByText(/Ningún cliente coincide con eso/, { selector: 'p:not([role])' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Cliente nuevo' }));

    const formulario = await screen.findByRole('form', { name: 'Registrar cliente nuevo' });
    expect(within(formulario).getByLabelText('Teléfono')).toHaveValue('7999 9999');
  });
});

describe('Pantalla de clientes: registrar — SPEC-KRILINXI-005', () => {
  async function abrirAlta(telefono = '71111111') {
    const prueba = await abrirClientes();
    await buscar(telefono);
    fireEvent.click(await screen.findByRole('option', { name: 'Cliente nuevo' }));
    await screen.findByRole('form', { name: 'Registrar cliente nuevo' });
    return prueba;
  }

  it('guarda al cliente en el dispositivo y lo muestra, sin internet', async () => {
    const { db, servidor } = await abrirAlta();
    escribir('Nombre completo', 'Juan Mamani');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));

    expect(await screen.findByText('Cliente registrado.')).toBeInTheDocument();
    expect(await datosMostrados()).toEqual([
      ['Nombre', 'Juan Mamani'],
      ['Teléfono', '71111111'],
      ['Carnet', 'No lo dio'],
    ]);
    expect((await db.getCrudBatch())?.crud).toHaveLength(1);
    expect(servidor.pedidos).toEqual([]);
  });

  it('no guarda sin nombre, y dice qué hacer', async () => {
    const { db } = await abrirAlta();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));

    expect(await screen.findByText('Escribe el nombre del cliente.')).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('si el teléfono que escribe ya es de otro cliente, no guarda y muestra a ese cliente', async () => {
    const { db } = await abrirAlta();
    escribir('Nombre completo', 'Otra Persona');
    escribir('Teléfono', '70 12 34 56');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));

    expect(
      await screen.findByText(
        'Ese teléfono ya está registrado a nombre de Rosa Quispe. No hace falta registrarlo otra vez.',
      ),
    ).toBeInTheDocument();
    expect(await datosMostrados()).toContainEqual(['Nombre', 'Rosa Quispe']);
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('Cancelar cierra el alta sin guardar nada', async () => {
    const { db } = await abrirAlta();
    escribir('Nombre completo', 'Juan');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('form', { name: 'Registrar cliente nuevo' })).not.toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });
});

describe('Pantalla de clientes: el idioma del mostrador — SPEC-KRILINXI-005', () => {
  it('ya no es un hueco en construcción, y ningún paso usa palabras del sistema', async () => {
    await abrirClientes();
    expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument();
    sinJerga();

    await encontrar('70123456');
    await screen.findByText('Rosa Quispe', { selector: 'dd' });
    sinJerga();

    await buscar('71111111');
    fireEvent.click(await screen.findByRole('option', { name: 'Cliente nuevo' }));
    await screen.findByRole('form', { name: 'Registrar cliente nuevo' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await screen.findByText('Escribe el nombre del cliente.');
    sinJerga();

    escribir('Nombre completo', 'Juan Mamani');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await screen.findByText('Cliente registrado.');
    sinJerga();
  });
});

describe('Pantalla de clientes: cambiar datos — SPEC-KRILINXI-014', () => {
  /** Rosa encontrada y el formulario de cambiar datos abierto. */
  async function abrirEdicion() {
    const prueba = await abrirClientes();
    await encontrar('70123456');
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar datos' }));
    await screen.findByRole('form', { name: 'Cambiar datos del cliente' });
    return prueba;
  }

  it('el cliente encontrado tiene "Cambiar datos", que abre el formulario con su nombre y teléfono', async () => {
    await abrirEdicion();

    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Rosa Quispe');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('70123456');
    sinJerga();
  });

  it('guarda sin internet, muestra los datos nuevos al momento y deja el cambio para subir', async () => {
    const { db, servidor } = await abrirEdicion();
    escribir('Nombre completo', 'Rosa Quispe Mamani');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Datos del cliente guardados.')).toBeInTheDocument();
    expect(await datosMostrados()).toContainEqual(['Nombre', 'Rosa Quispe Mamani']);
    // Nada fue al servidor: queda en la cola, como una edición con solo el nombre.
    expect(servidor.pedidos).toEqual([]);
    const cola = await db.getCrudBatch();
    expect(cola?.crud.map((c) => [c.op, c.opData])).toEqual([['PATCH', { nombre: 'Rosa Quispe Mamani' }]]);
    sinJerga();
  });

  it('el teléfono se guarda normalizado', async () => {
    await abrirEdicion();
    escribir('Teléfono', '70 99-88 77');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await datosMostrados()).toContainEqual(['Teléfono', '70998877']);
  });

  it('sin ningún cambio no guarda nada, y lo dice', async () => {
    const { db } = await abrirEdicion();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('No cambiaste ningún dato: quedó como estaba.')).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('un teléfono de otro cliente se avisa en el campo, diciendo de quién es', async () => {
    const { db, sembrar } = await abrirClientes();
    await sembrar('clientes', [{ id: randomUUID(), nombre: 'Juan Mamani', telefono: '70555555', carnet: null }]);
    await encontrar('70123456');
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar datos' }));
    escribir('Teléfono', '70555555');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Ese teléfono ya es de Juan Mamani. Revísalo y vuelve a escribirlo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono')).toHaveAttribute('aria-invalid', 'true');
    expect(await db.getCrudBatch()).toBeNull();
    sinJerga();
  });

  it('Cancelar vuelve al cliente sin guardar nada', async () => {
    const { db } = await abrirEdicion();
    escribir('Nombre completo', 'Otra');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await datosMostrados()).toContainEqual(['Nombre', 'Rosa Quispe']);
    expect(await db.getCrudBatch()).toBeNull();
  });
});

describe('Pantalla de clientes con el tema — SPEC-KRILINXI-025', () => {
  it('el cliente encontrado se muestra en una tarjeta del tema', async () => {
    await abrirClientes();
    await encontrar('70123456');
    const nombre = await screen.findByText('Rosa Quispe', { selector: 'dd' });
    expect(nombre.closest('.rounded-2xl')).toHaveClass('bg-superficie');
  });

  it('el alta es una tarjeta con su título, y el formulario conserva su nombre', async () => {
    await abrirClientes();
    await buscar('70999999');
    fireEvent.click(await screen.findByRole('option', { name: 'Cliente nuevo' }));
    const tarjeta = await screen.findByRole('region', { name: 'Registrar cliente nuevo' });
    expect(within(tarjeta).getByRole('form', { name: 'Registrar cliente nuevo' })).toBeInTheDocument();
  });
});

describe('Pantalla de clientes: buscar mientras se escribe — SPEC-KRILINXI-032', () => {
  it('encuentra por parte del nombre, sin tildes ni mayúsculas, sin tocar ningún botón', async () => {
    const { servidor } = await abrirClientes();
    await encontrar('rosa qui');
    expect(await datosMostrados()).toContainEqual(['Nombre', 'Rosa Quispe']);
    expect(servidor.pedidos).toEqual([]);
  });

  it('cada resultado muestra con qué distinguirlo: teléfono y carnet', async () => {
    await abrirClientes();
    await buscar('quispe');
    expect(await screen.findByRole('option', { name: /Rosa Quispe/ }, { timeout: 3000 })).toHaveTextContent(
      'Tel. 70123456 · Carnet 4455667',
    );
  });

  it('por el carnet', async () => {
    await abrirClientes();
    await encontrar('445566');
    expect(await datosMostrados()).toContainEqual(['Carnet', '4455667']);
  });

  it('"Cliente nuevo" está a mano antes de escribir nada', async () => {
    await abrirClientes();
    expect(screen.getByRole('option', { name: 'Cliente nuevo' })).toBeInTheDocument();
  });

  it('si lo escrito es un nombre, el alta lo trae en el nombre', async () => {
    await abrirClientes();
    await elegirEnBuscador('Juan Nuevo', 'Cliente nuevo');
    const formulario = await screen.findByRole('form', { name: 'Registrar cliente nuevo' });
    expect(within(formulario).getByLabelText('Nombre completo')).toHaveValue('Juan Nuevo');
    expect(within(formulario).getByLabelText('Teléfono')).toHaveValue('');
  });

  it('elegir otro cliente después reemplaza al anterior, y el buscador queda vacío', async () => {
    const { sembrar } = await abrirClientes();
    await sembrar('clientes', [{ id: randomUUID(), nombre: 'Juan Mamani', telefono: '70555555', carnet: null }]);
    await encontrar('rosa');
    await encontrar('juan', /Juan Mamani/);
    expect(await datosMostrados()).toContainEqual(['Nombre', 'Juan Mamani']);
    expect(screen.getByRole('combobox', { name: /Buscar cliente/ })).toHaveValue('');
  });
});
