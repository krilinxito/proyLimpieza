import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
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
  // El botón dice "Preparando…" hasta que la base local termina de abrirse.
  await screen.findByRole('button', { name: 'Buscar cliente' });
  return { ...prueba, servidor };
}

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

async function buscar(telefono: string) {
  escribir('Teléfono del cliente', telefono);
  fireEvent.click(screen.getByRole('button', { name: 'Buscar cliente' }));
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
    await buscar('7012-3456');

    expect(await screen.findByText('Rosa Quispe')).toBeInTheDocument();
    expect(await datosMostrados()).toEqual([
      ['Nombre', 'Rosa Quispe'],
      ['Teléfono', '70123456'],
      ['Carnet', '4455667'],
    ]);
    expect(servidor.pedidos).toEqual([]);
  });

  it('pide el teléfono si se busca sin escribirlo', async () => {
    await abrirClientes();
    await buscar('   ');
    expect(await screen.findByText('Escribí el número de teléfono del cliente.')).toBeInTheDocument();
  });

  it('si no lo encuentra, lo dice y ofrece registrarlo con el teléfono ya cargado', async () => {
    await abrirClientes();
    await buscar('7999 9999');

    expect(await screen.findByText('No hay ningún cliente con el teléfono 7999 9999.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cliente nuevo' }));

    const formulario = await screen.findByRole('form', { name: 'Registrar cliente nuevo' });
    expect(within(formulario).getByLabelText('Teléfono')).toHaveValue('7999 9999');
  });
});

describe('Pantalla de clientes: registrar — SPEC-KRILINXI-005', () => {
  async function abrirAlta(telefono = '71111111') {
    const prueba = await abrirClientes();
    await buscar(telefono);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar cliente nuevo' }));
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

    expect(await screen.findByText('Escribí el nombre del cliente.')).toBeInTheDocument();
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

    await buscar('70123456');
    await screen.findByText('Rosa Quispe');
    sinJerga();

    await buscar('71111111');
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar cliente nuevo' }));
    await screen.findByRole('form', { name: 'Registrar cliente nuevo' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await screen.findByText('Escribí el nombre del cliente.');
    sinJerga();

    escribir('Nombre completo', 'Juan Mamani');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await screen.findByText('Cliente registrado.');
    sinJerga();
  });
});
