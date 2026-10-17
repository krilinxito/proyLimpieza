import { describe, expect, it } from 'vitest';
import { ErrorSinConexion } from '../../../lib/api';
import { simularApi } from '../../../test/apiFalsa';
import {
  clientesDePrueba,
  ingresosDePrueba,
  productividadDePrueba,
  saldosDePrueba,
  simularEstadisticas,
  sinRecogerDePrueba,
  SUCURSAL_CENTRO,
  volumenDePrueba,
} from '../../../test/estadisticasDePrueba';
import {
  leerClientes,
  leerIngresos,
  leerProductividad,
  leerSaldos,
  leerSinRecoger,
  leerVolumen,
  pedirClientes,
  pedirIngresos,
  pedirSaldos,
  RespuestaRara,
} from './estadisticasApi';

describe('Estadísticas: pedirlas a la API — SPEC-KRILINXI-015', () => {
  it('pide cada métrica a su ruta, con el período y la sucursal como parámetros', async () => {
    const servidor = simularEstadisticas();
    const parametros = { desde: '2026-10-01', hasta: '2026-10-15', sucursal_id: SUCURSAL_CENTRO };

    await pedirIngresos(parametros);
    await pedirSaldos(parametros);

    expect(servidor.pedidos.map((p) => [p.metodo, p.ruta, p.parametros])).toEqual([
      ['GET', '/estadisticas/ingresos', parametros],
      ['GET', '/estadisticas/saldos', parametros],
    ]);
  });

  it('devuelve los montos como texto, tal como llegan: no los convierte ni los suma', async () => {
    simularEstadisticas();
    const ingresos = await pedirIngresos({ desde: '2026-10-16', hasta: '2026-10-16' });
    expect(ingresos.total).toBe('125.50');
    expect(ingresos.porSucursal[0]?.porMetodo.QR).toBe('25.50');
  });

  it('sin internet, lanza el error de sin conexión', async () => {
    simularEstadisticas('sin-conexion');
    await expect(pedirIngresos({ desde: '2026-10-16', hasta: '2026-10-16' })).rejects.toBeInstanceOf(ErrorSinConexion);
  });

  it('una respuesta que no tiene la forma acordada no se muestra a medias', async () => {
    simularApi(() => ({ status: 200, data: { total: 125.5 } }));
    await expect(pedirIngresos({ desde: '2026-10-16', hasta: '2026-10-16' })).rejects.toBeInstanceOf(RespuestaRara);
  });
});

describe('Estadísticas: leer las respuestas del contrato — SPEC-KRILINXI-015', () => {
  it('acepta las respuestas válidas de las tres métricas', () => {
    expect(leerIngresos(ingresosDePrueba())).not.toBeNull();
    expect(leerSaldos(saldosDePrueba())).not.toBeNull();
    expect(leerSinRecoger(sinRecogerDePrueba())).not.toBeNull();
  });

  it.each<[string, () => unknown]>([
    ['un monto como número de JavaScript', () => ingresosDePrueba({ total: 125.5 })],
    ['un método de pago que falta', () =>
      ingresosDePrueba({ porSucursal: [{ sucursalId: 'x', sucursal: 'Centro', total: '1.00', porMetodo: { EFECTIVO: '1.00' } }] })],
    ['un tramo de antigüedad desconocido', () =>
      saldosDePrueba({ porAntiguedad: [{ tramo: 'UN_ANIO', cantidad: 1, total: '1.00' }] })],
  ])('rechaza %s', (_caso, armar) => {
    const datos = armar();
    expect(leerIngresos(datos) ?? leerSaldos(datos)).toBeNull();
  });
});

describe('Estadísticas: volumen, productividad y clientes — SPEC-KRILINXI-016', () => {
  it('acepta las respuestas válidas de las tres', () => {
    expect(leerVolumen(volumenDePrueba())).not.toBeNull();
    expect(leerProductividad(productividadDePrueba())).not.toBeNull();
    expect(leerClientes(clientesDePrueba())).not.toBeNull();
  });

  it.each<[string, () => unknown, (datos: unknown) => unknown]>([
    ['un día sin fecha', () => volumenDePrueba({ porDia: [{ ordenes: 1, anuladas: 0 }] }), leerVolumen],
    ['una cantidad de boletas con decimales', () => volumenDePrueba({ total: 1.5 }), leerVolumen],
    ['un monto cobrado como número', () =>
      productividadDePrueba({ porEmpleado: [{ ...productividadDePrueba().porEmpleado[0], montoCobrado: 340.5 }] }), leerProductividad],
    ['una sucursal sin nombre dentro de un cliente', () =>
      clientesDePrueba({ clientes: [{ ...clientesDePrueba().clientes[0], porSucursal: [{ sucursal: { id: 'x' }, ordenes: 1, gastado: '1.00', ultimaVisita: 'x' }] }] }), leerClientes],
  ])('rechaza %s', (_caso, armar, leer) => {
    expect(leer(armar())).toBeNull();
  });

  it('pide una página de clientes con el período y cuántos por página', async () => {
    const servidor = simularEstadisticas();
    await pedirClientes({ desde: '2026-09-17', hasta: '2026-10-16' }, 3);
    expect(servidor.pedidos[0]?.parametros).toEqual({ desde: '2026-09-17', hasta: '2026-10-16', pagina: 3, por_pagina: 20 });
  });
});
