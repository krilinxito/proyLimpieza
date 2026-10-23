import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { App } from '../../../App';
import { cuerpoError, simularApi } from '../../../test/apiFalsa';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { accionesPrincipales, usoDe } from '../../../test/jerarquia';
import { sinJerga } from '../../../test/jerga';
import { sinRed } from '../../../test/red';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';

const ADMIN = sesionDePrueba({ rol: 'ADMIN' });
const CENTRO = '00000000-0000-4000-8000-0000000000c1';
const SUR = '00000000-0000-4000-8000-0000000000c3';
const ROSA = '00000000-0000-4000-8000-0000000000e1';

/**
 * /personal abierta por el ADMIN: él mismo, Rosa en el Centro, y Sur cerrada. `otras` suma cuentas a
 * la base local (una dada de baja, SPEC-KRILINXI-027).
 */
async function abrir(
  responder: Parameters<typeof simularApi>[0] = () => ({ status: 201, data: {} }),
  otras: Record<string, unknown>[] = [],
) {
  const servidor = simularApi(responder);
  const { control, db, sembrar } = await baseLocalDePrueba();
  await sembrar('sucursales', [
    { id: CENTRO, nombre: 'Centro', activa: 1 },
    { id: SUR, nombre: 'Sur', activa: 0 },
  ]);
  await sembrar('usuarios', [
    { id: ADMIN.usuario.id, nombre_completo: 'Ana Administradora', username: 'ana', rol: 'ADMIN', sucursal_id: null, activo: 1 },
    { id: ROSA, nombre_completo: 'Rosa Quispe', username: 'rosa', rol: 'EMPLEADO', sucursal_id: CENTRO, activo: 1 },
    ...otras,
  ]);
  renderEnRuta(<App />, '/personal', { sesion: ADMIN, baseLocal: control });
  await screen.findByText('Rosa Quispe');
  return { servidor, db };
}

const tarjeta = (nombre: string) => {
  // El nombre del admin también está en la barra de quién está adentro: la tarjeta es la de la lista.
  const li = screen
    .getAllByText(nombre)
    .map((e) => e.closest('li'))
    .find((e) => e !== null);
  if (!li) throw new Error(`No está la tarjeta de ${nombre}.`);
  return within(li);
};
const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

