import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { subirCola } from '../../../lib/powersync/conector';
import { cuerpoError, simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { sinJerga } from '../../../test/jerga';
import { ordenDePrueba, SUCURSAL_DE_PRUEBA } from '../../../test/filasDePrueba';
import { dosTabletsConLaMismaRosa, ROSA_DE_LA_OTRA_TABLET } from '../../../test/clienteRepetido';
import { subirRechazando } from '../../../test/rechazos';
import { renderEnRuta } from '../../../test/render';
import { MENSAJES } from '../../ordenes/api/ordenesLocal';

const BOLETA_REPETIDA = 'Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo.';

/**
 * El recorrido que pide CLAUDE.md §6: el servidor rechaza una boleta y el empleado se entera.
 * Se escribe la orden en la base de verdad, se sube contra un servidor falso que dice 409, y
 * recién entonces se abre la App: el aviso tiene que decirlo y llevar a la lista.
 */
describe('Lo que no se pudo guardar llega a la pantalla — SPEC-KRILINXI-007', () => {
  it('el aviso cuenta el rechazo y la pantalla muestra qué era y por qué', async () => {
    simularApi(() => ({ status: 409, data: cuerpoError('BOLETA_DUPLICADA', BOLETA_REPETIDA) }));
    const { control, db } = await baseLocalDePrueba();
    await control.base.ejecutar('INSERT INTO ordenes (id, numero_boleta, precio_total) VALUES (?, ?, ?)', [
      randomUUID(),
      '001234',
      '50.00',
    ]);
    await subirCola(db);

    renderEnRuta(<App />, '/', { baseLocal: control });
    fireEvent.click(await screen.findByRole('link', { name: /1 registro no se pudo guardar/ }));

    expect(await screen.findByText('Ropa con la boleta 001234')).toBeInTheDocument();
    expect(screen.getByText(BOLETA_REPETIDA)).toBeInTheDocument();
    sinJerga();
  });

  it('sin nada para corregir, lo dice en vez de mostrar una lista vacía', async () => {
    const { control } = await baseLocalDePrueba();
    renderEnRuta(<App />, '/para-corregir', { baseLocal: control });
    expect(await screen.findByText('No hay nada para corregir. Todo se guardó bien.')).toBeInTheDocument();
  });

  it('el estado de la conexión está en todas las pantallas con sesión, también sin internet', async () => {
    const { control } = await baseLocalDePrueba();
    await control.base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), 'Rosa', '1')");
    renderEnRuta(<App />, '/clientes', { baseLocal: control });
    // La base de prueba nunca se conecta: es la tablet sin internet. Desde SPEC-KRILINXI-031 lo
    // dice la píldora de la cabecera, en corto.
    expect(
      await within(screen.getByRole('banner')).findByRole('button', { name: /Sin internet · 1 por guardar/ }),
    ).toBeInTheDocument();
  });
});

/** Una orden con la boleta 001234 que el servidor rechazó, y la App abierta en /para-corregir. */
async function abrirConUnaBoletaRechazada() {
  const { control, db, sembrar } = await baseLocalDePrueba();
  const base = { control, db, sembrar };
  return {
    ...base,
    async abrir(antes?: () => Promise<void>) {
      await antes?.();
      await control.base.ejecutar(
        'INSERT INTO ordenes (id, numero_boleta, sucursal_id, descripcion, precio_total, estado) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), '001234', SUCURSAL_DE_PRUEBA, '2 pantalones', '50.00', 'RECIBIDO'],
      );
      await subirRechazando(db, 409, 'BOLETA_DUPLICADA', BOLETA_REPETIDA);
      renderEnRuta(<App />, '/para-corregir', { baseLocal: control });
      await screen.findByText('Ropa con la boleta 001234');
    },
  };
}

