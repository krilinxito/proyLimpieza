import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../../App';
import { simularApi, type RespuestaFalsa } from '../../../test/apiFalsa';
import { ELENA, paginaDePrueba, registroDePrueba, ROSA_CLIENTE, SUCURSAL_CENTRO } from '../../../test/auditoriaDePrueba';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { elegirEnBuscador } from '../../../test/buscador';
import { sinJerga } from '../../../test/jerga';
import { tabletConRelojCorrido } from '../../../test/reloj';
import { renderEnRuta } from '../../../test/render';
import { sesionDePrueba } from '../../../test/sesion';

const ROPA = registroDePrueba({ accion: 'CREAR', tablaAfectada: 'ordenes' });
const ALTA_CLIENTE = registroDePrueba({ accion: 'CREAR', tablaAfectada: 'clientes', registroId: ROSA_CLIENTE });

/** /quien-hizo-que abierta por un ADMIN; la API contesta lo que diga `responder`. */
async function abrir(responder: () => RespuestaFalsa = () => ({ status: 200, data: paginaDePrueba([ROPA, ALTA_CLIENTE]) })) {
  // El 16/10/2026 en Bolivia: los últimos 30 días van del 17/09 al 16/10.
  tabletConRelojCorrido(0);
  const servidor = simularApi(responder);
  const { control, sembrar } = await baseLocalDePrueba();
  await sembrar('sucursales', [{ id: SUCURSAL_CENTRO, nombre: 'Centro', activa: 1 }]);
  await sembrar('usuarios', [{ id: ELENA.id, nombre_completo: ELENA.nombreCompleto, username: 'elena', rol: 'EMPLEADO', sucursal_id: SUCURSAL_CENTRO, activo: 1 }]);
  await sembrar('clientes', [{ id: ROSA_CLIENTE, nombre: 'Rosa Quispe', telefono: '70123456' }]);
  renderEnRuta(<App />, '/quien-hizo-que', { sesion: sesionDePrueba({ rol: 'ADMIN' }), baseLocal: control });
  return { servidor };
}

