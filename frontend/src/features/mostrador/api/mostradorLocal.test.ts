import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { clienteDePrueba, entregaDePrueba, ordenDePrueba, SUCURSAL_DE_PRUEBA } from '../../../test/filasDePrueba';
import { obtenerCliente } from '../../clientes/api/clientesLocal';
import { ropaDelCliente } from '../../ordenes/api/ropaLocal';
import { buscarEnMostrador } from './mostradorLocal';

const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });
// Su teléfono contiene "001234": así un número puede coincidir con un cliente y con una boleta.
const MARTA = clienteDePrueba({ nombre: 'Marta Lima', telefono: '70012345' });

async function mostradorConRopa() {
  const prueba = await baseLocalDePrueba();
  const vieja = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001234', fecha_entrada: '2026-09-01T10:00:00Z' });
  const nueva = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001240', fecha_entrada: '2026-10-01T10:00:00Z' });
  const entregada = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '001250', estado: 'LISTO', fecha_entrada: '2026-10-05T10:00:00Z' });
  const deOtraSucursal = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '009999', sucursal_id: randomUUID() });
  await prueba.sembrar('clientes', [ROSA, MARTA]);
  await prueba.sembrar('ordenes', [vieja, nueva, entregada, deOtraSucursal]);
  await prueba.sembrar('entregas', [entregaDePrueba({ orden_id: entregada.id })]);
  return { ...prueba, vieja, nueva, entregada };
}

const describir = (r: Awaited<ReturnType<typeof buscarEnMostrador>>) =>
  r.resultados.map((e) => (e.tipo === 'cliente' ? `cliente ${e.cliente.nombre}` : `boleta ${e.orden.numeroBoleta}`));

describe('Buscar en el Mostrador — SPEC-KRILINXI-033', () => {
  it('por nombre trae al cliente, no cada una de sus boletas', async () => {
    const { control } = await mostradorConRopa();
    expect(describir(await buscarEnMostrador(control.base, SUCURSAL_DE_PRUEBA, 'rosa'))).toEqual(['cliente Rosa Quispe']);
  });

  it('por número: la boleta exacta primero, después los clientes, después las otras boletas', async () => {
    const { control } = await mostradorConRopa();
    expect(describir(await buscarEnMostrador(control.base, SUCURSAL_DE_PRUEBA, '001234'))).toEqual([
      'boleta 001234',
      'cliente Marta Lima',
    ]);
    expect(describir(await buscarEnMostrador(control.base, SUCURSAL_DE_PRUEBA, '0012'))).toEqual([
      'cliente Marta Lima',
      'boleta 001240',
      'boleta 001234',
      'boleta 001250',
    ]);
  });

  it('una boleta de otra sucursal no aparece', async () => {
    const { control } = await mostradorConRopa();
    expect(describir(await buscarEnMostrador(control.base, SUCURSAL_DE_PRUEBA, '009999'))).toEqual([]);
  });
});

describe('La ficha del cliente en el Mostrador — SPEC-KRILINXI-033', () => {
  it('la ropa del cliente en esta sucursal: la que sigue en el local primero, la más nueva arriba', async () => {
    const { control } = await mostradorConRopa();
    const ropa = await ropaDelCliente(control.base, SUCURSAL_DE_PRUEBA, ROSA.id);
    expect(ropa.map((o) => [o.numeroBoleta, o.estado])).toEqual([
      ['001240', 'RECIBIDO'],
      ['001234', 'RECIBIDO'],
      ['001250', 'ENTREGADO'],
    ]);
    expect(ropa.every((o) => o.clienteId === ROSA.id)).toBe(true);
  });

  it('el cliente por su id, o null si no está', async () => {
    const { control } = await mostradorConRopa();
    expect(await obtenerCliente(control.base, ROSA.id)).toMatchObject({ nombre: 'Rosa Quispe' });
    expect(await obtenerCliente(control.base, randomUUID())).toBeNull();
  });
});
