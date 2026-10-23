import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { App } from '../../../App';
import { cuerpoError, simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { sinJerga } from '../../../test/jerga';
import { sinRed } from '../../../test/red';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';
import { accionesPrincipales, usoDe } from '../../../test/jerarquia';
import { MENSAJES_SUCURSAL } from '../api/sucursalesApi';
import { textoPersonas } from './PantallaSucursales';

const CENTRO = '00000000-0000-4000-8000-0000000000c1';
const SUR = '00000000-0000-4000-8000-0000000000c3';

/**
 * /sucursales abierta por un ADMIN, con Centro abierta y Sur cerrada en la base local. `usuarios` suma
 * cuentas, para contar quién trabaja en cada una (SPEC-KRILINXI-039).
 */
async function abrir(
  responder: Parameters<typeof simularApi>[0] = () => ({ status: 200, data: {} }),
  usuarios: Record<string, unknown>[] = [],
) {
  const servidor = simularApi(responder);
  const { control, db, sembrar } = await baseLocalDePrueba();
  await sembrar('sucursales', [
    { id: CENTRO, nombre: 'Centro', direccion: 'Av. Busch 123', telefono: '2201', activa: 1 },
    { id: SUR, nombre: 'Sur', direccion: null, telefono: null, activa: 0 },
  ]);
  if (usuarios.length > 0) await sembrar('usuarios', usuarios);
  renderEnRuta(<App />, '/sucursales', { sesion: sesionDePrueba({ rol: 'ADMIN' }), baseLocal: control });
  await screen.findByRole('region', { name: 'Centro' });
  return { servidor, db };
}

/** La tarjeta de una sucursal: desde SPEC-KRILINXI-027 es una región con su nombre de título. */
const tarjeta = (nombre: string) => within(screen.getByRole('region', { name: nombre }));

describe('Pantalla de sucursales — SPEC-KRILINXI-017', () => {
  it('lista las sucursales de la base local, sin pedir nada a la API', async () => {
    const { servidor } = await abrir();
    expect(tarjeta('Sur').getByText('Cerrada')).toBeInTheDocument();
    expect(tarjeta('Centro').getByText('Av. Busch 123')).toBeInTheDocument();
    expect(servidor.pedidos).toEqual([]);
    sinJerga();
  });

  it('da de alta una sucursal por la API y avisa que la lista puede tardar en mostrarla', async () => {
    const { servidor, db } = await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar sucursal' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Norte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.')).toBeInTheDocument();
    expect(servidor.pedidos).toEqual([expect.objectContaining({ metodo: 'POST', ruta: '/sucursales' })]);
    // Nada pasó por la cola: fue directo al servidor.
    expect(await db.getCrudBatch()).toBeNull();
    sinJerga();
  });

  it('cambiar datos arranca con los actuales y manda solo lo que cambió', async () => {
    const { servidor } = await abrir();
    fireEvent.click(tarjeta('Centro').getByRole('button', { name: 'Cambiar datos' }));
    expect(screen.getByLabelText('Dirección (si la tiene)')).toHaveValue('Av. Busch 123');
    fireEvent.change(screen.getByLabelText('Teléfono (si lo tiene)'), { target: { value: '2209' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.');
    expect(servidor.pedidos.map((p) => [p.metodo, p.ruta, p.cuerpo])).toEqual([['PATCH', `/sucursales/${CENTRO}`, { telefono: '2209' }]]);
  });

  it('un nombre repetido deja el formulario abierto con el mensaje del servidor', async () => {
    const repetido = 'Ya hay una sucursal que se llama "Sur". Elige otro nombre, por ejemplo con la zona o la calle.';
    await abrir(() => ({ status: 409, data: cuerpoError('NOMBRE_SUCURSAL_DUPLICADO', repetido) }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar sucursal' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sur' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(repetido)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Sucursal nueva' })).toBeInTheDocument();
  });

  it('cerrar pide confirmación y, si todavía tiene ropa, explica qué hacer', async () => {
    const { servidor } = await abrir(() => ({
      status: 409,
      data: cuerpoError('SUCURSAL_CON_ROPA', 'Quedan 2 órdenes con ropa en esta sucursal.'),
    }));
    fireEvent.click(tarjeta('Centro').getByRole('button', { name: 'Cerrar sucursal' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Cerrar la sucursal Centro?' });
    expect(dialogo).toHaveTextContent('No va a poder recibir ropa nueva ni personal nuevo.');
    sinJerga();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cerrar' }));

    expect(await screen.findByText(MENSAJES_SUCURSAL.conRopa)).toBeInTheDocument();
    expect(servidor.pedidos.map((p) => p.cuerpo)).toEqual([{ activa: false }]);
    sinJerga();
  });

  it('una cerrada se puede volver a abrir, con confirmación', async () => {
    const { servidor } = await abrir();
    fireEvent.click(tarjeta('Sur').getByRole('button', { name: 'Volver a abrir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, volver a abrir' }));

    await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.');
    expect(servidor.pedidos.map((p) => [p.ruta, p.cuerpo])).toEqual([[`/sucursales/${SUR}`, { activa: true }]]);
  });

  it('sin red, los botones de cambio se deshabilitan y lo dice', async () => {
    await abrir();
    sinRed();

    expect(screen.getByText(/Para hacer cambios hace falta internet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar sucursal' })).toBeDisabled();
    expect(tarjeta('Centro').getByRole('button', { name: 'Cerrar sucursal' })).toBeDisabled();
    sinJerga();
  });
});

describe('Sucursales con el tema — SPEC-KRILINXI-027', () => {
  it('cada sucursal es una tarjeta con su estado en una insignia: abierta en verde, cerrada en advertencia', async () => {
    await abrir();
    expect(tarjeta('Centro').getByText('Abierta')).toHaveClass('rounded-full', 'bg-exito-fondo');
    expect(tarjeta('Sur').getByText('Cerrada')).toHaveClass('rounded-full', 'bg-advertencia-fondo');
    sinJerga();
  });

  it('sin internet, cerrar y volver a abrir siguen deshabilitados', async () => {
    sinRed();
    await abrir();
    expect(tarjeta('Centro').getByRole('button', { name: 'Cerrar sucursal' })).toBeDisabled();
    expect(tarjeta('Sur').getByRole('button', { name: 'Volver a abrir' })).toBeDisabled();
  });
});

describe('Sucursales en una grilla de tarjetas — SPEC-KRILINXI-039', () => {
  const empleada = (id: string, sucursal_id: string, activo = 1) => ({
    id,
    nombre_completo: `Persona ${id.slice(-2)}`,
    username: `p${id.slice(-2)}`,
    rol: 'EMPLEADO',
    sucursal_id,
    activo,
  });
  const PERSONAL = [
    empleada('00000000-0000-4000-8000-0000000000e1', CENTRO),
    empleada('00000000-0000-4000-8000-0000000000e2', CENTRO),
    // Dada de baja: ya no trabaja ahí.
    empleada('00000000-0000-4000-8000-0000000000e3', CENTRO, 0),
    { id: '00000000-0000-4000-8000-0000000000e4', nombre_completo: 'Ana', username: 'ana', rol: 'ADMIN', sucursal_id: null, activo: 1 },
  ];

  it('una tarjeta por fila en angosto y dos desde 1024px (lg)', async () => {
    await abrir();
    const lista = screen.getByRole('region', { name: 'Centro' }).closest('ul');
    expect(lista).toHaveClass('grid', 'lg:grid-cols-2');
  });

  it('cada tarjeta dice cuántas personas trabajan ahí, contando solo las cuentas activas', async () => {
    await abrir(undefined, PERSONAL);
    expect(await tarjeta('Centro').findByText('2 personas trabajan acá')).toBeInTheDocument();
    expect(tarjeta('Sur').getByText('Nadie trabaja acá')).toBeInTheDocument();
  });

  it.each([
    [0, 'Nadie trabaja acá'],
    [1, '1 persona trabaja acá'],
    [3, '3 personas trabajan acá'],
  ])('con %i, dice «%s»', (cuantas, texto) => {
    expect(textoPersonas(cuantas)).toBe(texto);
  });

  it('las acciones van dentro de la tarjeta, compactas y con su ícono; cerrar es de peligro', async () => {
    await abrir();
    for (const nombre of ['Cambiar datos', 'Cerrar sucursal']) {
      const accion = tarjeta('Centro').getByRole('button', { name: nombre });
      expect(accion).toHaveClass('min-h-12');
      expect(accion.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(usoDe(tarjeta('Centro').getByRole('button', { name: 'Cerrar sucursal' }))).toBe('peligro');
    // Volver a abrir no destruye nada: secundario.
    expect(usoDe(tarjeta('Sur').getByRole('button', { name: 'Volver a abrir' }))).toBe('secundario');
    // La única principal de la pantalla sigue siendo dar de alta.
    expect(accionesPrincipales()).toEqual(['Agregar sucursal']);
  });

  it('cerrar sigue pidiendo confirmación', async () => {
    await abrir();
    fireEvent.click(tarjeta('Centro').getByRole('button', { name: 'Cerrar sucursal' }));
    expect(screen.getByRole('dialog', { name: '¿Cerrar la sucursal Centro?' })).toBeInTheDocument();
  });
});
