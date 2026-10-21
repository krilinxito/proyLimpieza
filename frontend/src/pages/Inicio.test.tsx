import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { App } from '../App';
import { simularApi } from '../test/apiFalsa';
import { baseLocalDePrueba } from '../test/baseLocalDePrueba';
import { controlFalso } from '../test/controlFalso';
import { simularEstadisticas } from '../test/estadisticasDePrueba';
import { clienteDePrueba, ordenDePrueba, pagoDePrueba } from '../test/filasDePrueba';
import { tabletConRelojCorrido } from '../test/reloj';
import { renderEnRuta } from '../test/render';
import { sesionDePrueba } from '../test/sesion';
import { accionesPrincipales, usoDe } from '../test/jerarquia';
import { sinJerga } from '../test/jerga';

/** La base local con la ropa del día de una sucursal: lo que el Inicio tiene que mostrar. */
async function sucursalConRopaDelDia() {
  simularApi(() => 'sin-conexion');
  // El 16/10/2026, 10:05 en La Paz: "hoy" no depende de cuándo corre el test.
  tabletConRelojCorrido(0);
  const prueba = await baseLocalDePrueba();
  const rosa = clienteDePrueba({ nombre: 'Rosa Quispe' });
  const lista = ordenDePrueba({ cliente_id: rosa.id, numero_boleta: '000001', estado: 'LISTO', precio_total: '50.00' });
  const atrasada = ordenDePrueba({ cliente_id: rosa.id, numero_boleta: '000002', estado: 'EN_PROCESO', fecha_estimada_salida: '2026-10-14' });
  await prueba.sembrar('clientes', [rosa]);
  await prueba.sembrar('ordenes', [lista, atrasada]);
  await prueba.sembrar('pagos', [
    pagoDePrueba({ orden_id: lista.id, monto: '20.00', metodo: 'EFECTIVO', fecha_pago: '2026-10-16 13:00:00' }),
    pagoDePrueba({ orden_id: atrasada.id, monto: '5.50', metodo: 'QR', fecha_pago: '2026-10-16T14:00:00.000Z' }),
    // De ayer: no cuenta.
    pagoDePrueba({ orden_id: atrasada.id, monto: '99.00', metodo: 'QR', fecha_pago: '2026-10-15 15:00:00' }),
  ]);
  return prueba;
}

const principal = () => within(screen.getByRole('main'));
const seccion = (nombre: RegExp) => principal().getByRole('region', { name: nombre });

describe('Inicio: el saludo — SPEC-KRILINXI-024', () => {
  it('saluda por su nombre a quien atiende, debajo del título', () => {
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ nombreCompleto: 'Rosa Quispe' }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Lavandería' })).toBeInTheDocument();
    expect(principal().getByText('Hola, Rosa Quispe')).toBeInTheDocument();
  });

  it('no usa palabras del sistema', () => {
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    sinJerga();
  });
});

