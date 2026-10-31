import { describe, expect, it } from 'vitest';
import { simularApi } from '../../../test/apiFalsa';
import { boletaDePrueba, paginaDeBoletas, renglonDePrueba } from '../../../test/historialDePrueba';
import { RespuestaRara } from '../../../lib/api';
import { leerPagina, pedirHistorial } from './historialApi';

describe('Historial completo, pedido a la API — SPEC-KRILINXI-041', () => {
  it('pasa a centavos los montos que llegan como texto, y pone el día en Bolivia', () => {
    const pagina = leerPagina(
      paginaDeBoletas([boletaDePrueba({ precioTotal: '45.50', precioFinal: '50.00', pagado: '15.25', saldo: '34.75', fechaEntrada: '2026-10-15 21:00:00' })], {
        total: 41,
      }),
    );

    expect(pagina).toMatchObject({ pagina: 1, porPagina: 20, total: 41 });
    expect(pagina?.boletas[0]).toMatchObject({
      numeroBoleta: '001234',
      clienteNombre: 'Rosa Quispe',
      clienteTelefono: '70123456',
      sucursalNombre: 'Centro',
      estado: 'RECIBIDO',
      dia: '2026-10-15',
      precioTotal: 4550,
      precioFinal: 5000,
      pagado: 1525,
      saldo: 3475,
    });
  });

  it('lee quién retiró la ropa, y una boleta sin entregar no tiene retiro — SPEC-KRILINXI-060', () => {
    const retiro = { tipo: 'SIN_BOLETA', nombre: 'Luis Mamani', carnet: '1234567 LP' };
    const pagina = leerPagina(paginaDeBoletas([boletaDePrueba({ retiro }), boletaDePrueba()]));

    expect(pagina?.boletas[0]?.retiro).toEqual(retiro);
    expect(pagina?.boletas[1]?.retiro).toBeNull();
  });

  it('un retiro que no encaja con el contrato descarta la página — SPEC-KRILINXI-060', () => {
    expect(leerPagina(paginaDeBoletas([boletaDePrueba({ retiro: { tipo: 'POR_CORREO', nombre: null, carnet: null } })]))).toBeNull();
    expect(leerPagina(paginaDeBoletas([boletaDePrueba({ retiro: 'Luis' })]))).toBeNull();
  });

  it('una boleta sin entrega no tiene precio final', () => {
    expect(leerPagina(paginaDeBoletas([boletaDePrueba({ precioFinal: null })]))?.boletas[0]?.precioFinal).toBeNull();
  });

  it.each([
    ['no es un objeto', 'hola'],
    ['no trae el total', { ...paginaDeBoletas([]), total: undefined }],
    ['trae un total negativo', paginaDeBoletas([], { total: -1 })],
    ['no trae la lista de boletas', { ...paginaDeBoletas([]), boletas: undefined }],
    ['trae una boleta sin número', paginaDeBoletas([boletaDePrueba({ numeroBoleta: undefined })])],
    ['trae un estado que no existe', paginaDeBoletas([boletaDePrueba({ estado: 'PERDIDA' })])],
    ['trae un saldo que no es un monto', paginaDeBoletas([boletaDePrueba({ saldo: 'mucho' })])],
    ['trae un monto como número', paginaDeBoletas([boletaDePrueba({ pagado: 20 })])],
    ['trae un precio final roto', paginaDeBoletas([boletaDePrueba({ precioFinal: 'x' })])],
    ['trae una boleta sin cliente', paginaDeBoletas([boletaDePrueba({ cliente: null })])],
    ['trae una boleta sin sucursal', paginaDeBoletas([boletaDePrueba({ sucursal: { id: 'x' } })])],
    ['no trae los renglones (SPEC-KRILINXI-068)', paginaDeBoletas([boletaDePrueba({ renglones: undefined })])],
    ['trae un renglón con un momento que no existe', paginaDeBoletas([boletaDePrueba({ renglones: [renglonDePrueba({ momento: 'DESPUES' })] })])],
    ['trae un renglón con la cantidad como número', paginaDeBoletas([boletaDePrueba({ renglones: [renglonDePrueba({ cantidad: 2 })] })])],
  ])('no se fía de una respuesta que %s', (_caso, datos) => {
    expect(leerPagina(datos)).toBeNull();
  });

  it('con una sola boleta rota descarta la página entera, en vez de esconderla', () => {
    expect(leerPagina(paginaDeBoletas([boletaDePrueba(), boletaDePrueba({ estado: 'PERDIDA' })]))).toBeNull();
  });

  it('pide a /ordenes los filtros que están puestos, con la página y cuántas por página', async () => {
    const servidor = simularApi(() => ({ status: 200, data: paginaDeBoletas([boletaDePrueba()]) }));

    await pedirHistorial({ estado: 'RECIBIDO', con_saldo: 'true' }, 3);

    expect(servidor.pedidos[0]).toMatchObject({
      metodo: 'GET',
      ruta: '/ordenes',
      parametros: { estado: 'RECIBIDO', con_saldo: 'true', pagina: 3, por_pagina: 20 },
    });
  });

  it('si la respuesta no encaja con el contrato, falla con un aviso en palabras', async () => {
    simularApi(() => ({ status: 200, data: { cualquier: 'cosa' } }));

    await expect(pedirHistorial({}, 1)).rejects.toBeInstanceOf(RespuestaRara);
  });
});

describe('Historial completo: los renglones de cada boleta — SPEC-KRILINXI-068', () => {
  it('lee cada renglón con su cantidad en centésimas y sus montos en centavos, sin recalcular el subtotal', () => {
    const pagina = leerPagina(
      paginaDeBoletas([
        boletaDePrueba({
          renglones: [
            renglonDePrueba({ id: 'r1', descripcion: 'Ropa por kilo', cantidad: '2.50', precioUnitario: '3.33', subtotal: '8.33' }),
            renglonDePrueba({ id: 'r2', momento: 'ENTREGA', descripcion: 'Recargo', cantidad: '1.00', precioUnitario: '5.00', subtotal: '5.00' }),
          ],
        }),
      ]),
    );

    expect(pagina?.boletas[0]?.renglones).toEqual([
      { id: 'r1', momento: 'INGRESO', descripcion: 'Ropa por kilo', cantidad: 250, precioUnitario: 333, subtotal: 833 },
      { id: 'r2', momento: 'ENTREGA', descripcion: 'Recargo', cantidad: 100, precioUnitario: 500, subtotal: 500 },
    ]);
  });

  it('una boleta de antes, sin renglones, llega con la lista vacía', () => {
    expect(leerPagina(paginaDeBoletas([boletaDePrueba()]))?.boletas[0]?.renglones).toEqual([]);
  });
});