describe('Corregir lo que no se pudo guardar — SPEC-KRILINXI-013', () => {
  it('cada registro tiene Corregir y Descartar, con el motivo en palabras del mostrador', async () => {
    const { abrir } = await abrirConUnaBoletaRechazada();
    await abrir();

    const tarjeta = screen.getByText('Ropa con la boleta 001234').closest('li');
    if (!tarjeta) throw new Error('No está la tarjeta del registro.');
    expect(within(tarjeta).getByText(BOLETA_REPETIDA)).toBeInTheDocument();
    expect(within(tarjeta).getByRole('button', { name: 'Corregir' })).toBeInTheDocument();
    expect(within(tarjeta).getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
    sinJerga();
  });

  it('corregir abre los datos enviados; guardado sin internet, sale de la lista y del aviso', async () => {
    const { abrir } = await abrirConUnaBoletaRechazada();
    await abrir();
    // El aviso lo calcula otro suscriptor de la base, aparte de la lista: que la lista ya esté no
    // dice que el aviso también. Se espera a él (SPEC-KRILINXI-019 lo encontró con LENTO_MS).
    expect(await screen.findByRole('link', { name: /1 registro no se pudo guardar/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Corregir' }));
    const boleta = screen.getByLabelText('Número de la boleta');
    expect(boleta).toHaveValue('001234');
    expect(screen.getByLabelText('Qué deja')).toHaveValue('2 pantalones');
    expect(screen.getByLabelText('Precio (Bs)')).toHaveValue('50,00');
    sinJerga();

    fireEvent.change(boleta, { target: { value: '001235' } });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a guardar' }));

    expect(await screen.findByText(/Listo: la corrección quedó guardada en esta tablet/)).toBeInTheDocument();
    expect(await screen.findByText('No hay nada para corregir. Todo se guardó bien.')).toBeInTheDocument();
    // La base de prueba nunca se conecta: es la tablet sin internet, con la corrección en la cola.
    // Sin nada más para corregir, el aviso grande se va y lo dice la píldora (SPEC-KRILINXI-031).
    expect(
      await within(screen.getByRole('banner')).findByRole('button', { name: 'Sin internet · 1 por guardar' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /no se pudo guardar/ })).not.toBeInTheDocument();
    sinJerga();
  });

  it('una boleta corregida que ya usa otra ropa de la sucursal se avisa en el campo, con el mensaje de registrar ropa', async () => {
    const { abrir, sembrar } = await abrirConUnaBoletaRechazada();
    await abrir(() => sembrar('ordenes', [ordenDePrueba({ numero_boleta: '009999' })]));

    fireEvent.click(screen.getByRole('button', { name: 'Corregir' }));
    fireEvent.change(screen.getByLabelText('Número de la boleta'), { target: { value: '009999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a guardar' }));

    expect(await screen.findByText(MENSAJES.boletaOcupada)).toBeInTheDocument();
    expect(screen.getByLabelText('Número de la boleta')).toHaveAttribute('aria-invalid', 'true');
    sinJerga();
  });

  it('descartar pide confirmación diciendo qué se pierde; cancelar no borra nada', async () => {
    const { abrir } = await abrirConUnaBoletaRechazada();
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.getByText('¿Descartar «Ropa con la boleta 001234»?')).toBeInTheDocument();
    expect(screen.getByText(/No se va a guardar nunca/)).toBeInTheDocument();
    sinJerga();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByText('Ropa con la boleta 001234')).toBeInTheDocument();
  });

  it('confirmado el descarte, lo saca de la lista sin dejar nada para subir', async () => {
    const { abrir, db } = await abrirConUnaBoletaRechazada();
    await abrir();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));

    expect(await screen.findByText('No hay nada para corregir. Todo se guardó bien.')).toBeInTheDocument();
    expect(screen.getByText('Se descartó: Ropa con la boleta 001234.')).toBeInTheDocument();
    await waitFor(async () => expect(await db.getCrudBatch()).toBeNull());
    sinJerga();
  });

  it('un cambio de estado rechazado explica dónde rehacerlo en vez de abrir un formulario', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const orden = ordenDePrueba();
    await sembrar('ordenes', [orden]);
    await control.base.ejecutar("UPDATE ordenes SET estado = 'LISTO' WHERE id = ?", [orden.id]);
    await subirRechazando(db, 409, 'TRANSICION_INVALIDA', 'Esta ropa ya fue anulada: no se puede cambiar.');
    renderEnRuta(<App />, '/para-corregir', { baseLocal: control });

    fireEvent.click(await screen.findByRole('button', { name: 'Corregir' }));

    expect(screen.getByText(/Un cambio de estado no se corrige aquí/)).toBeInTheDocument();
    // Desde SPEC-KRILINXI-033, la ropa se mira en el Mostrador.
    expect(screen.getByRole('link', { name: 'Ir al Mostrador' })).toHaveAttribute('href', '/mostrador');
    expect(screen.queryByRole('button', { name: 'Volver a guardar' })).not.toBeInTheDocument();
    sinJerga();
  });
});