describe('¿Quién hizo qué? — SPEC-KRILINXI-018', () => {
  it('pide la primera página de los últimos 30 días a la API', async () => {
    const { servidor } = await abrir();
    await screen.findByText(/Registró ropa/);
    expect(servidor.pedidos[0]).toEqual(
      expect.objectContaining({
        metodo: 'GET',
        ruta: '/auditoria',
        parametros: { desde: '2026-09-17', hasta: '2026-10-16', pagina: 1, por_pagina: 20 },
      }),
    );
  });

  it('muestra quién, qué hizo, sobre qué, dónde y cuándo, en palabras', async () => {
    await abrir();
    expect(await screen.findByText('Elena Choque: Registró ropa')).toBeInTheDocument();
    // El cliente se nombra con lo que hay en la tablet; la ropa, solo por su tipo.
    expect(await screen.findByText('Elena Choque: Dio de alta un cliente — Rosa Quispe')).toBeInTheDocument();
    // El nombre de la sucursal sale de la base local: se espera.
    expect(await screen.findAllByText('15/10/2026 18:30 · Centro')).toHaveLength(2);
    sinJerga();
  });

  it('dice cuándo se guardó en el sistema cuando es distinto de cuándo pasó', async () => {
    await abrir(() => ({
      status: 200,
      data: paginaDePrueba([registroDePrueba({ fechaDelHecho: '2026-10-15 10:00:00', fecha: '2026-10-15 15:20:00' })]),
    }));
    expect(await screen.findByText('15/10/2026 10:00 · Centro')).toBeInTheDocument();
    expect(screen.getByText('Se guardó en el sistema el 15/10/2026 15:20 (la tablet estaba sin internet).')).toBeInTheDocument();
  });

  it('en una edición muestra lo que había antes, y de una contraseña solo que cambió', async () => {
    await abrir(() => ({
      status: 200,
      data: paginaDePrueba([
        registroDePrueba({
          accion: 'EDITAR',
          tablaAfectada: 'usuarios',
          registroId: ELENA.id,
          sucursalId: null,
          valoresAnteriores: { nombre_completo: 'Elena C.', contrasena_cambiada: true },
        }),
      ]),
    }));
    expect(await screen.findByText('Elena Choque: Cambió los datos de una cuenta — Elena Choque')).toBeInTheDocument();
    expect(screen.getByText('Nombre antes: Elena C.')).toBeInTheDocument();
    expect(screen.getByText('Le cambió la contraseña')).toBeInTheDocument();
    sinJerga();
  });

  it('marca lo que hay que revisar, y el filtro "Solo lo que hay que revisar" lo pide a la API', async () => {
    const { servidor } = await abrir(() => ({
      status: 200,
      data: paginaDePrueba([registroDePrueba({ revision: 'cuenta_dada_de_baja' })]),
    }));
    expect(await screen.findByText('Para revisar: lo hizo una cuenta que ya estaba dada de baja.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Solo lo que hay que revisar'));

    await waitFor(() => expect(servidor.pedidos.at(-1)?.parametros).toEqual(expect.objectContaining({ revisar: 'true', pagina: 1 })));
  });

  it('filtra por qué, quién y sucursal, y manda esos filtros a la API', async () => {
    const { servidor } = await abrir();
    await screen.findByText(/Registró ropa/);
    fireEvent.click(screen.getByText('Buscar con más detalle'));

    fireEvent.click(screen.getByRole('radio', { name: 'Cobros' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Elena Choque' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Centro' }));

    await waitFor(() =>
      expect(servidor.pedidos.at(-1)?.parametros).toEqual({
        desde: '2026-09-17',
        hasta: '2026-10-16',
        tabla: 'pagos',
        usuario_id: ELENA.id,
        sucursal_id: SUCURSAL_CENTRO,
        pagina: 1,
        por_pagina: 20,
      }),
    );
  });

  it('elige un cliente con el buscador de la base local y manda su cliente_id; se puede quitar — SPEC-KRILINXI-062', async () => {
    const { servidor } = await abrir();
    await screen.findByText(/Registró ropa/);
    fireEvent.click(screen.getByText('Buscar con más detalle'));

    await elegirEnBuscador('rosa', /Rosa Quispe/, /¿De qué cliente\?/);

    await waitFor(() =>
      expect(servidor.pedidos.at(-1)?.parametros).toEqual({
        desde: '2026-09-17',
        hasta: '2026-10-16',
        cliente_id: ROSA_CLIENTE,
        pagina: 1,
        por_pagina: 20,
      }),
    );
    expect(screen.getByText('Rosa Quispe', { selector: 'p' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el cliente' }));

    await waitFor(() => expect(Object.keys(servidor.pedidos.at(-1)?.parametros as object)).not.toContain('cliente_id'));
    expect(await screen.findByRole('combobox', { name: /¿De qué cliente\?/ })).toBeInTheDocument();
  });

  it('con un cliente elegido, cada registro dice a quién se refiere — SPEC-KRILINXI-062', async () => {
    await abrir(() => ({ status: 200, data: paginaDePrueba([registroDePrueba({ accion: 'COBRAR', tablaAfectada: 'pagos' })]) }));
    await screen.findByText('Elena Choque: Cobró');
    fireEvent.click(screen.getByText('Buscar con más detalle'));

    await elegirEnBuscador('rosa', /Rosa Quispe/, /¿De qué cliente\?/);

    expect(await screen.findByText('Elena Choque: Cobró — de Rosa Quispe')).toBeInTheDocument();
    sinJerga();
  });

  it('elegir fechas pide ese período', async () => {
    const { servidor } = await abrir();
    await screen.findByText(/Registró ropa/);
    fireEvent.click(screen.getByText('Buscar con más detalle'));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ver estas fechas' }));

    await waitFor(() => expect(servidor.pedidos.at(-1)?.parametros).toEqual(expect.objectContaining({ desde: '2026-10-01', hasta: '2026-10-05' })));
  });

  it('pagina, del más nuevo al más viejo, pidiendo la página que corresponde', async () => {
    const { servidor } = await abrir(() => ({ status: 200, data: paginaDePrueba([ROPA], { total: 41 }) }));
    const paginas = await screen.findByRole('navigation', { name: 'Páginas de quién hizo qué' });
    expect(within(paginas).getByText('Página 1 de 3')).toBeInTheDocument();

    fireEvent.click(within(paginas).getByRole('button', { name: 'Siguientes' }));

    await waitFor(() => expect(servidor.pedidos.at(-1)?.parametros).toEqual(expect.objectContaining({ pagina: 2 })));
  });

  it('sin conexión dice que la consulta la necesita, en vez de una lista vacía', async () => {
    await abrir(() => 'sin-conexion');
    expect(await screen.findByText('Esta consulta necesita conexión.')).toBeInTheDocument();
    expect(screen.queryByText(/No hay nada registrado/)).not.toBeInTheDocument();
    sinJerga();
  });

  it('una página vacía lo dice en palabras', async () => {
    await abrir(() => ({ status: 200, data: paginaDePrueba([]) }));
    expect(await screen.findByText('No hay nada registrado en este período.')).toBeInTheDocument();
  });
});

describe('¿Quién hizo qué? con el tema — SPEC-KRILINXI-027', () => {
  it('lo que hay que revisar lleva una insignia de advertencia, y su explicación sigue debajo', async () => {
    await abrir(() => ({ status: 200, data: paginaDePrueba([registroDePrueba({ revision: 'cuenta_dada_de_baja' }), ROPA]) }));
    const explicacion = await screen.findByText('Para revisar: lo hizo una cuenta que ya estaba dada de baja.');
    const [marcado, comun] = within(screen.getByRole('region', { name: 'Lo que se hizo' })).getAllByRole('listitem');

    expect(marcado).toContainElement(explicacion);
    expect(within(marcado as HTMLElement).getByText('Hay que revisar')).toHaveClass('bg-advertencia-fondo');
    // Cada registro es una tarjeta del tema; el que no hay que revisar, sin insignia.
    expect((comun as HTMLElement).firstElementChild).toHaveClass('rounded-2xl', 'bg-superficie');
    expect(within(comun as HTMLElement).queryByText('Hay que revisar')).not.toBeInTheDocument();
    sinJerga();
  });

  it('sin conexión, el aviso es una advertencia del tema con su rol de alerta', async () => {
    await abrir(() => 'sin-conexion');
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('Esta consulta necesita conexión.');
    expect(aviso).toHaveClass('bg-advertencia-fondo');
  });
});