describe('Pantalla del personal — SPEC-KRILINXI-017', () => {
  it('lista las cuentas de la base local con usuario, rol y sucursal, sin pedir nada a la API', async () => {
    const { servidor } = await abrir();
    const rosa = tarjeta('Rosa Quispe');
    expect(rosa.getByText('«rosa»')).toBeInTheDocument();
    expect(rosa.getByText('Empleado')).toBeInTheDocument();
    expect(rosa.getByText('Centro')).toBeInTheDocument();
    expect(tarjeta('Ana Administradora').getByText('Administrador')).toBeInTheDocument();
    expect(servidor.pedidos).toEqual([]);
    sinJerga();
  });

  it('da de alta una persona por la API; la contraseña no queda en la tablet', async () => {
    const { servidor, db } = await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una persona' }));
    escribir('Nombre y apellido', 'Juan Mamani');
    escribir('Nombre de usuario (con el que va a entrar)', 'juan');
    fireEvent.click(await screen.findByRole('radio', { name: 'Centro' }));
    escribir('Contraseña (al menos 8 letras o números)', 'secreta123');
    sinJerga();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.')).toBeInTheDocument();
    expect(servidor.pedidos[0]).toEqual(
      expect.objectContaining({ metodo: 'POST', ruta: '/usuarios', cuerpo: expect.objectContaining({ password: 'secreta123', sucursal_id: CENTRO }) }),
    );
    // Ni en la cola, ni en la base local, ni en el almacenamiento del navegador.
    expect(await db.getCrudBatch()).toBeNull();
    expect(JSON.stringify(await db.getAll('SELECT * FROM usuarios'))).not.toContain('secreta123');
    expect(JSON.stringify({ ...localStorage })).not.toContain('secreta123');
  });

  it('para elegir la sucursal de alguien no ofrece una cerrada', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una persona' }));
    // Las sucursales se leen de la base local: hay que esperarlas.
    expect(await screen.findByRole('radio', { name: 'Centro' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Sur' })).not.toBeInTheDocument();
  });

  it('un administrador nuevo no pide sucursal', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una persona' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Administrador' }));
    expect(screen.queryByText('¿En qué sucursal trabaja?')).not.toBeInTheDocument();
  });

  it('cambiar datos no deja tocar el usuario ni el rol, y deja el teléfono y la contraseña vacíos', async () => {
    const { servidor } = await abrir();
    fireEvent.click(tarjeta('Rosa Quispe').getByRole('button', { name: 'Cambiar datos' }));

    expect(screen.getByLabelText('Nombre y apellido')).toHaveValue('Rosa Quispe');
    expect(screen.queryByLabelText(/Nombre de usuario/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Administrador' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono nuevo (déjalo vacío para no cambiarlo)')).toHaveValue('');
    escribir('Contraseña nueva (déjala vacía para no cambiarla)', 'otra12345');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.');
    expect(servidor.pedidos.map((p) => [p.metodo, p.ruta, p.cuerpo])).toEqual([['PATCH', `/usuarios/${ROSA}`, { password: 'otra12345' }]]);
  });

  it('dar de baja pide confirmación diciendo que no va a poder entrar, y manda activo: false', async () => {
    const { servidor } = await abrir();
    fireEvent.click(tarjeta('Rosa Quispe').getByRole('button', { name: 'Dar de baja' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Dar de baja a Rosa Quispe?' });
    expect(dialogo).toHaveTextContent('No va a poder volver a entrar al sistema.');
    sinJerga();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, dar de baja' }));

    await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.');
    expect(servidor.pedidos.map((p) => [p.ruta, p.cuerpo])).toEqual([[`/usuarios/${ROSA}`, { activo: false }]]);
  });

  it('no ofrece dar de baja la cuenta del admin que está adentro', async () => {
    await abrir();
    expect(tarjeta('Ana Administradora').getByRole('button', { name: 'Cambiar datos' })).toBeInTheDocument();
    expect(tarjeta('Ana Administradora').queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument();
  });

  it('un usuario repetido deja el formulario abierto con el mensaje del servidor', async () => {
    const repetido = 'Ese nombre de usuario ya lo usa otra persona. Elige otro, por ejemplo agregándole el apellido.';
    await abrir(() => ({ status: 409, data: cuerpoError('USERNAME_DUPLICADO', repetido) }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una persona' }));
    escribir('Nombre y apellido', 'Rosa Mamani');
    escribir('Nombre de usuario (con el que va a entrar)', 'rosa');
    fireEvent.click(await screen.findByRole('radio', { name: 'Centro' }));
    escribir('Contraseña (al menos 8 letras o números)', 'secreta123');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(repetido)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Cuenta nueva' })).toBeInTheDocument();
  });

  it('si se cae internet al guardar, lo dice y no da nada por guardado', async () => {
    await abrir(() => 'sin-conexion');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una persona' }));
    escribir('Nombre y apellido', 'Juan Mamani');
    escribir('Nombre de usuario (con el que va a entrar)', 'juan');
    fireEvent.click(await screen.findByRole('radio', { name: 'Centro' }));
    escribir('Contraseña (al menos 8 letras o números)', 'secreta123');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('No hay internet: no se guardó. Prueba de nuevo cuando vuelva la conexión.')).toBeInTheDocument();
    expect(screen.queryByText(/^Guardado/)).not.toBeInTheDocument();
  });

  it('sin red, los botones de cambio se deshabilitan y lo dice', async () => {
    await abrir();
    sinRed();
    expect(screen.getByText(/Para hacer cambios hace falta internet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar una persona' })).toBeDisabled();
    expect(tarjeta('Rosa Quispe').getByRole('button', { name: 'Dar de baja' })).toBeDisabled();
    sinJerga();
  });
});

describe('Personal con el tema — SPEC-KRILINXI-027', () => {
  const BETO = { id: '00000000-0000-4000-8000-0000000000e2', nombre_completo: 'Beto Mamani', username: 'beto', rol: 'EMPLEADO', sucursal_id: CENTRO, activo: 0 };

  it('cada cuenta es una tarjeta con su nombre de título y su estado en una insignia, con un tono para cada uno', async () => {
    await abrir(undefined, [BETO]);

    const rosa = screen.getByRole('region', { name: 'Rosa Quispe' });
    // SPEC-KRILINXI-051: la insignia marca solo la excepción; una cuenta activa no lleva ninguna.
    expect(within(rosa).queryByText('Activa')).not.toBeInTheDocument();
    const beto = screen.getByRole('region', { name: 'Beto Mamani' });
    expect(within(beto).getByText('Dada de baja')).toHaveClass('bg-fondo');
    // Una cuenta dada de baja no ofrece cambios (solo volver a darla de alta, SPEC-KRILINXI-051).
    expect(within(beto).queryByRole('button', { name: 'Cambiar datos' })).not.toBeInTheDocument();
    expect(within(beto).queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument();
    sinJerga();
  });

  it('sin internet, los botones de cambio siguen deshabilitados', async () => {
    sinRed();
    await abrir();
    const rosa = within(screen.getByRole('region', { name: 'Rosa Quispe' }));
    expect(rosa.getByRole('button', { name: 'Cambiar datos' })).toBeDisabled();
    expect(rosa.getByRole('button', { name: 'Dar de baja' })).toBeDisabled();
  });
});

describe('Personal en una grilla de tarjetas — SPEC-KRILINXI-039', () => {
  it('una tarjeta por fila en angosto y dos desde 1024px (lg)', async () => {
    await abrir();
    expect(screen.getByRole('region', { name: 'Rosa Quispe' }).closest('ul')).toHaveClass('grid', 'lg:grid-cols-2');
  });

  it('cada cuenta lleva el círculo con su inicial, decorativo: el nombre ya está en el título', async () => {
    await abrir();
    const rosa = screen.getByRole('region', { name: 'Rosa Quispe' });
    const inicial = within(rosa).getByText('R');
    const circulo = inicial.parentElement;
    expect(circulo).toHaveClass('rounded-full');
    expect(circulo).toHaveAttribute('aria-hidden', 'true');
    // No se anuncia como una imagen "Perfil de…" en cada tarjeta.
    expect(within(rosa).queryByRole('img')).not.toBeInTheDocument();
  });

  it('las acciones van dentro de la tarjeta, compactas y con su ícono; dar de baja es de peligro', async () => {
    await abrir();
    for (const nombre of ['Cambiar datos', 'Dar de baja']) {
      const accion = tarjeta('Rosa Quispe').getByRole('button', { name: nombre });
      expect(accion).toHaveClass('min-h-12');
      expect(accion.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(usoDe(tarjeta('Rosa Quispe').getByRole('button', { name: 'Dar de baja' }))).toBe('peligro');
    expect(accionesPrincipales()).toEqual(['Agregar una persona']);
  });
});

describe('Personal: volver a dar de alta — SPEC-KRILINXI-051', () => {
  const BETO_ID = '00000000-0000-4000-8000-0000000000e2';
  const BETO = { id: BETO_ID, nombre_completo: 'Beto Mamani', username: 'beto', rol: 'EMPLEADO', sucursal_id: CENTRO, activo: 0 };

  it('una cuenta dada de baja ofrece volver a darla de alta; una activa no', async () => {
    await abrir(undefined, [BETO]);
    expect(tarjeta('Beto Mamani').getByRole('button', { name: 'Volver a dar de alta' })).toBeInTheDocument();
    expect(tarjeta('Rosa Quispe').queryByRole('button', { name: 'Volver a dar de alta' })).not.toBeInTheDocument();
    expect(tarjeta('Rosa Quispe').getByRole('button', { name: 'Cambiar datos' })).toBeInTheDocument();
  });

  it('pide confirmación diciendo a quién y qué pasa, y manda activo: true por la API sin tocar la base local', async () => {
    const { servidor, db } = await abrir(undefined, [BETO]);
    fireEvent.click(tarjeta('Beto Mamani').getByRole('button', { name: 'Volver a dar de alta' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Volver a dar de alta a Beto Mamani?' });
    expect(dialogo).toHaveTextContent('Va a poder volver a entrar al sistema');
    sinJerga();
    expect(servidor.pedidos).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, dar de alta' }));

    await screen.findByText('Guardado. Puede tardar unos segundos en verse en la lista.');
    expect(servidor.pedidos.map((p) => [p.metodo, p.ruta, p.cuerpo])).toEqual([['PATCH', `/usuarios/${BETO_ID}`, { activo: true }]]);
    // La lista cambia cuando PowerSync la baje, no antes: la base local sigue como estaba.
    const filas = await db.getAll<{ activo: number }>('SELECT activo FROM usuarios WHERE id = ?', [BETO_ID]);
    expect(filas[0]?.activo).toBe(0);
  });

  it('cancelar no manda nada', async () => {
    const { servidor } = await abrir(undefined, [BETO]);
    fireEvent.click(tarjeta('Beto Mamani').getByRole('button', { name: 'Volver a dar de alta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(servidor.pedidos).toEqual([]);
  });

  it('si el servidor rechaza, muestra su mensaje y la cuenta no cambia', async () => {
    const mensaje = 'No se pudo volver a dar de alta a esa persona. Prueba de nuevo.';
    const { db } = await abrir(() => ({ status: 409, data: cuerpoError('CONFLICTO', mensaje) }), [BETO]);
    fireEvent.click(tarjeta('Beto Mamani').getByRole('button', { name: 'Volver a dar de alta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, dar de alta' }));
    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    const filas = await db.getAll<{ activo: number }>('SELECT activo FROM usuarios WHERE id = ?', [BETO_ID]);
    expect(filas[0]?.activo).toBe(0);
  });

  it('sin internet, el botón está deshabilitado y la pantalla lo dice', async () => {
    sinRed();
    await abrir(undefined, [BETO]);
    expect(screen.getByText(/Para hacer cambios hace falta internet/)).toBeInTheDocument();
    expect(tarjeta('Beto Mamani').getByRole('button', { name: 'Volver a dar de alta' })).toBeDisabled();
  });

  it('cada tarjeta separa usuario, rol y sucursal en pares dato/valor, y la baja se distingue por su texto', async () => {
    await abrir(undefined, [BETO]);
    const beto = screen.getByRole('region', { name: 'Beto Mamani' });
    const pares = Array.from(beto.querySelectorAll('dt')).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(pares).toEqual([
      ['Usuario', '«beto»'],
      ['Rol', 'Empleado'],
      ['Sucursal', 'Centro'],
    ]);
    expect(within(beto).getByText('Dada de baja')).toBeInTheDocument();
    sinJerga();
  });
});
