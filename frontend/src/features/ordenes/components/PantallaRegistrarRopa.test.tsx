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
 * El recorrido entero del mostrador, como en SPEC-KRILINXI-005: la App montada en
 * /registrar-ropa, con la base local de verdad y con el servidor "sin internet".
 */
const EMPLEADA = sesionDePrueba();
const ROSA = { id: randomUUID(), nombre: 'Rosa Quispe', telefono: '70123456' };

async function abrir() {
  const servidor = simularApi(() => 'sin-conexion');
  const prueba = await baseLocalDePrueba();
  await prueba.sembrar('clientes', [ROSA]);
  await prueba.sembrar('ordenes', [
    { id: randomUUID(), sucursal_id: EMPLEADA.usuario.sucursalId, numero_boleta: '000999', cliente_id: ROSA.id },
  ]);
  renderEnRuta(<App />, '/registrar-ropa', { sesion: EMPLEADA, baseLocal: prueba.control });
  await escribirEnBuscador('');
  return { ...prueba, servidor };
}

function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

/** Busca a Rosa y la elige: el paso 1, que casi todos los tests necesitan hecho. */
async function elegirARosa() {
  await elegirEnBuscador('70123456', /Rosa Quispe/);
  fireEvent.click(await screen.findByRole('button', { name: 'Es este cliente' }));
  return screen.findByRole('form', { name: 'Datos de la ropa' });
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

describe('Registrar ropa: el recorrido — SPEC-KRILINXI-006', () => {
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

    const cola = await db.getCrudBatch(100);
    expect(cola?.crud.map((c) => c.table)).toEqual(['ordenes', 'pagos']);
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

  it('registra un cliente nuevo sin salir de la pantalla, y queda elegido', async () => {
    await abrir();
    await elegirEnBuscador('71111111', 'Cliente nuevo');
    escribir('Nombre completo', 'Juan Mamani');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Es este cliente' }));

    const formulario = await screen.findByRole('form', { name: 'Datos de la ropa' });
    expect(within(formulario).getByText('Juan Mamani')).toBeInTheDocument();
  });

  it('Registrar otra ropa vuelve a empezar por el cliente', async () => {
    await abrir();
    await elegirARosa();
    escribir('Número de la boleta', '001236');
    escribir('Qué ropa deja', 'Camisa');
    escribir('Precio (Bs)', '10');
    await guardar();
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar otra ropa' }));
    expect(await screen.findByRole('combobox', { name: /Buscar cliente/ })).toHaveValue('');
  });
});

describe('Registrar ropa: lo que se corrige en pantalla — SPEC-KRILINXI-006', () => {
  it('avisa de la boleta repetida en la sucursal y no guarda', async () => {
    const { db } = await abrir();
    await elegirARosa();
    escribir('Número de la boleta', '000999');
    escribir('Qué ropa deja', 'Camisa');
    escribir('Precio (Bs)', '10');
    await guardar();

    expect(
      await screen.findByText('Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo.'),
    ).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('marca cada campo que falta, todos a la vez', async () => {
    await abrir();
    await elegirARosa();
    await guardar();

    expect(await screen.findByText('Escribí el número de la boleta.')).toBeInTheDocument();
    expect(screen.getByText('Escribí qué ropa deja el cliente.')).toBeInTheDocument();
    expect(screen.getByText('Escribí el precio con números, por ejemplo 25 o 25,50.')).toBeInTheDocument();
  });

  it('con un adelanto mayor que el precio no guarda nada', async () => {
    const { db } = await abrir();
    await elegirARosa();
    escribir('Número de la boleta', '001237');
    escribir('Qué ropa deja', 'Camisa');
    escribir('Precio (Bs)', '10');
    escribir('Cuánto deja de adelanto (Bs, si deja)', '15');
    fireEvent.click(screen.getByLabelText('Efectivo'));
    await guardar();

    expect(await screen.findByText('El adelanto no puede ser mayor que el precio.')).toBeInTheDocument();
    expect(await db.getCrudBatch()).toBeNull();
  });
});

describe('Registrar ropa: solo en el mostrador — SPEC-KRILINXI-006', () => {
  it('un ADMIN que no está atendiendo ve cómo empezar, no el formulario (SPEC-KRILINXI-029)', async () => {
    renderEnRuta(<App />, '/registrar-ropa', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    expect(screen.getByText(/elegí en qué sucursal vas a atender/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Buscar cliente/ })).not.toBeInTheDocument();
  });
});

describe('Registrar ropa: el idioma del mostrador — SPEC-KRILINXI-006', () => {
  it('ningún paso usa palabras del sistema', async () => {
    await abrir();
    sinJerga();
    await elegirARosa();
    sinJerga();
    await guardar();
    await screen.findByText('Escribí el número de la boleta.');
    sinJerga();

    escribir('Número de la boleta', '001238');
    escribir('Qué ropa deja', 'Camisa');
    escribir('Precio (Bs)', '10');
    escribir('Cuánto deja de adelanto (Bs, si deja)', '5');
    fireEvent.click(screen.getByLabelText('Tarjeta'));
    await guardar();
    await screen.findByText('Ropa registrada con la boleta 001238.');
    sinJerga();
  });
});