describe('Es el mismo cliente — SPEC-KRILINXI-021', () => {
  async function abrirElClienteRechazado(opciones?: { bajaLaOtra?: boolean }) {
    const prueba = await dosTabletsConLaMismaRosa(opciones);
    renderEnRuta(<App />, '/para-corregir', { baseLocal: prueba.control });
    const tarjeta = (await screen.findByText('Cliente Rosa Q. (70123456)')).closest('li');
    if (!tarjeta) throw new Error('No está la tarjeta del cliente rechazado.');
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Corregir' }));
    return prueba;
  }

  it('muestra al cliente que ya existe, con su nombre y teléfono para comparar', async () => {
    await abrirElClienteRechazado();
    const panel = await screen.findByRole('region', { name: 'Es el mismo cliente' });
    expect(within(panel).getByText('Rosa Quispe (70123456)')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Es el mismo cliente' })).toBeInTheDocument();
    sinJerga();
  });

  it('al confirmar, la ropa pasa a ese cliente y todo sale de la lista, sin internet', async () => {
    const { db } = await abrirElClienteRechazado();
    fireEvent.click(await screen.findByRole('button', { name: 'Es el mismo cliente' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Es Rosa Quispe?' });
    expect(dialogo).toHaveTextContent('La ropa de este registro pasa a nombre de Rosa Quispe');
    sinJerga();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, es la misma persona' }));

    expect(await screen.findByText('Listo: la ropa quedó a nombre de Rosa Quispe y se va a guardar de nuevo.')).toBeInTheDocument();
    expect(await screen.findByText('No hay nada para corregir. Todo se guardó bien.')).toBeInTheDocument();
    // En la cola: la ropa con el otro cliente, y su adelanto. El cliente repetido, no.
    const cola = await db.getCrudBatch(10);
    expect(cola?.crud.map((c) => c.table)).toEqual(['ordenes', 'pagos']);
    expect(cola?.crud[0]?.opData).toEqual(expect.objectContaining({ cliente_id: ROSA_DE_LA_OTRA_TABLET }));
    sinJerga();
  });

  it('en el Mostrador, la boleta figura con el cliente que existe (SPEC-KRILINXI-033)', async () => {
    await abrirElClienteRechazado();
    fireEvent.click(await screen.findByRole('button', { name: 'Es el mismo cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, es la misma persona' }));
    await screen.findByText(/la ropa quedó a nombre de Rosa Quispe/);

    fireEvent.click(await screen.findByRole('link', { name: 'Volver al inicio' }));
    // El botón del Inicio, no el del menú (que también se llama así desde SPEC-KRILINXI-023).
    await screen.findByRole('heading', { name: 'Lavandería' });
    // Al Mostrador por el menú: desde SPEC-KRILINXI-035 el Inicio ya no repite las tareas.
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Menú principal' })).getByRole('link', { name: 'Mostrador' }));

    expect(await screen.findByRole('button', { name: 'Boleta 001234, Rosa Quispe' })).toBeInTheDocument();
  });

  it('si la tablet no conoce a otro cliente con ese teléfono, no lo ofrece y deja corregir el teléfono', async () => {
    await abrirElClienteRechazado({ bajaLaOtra: false });
    expect(await screen.findByLabelText('Teléfono')).toHaveValue('70123456');
    expect(screen.queryByRole('region', { name: 'Es el mismo cliente' })).not.toBeInTheDocument();
  });
});

describe('Para corregir con el tema — SPEC-KRILINXI-027', () => {
  it('cada registro es una tarjeta, con por qué no se guardó en un aviso de error', async () => {
    const { abrir } = await abrirConUnaBoletaRechazada();
    await abrir();

    const tarjeta = screen.getByText('Ropa con la boleta 001234').closest('li');
    if (!tarjeta) throw new Error('No está la tarjeta del registro.');
    expect(tarjeta.firstElementChild).toHaveClass('rounded-2xl', 'bg-superficie');
    const motivo = within(tarjeta).getByRole('alert');
    expect(motivo).toHaveTextContent(BOLETA_REPETIDA);
    expect(motivo).toHaveClass('bg-peligro-fondo');
    // Corregir es la acción principal; descartar, la secundaria. Los dos, botones del tema.
    expect(within(tarjeta).getByRole('button', { name: 'Corregir' })).toHaveClass('bg-marca');
    expect(within(tarjeta).getByRole('button', { name: 'Descartar' })).toHaveClass('bg-superficie');
  });
});