describe('Inicio: hoy en la sucursal — SPEC-KRILINXI-035', () => {
  it('muestra la ropa lista para recoger y la atrasada, cada una con su número', async () => {
    const { control } = await sucursalConRopaDelDia();
    renderEnRuta(<App />, '/', { baseLocal: control });

    expect(await principal().findByRole('heading', { name: 'Hoy en la sucursal' })).toBeInTheDocument();
    const lista = seccion(/^Lista para recoger \(1 boleta\)/);
    expect(within(lista).getByRole('link', { name: 'Boleta 000001, Rosa Quispe' })).toHaveTextContent('Falta pagar Bs 30,00');
    const atrasada = seccion(/^Atrasada \(1 boleta\)/);
    expect(within(atrasada).getByRole('link', { name: 'Boleta 000002, Rosa Quispe' })).toHaveTextContent('Era para el 14/10/2026');
    sinJerga();
  });

  it('muestra lo cobrado hoy, el total y por forma de pago, sin lo de ayer', async () => {
    const { control } = await sucursalConRopaDelDia();
    renderEnRuta(<App />, '/', { baseLocal: control });

    const cobrado = await principal().findByRole('region', { name: 'Cobrado hoy' });
    expect(within(cobrado).getByText('Bs 25,50')).toBeInTheDocument();
    expect(within(cobrado).getByText('Efectivo', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Bs 20,00');
    expect(within(cobrado).getByText('Pago con QR', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Bs 5,50');
  });

  it('tocar una boleta la abre en el Mostrador, en la ficha de su cliente', async () => {
    const { control } = await sucursalConRopaDelDia();
    renderEnRuta(<App />, '/', { baseLocal: control });

    fireEvent.click(await principal().findByRole('link', { name: 'Boleta 000002, Rosa Quispe' }));
    expect(await screen.findByRole('heading', { name: 'Mostrador', level: 1 })).toBeInTheDocument();
    const ficha = await screen.findByRole('region', { name: 'Ficha de Rosa Quispe' });
    expect(await within(ficha).findByRole('region', { name: 'Boleta 000002' })).toBeInTheDocument();
  });

  it('una lista vacía lo dice en palabras, y sin cobros lo dice también', async () => {
    simularApi(() => 'sin-conexion');
    const { control } = await baseLocalDePrueba();
    renderEnRuta(<App />, '/', { baseLocal: control });

    expect(await principal().findByText('No hay ropa lista esperando que la recojan.')).toBeInTheDocument();
    expect(principal().getByText('No hay ropa atrasada.')).toBeInTheDocument();
    expect(principal().getByText('Todavía no se cobró nada hoy.')).toBeInTheDocument();
  });

  it('si hay registros para corregir, lo dice y lleva a revisarlos', async () => {
    const baseLocal = controlFalso({ estado: { conectado: false, pendientes: 0, paraCorregir: 2 } });
    renderEnRuta(<App />, '/', { baseLocal });
    expect(await principal().findByText('Hay 2 registros que no se pudieron guardar y hay que revisar.')).toBeInTheDocument();
    expect(principal().getByRole('link', { name: 'Revisar los registros' })).toHaveAttribute('href', '/para-corregir');
  });

  it('sin internet, ninguna lectura va al servidor', async () => {
    const { control } = await sucursalConRopaDelDia();
    const servidor = simularApi(() => 'sin-conexion');
    renderEnRuta(<App />, '/', { baseLocal: control });
    await principal().findByRole('region', { name: 'Cobrado hoy' });
    expect(servidor.pedidos).toEqual([]);
  });

  it('ya no repite las tareas del menú', async () => {
    const { control } = await sucursalConRopaDelDia();
    renderEnRuta(<App />, '/', { baseLocal: control });
    await principal().findByRole('heading', { name: 'Hoy en la sucursal' });
    expect(screen.queryByRole('navigation', { name: 'Tareas' })).not.toBeInTheDocument();
    expect(principal().queryByRole('link', { name: 'Mostrador' })).not.toBeInTheDocument();
    expect(principal().queryByRole('link', { name: 'Clientes' })).not.toBeInTheDocument();
  });
});

describe('Inicio del ADMIN que no atiende — SPEC-KRILINXI-035', () => {
  it('ofrece "Atender en una sucursal" y, sin internet, dice que los números necesitan conexión', async () => {
    simularApi(() => 'sin-conexion');
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    expect(await principal().findByText(/Las estadísticas necesitan conexión/)).toBeInTheDocument();
    expect(principal().getByRole('button', { name: 'Atender en una sucursal' })).toBeInTheDocument();
    expect(principal().queryByRole('heading', { name: 'Hoy en la sucursal' })).not.toBeInTheDocument();
  });

  it('con internet muestra los cuatro indicadores del tablero', async () => {
    simularEstadisticas();
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    const resumen = await principal().findByRole('region', { name: 'Resumen' });
    expect(within(resumen).getAllByRole('term')).toHaveLength(4);
    expect(principal().getByRole('link', { name: 'Ver las estadísticas' })).toHaveAttribute('href', '/estadisticas');
  });
});

describe('Inicio: cada cosa con su estilo — SPEC-KRILINXI-037', () => {
  it('lo cobrado hoy destaca, y cada boleta es una tarjeta que se toca, con su flecha', async () => {
    const { control } = await sucursalConRopaDelDia();
    renderEnRuta(<App />, '/', { baseLocal: control });
    expect(await principal().findByRole('region', { name: 'Cobrado hoy' })).toHaveClass('bg-marca-suave');
    const fila = principal().getByRole('link', { name: 'Boleta 000001, Rosa Quispe' });
    expect(fila).toHaveClass('shadow-md');
    expect(fila.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // Sin nada para corregir, no hay ninguna acción que pida hacerse ya: las listas solo informan.
    expect(accionesPrincipales()).toEqual([]);
  });

  it('el ADMIN que no atiende tiene una sola principal, y ver las estadísticas es navegación', async () => {
    simularEstadisticas();
    renderEnRuta(<App />, '/', { sesion: sesionDePrueba({ rol: 'ADMIN' }) });
    const enlace = await principal().findByRole('link', { name: 'Ver las estadísticas' });
    expect(usoDe(enlace)).toBe('navegacion');
    expect(accionesPrincipales()).toEqual(['Atender en una sucursal']);
    // El título y el botón ya dicen qué es: no hay un texto de ayuda que lo repita.
    expect(principal().queryByText(/Para registrar, cobrar o entregar/)).not.toBeInTheDocument();
  });
});

describe('Ingreso, página no encontrada y avisos de rol — SPEC-KRILINXI-024', () => {
  it('el ingreso es una tarjeta con el negocio arriba, el título y el formulario de siempre', () => {
    renderEnRuta(<App />, '/ingresar', { sesion: null });
    const titulo = screen.getByRole('heading', { level: 1, name: 'Ingresar al sistema' });
    const tarjeta = titulo.parentElement;
    expect(tarjeta).toHaveClass('bg-superficie', 'rounded-2xl', 'max-w-md');
    if (!tarjeta) throw new Error('el título tiene que estar en la tarjeta');
    expect(within(tarjeta).getByText('Lavandería')).toBeInTheDocument();
    expect(within(tarjeta).getByLabelText('Usuario')).toBeInTheDocument();
    expect(within(tarjeta).getByLabelText('Contraseña')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('la página no encontrada ofrece un solo camino: "Volver al inicio", con aspecto de botón', () => {
    renderEnRuta(<App />, '/no-existe');
    const contenido = within(screen.getByRole('main'));
    const volver = contenido.getAllByRole('link');
    expect(volver).toHaveLength(1);
    expect(volver[0]).toHaveAccessibleName('Volver al inicio');
    expect(volver[0]).toHaveClass('bg-marca', 'min-h-14');
  });

  it.each([
    ['un EMPLEADO en una pantalla del administrador', '/personal', 'EMPLEADO', /solo para el administrador/],
  ] as const)('%s ve el aviso con el tema y el camino de vuelta', (_caso, ruta, rol, texto) => {
    renderEnRuta(<App />, ruta, { sesion: sesionDePrueba({ rol }) });
    const aviso = within(screen.getByRole('main')).getByText(texto).closest('[role="status"]');
    expect(aviso).toHaveClass('bg-info-fondo');
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});
