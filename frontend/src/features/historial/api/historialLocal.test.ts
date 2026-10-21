import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import {
  clienteDePrueba,
  entregaDePrueba,
  ordenDePrueba,
  pagoDePrueba,
  SUCURSAL_DE_PRUEBA,
} from '../../../test/filasDePrueba';
import { FILTRO_INICIAL, type FiltroHistorial } from '../filtro';
import { listarHistorialLocal } from './historialLocal';

/**
 * Contra la base local de verdad (SQLite): lo que se prueba es el SQL y las reglas que se aplican
 * después sobre lo leído — SPEC-KRILINXI-041. "Hoy" se pasa fijo: el 16/10/2026 en Bolivia, así los
 * últimos 30 días van del 17/09 al 16/10 y nada depende del reloj.
 */
const HOY = '2026-10-16';

const ROSA = clienteDePrueba({ nombre: 'Rosa Quispe', telefono: '70123456' });
const JUAN = clienteDePrueba({ nombre: 'Juan Mamani', telefono: '71111111', carnet: '445566 LP' });

/** Una sucursal con boletas de todo tipo, para que cada test mire lo suyo. */
async function sucursalConBoletas() {
  const prueba = await baseLocalDePrueba();
  const reciente = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000010', estado: 'LISTO', fecha_entrada: '2026-10-15T14:00:00.000Z' });
  const pagada = ordenDePrueba({ cliente_id: JUAN.id, numero_boleta: '000011', estado: 'EN_PROCESO', fecha_entrada: '2026-10-10T12:00:00.000Z' });
  // Entregada en la tablet, todavía sin sincronizar: la columna sigue diciendo LISTO.
  const entregada = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000012', estado: 'LISTO', precio_total: '60.00', fecha_entrada: '2026-10-12T12:00:00.000Z' });
  const anulada = ordenDePrueba({ cliente_id: JUAN.id, numero_boleta: '000013', estado: 'ANULADO', fecha_entrada: '2026-10-05T12:00:00.000Z' });
  const vieja = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000014', estado: 'LISTO', fecha_entrada: '2026-08-01T12:00:00.000Z' });
  const deOtraSucursal = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000015', sucursal_id: randomUUID(), fecha_entrada: '2026-10-14T12:00:00.000Z' });

  await prueba.sembrar('clientes', [ROSA, JUAN]);
  await prueba.sembrar('ordenes', [reciente, pagada, entregada, anulada, vieja, deOtraSucursal]);
  await prueba.sembrar('pagos', [
    pagoDePrueba({ orden_id: pagada.id, monto: '50.00' }),
    pagoDePrueba({ orden_id: entregada.id, monto: '40.00' }),
  ]);
  await prueba.sembrar('entregas', [entregaDePrueba({ orden_id: entregada.id, precio_final: '70.00' })]);
  return { ...prueba, reciente, pagada, entregada, anulada, vieja };
}

async function listar(prueba: { control: { base: Parameters<typeof listarHistorialLocal>[0] } }, filtro: Partial<FiltroHistorial> = {}) {
  return listarHistorialLocal(prueba.control.base, SUCURSAL_DE_PRUEBA, { ...FILTRO_INICIAL, ...filtro }, HOY);
}

const boletas = (lista: { numeroBoleta: string }[]) => lista.map((b) => b.numeroBoleta);

describe('Historial de la sucursal, de la base local — SPEC-KRILINXI-041', () => {
  it('sin filtros trae los últimos 30 días de la sucursal, de la más nueva a la más vieja', async () => {
    const prueba = await sucursalConBoletas();

    const lista = await listar(prueba);

    // La de hace dos meses y la de otra sucursal no están.
    expect(boletas(lista)).toEqual(['000010', '000012', '000011', '000013']);
  });

  it('cada boleta trae su cliente, su día en Bolivia, su estado y su saldo', async () => {
    const prueba = await sucursalConBoletas();

    const lista = await listar(prueba);
    const [reciente, entregada, pagada, anulada] = lista;

    expect(reciente).toMatchObject({
      clienteNombre: 'Rosa Quispe',
      clienteTelefono: '70123456',
      // 14:00 UTC = 10:00 en Bolivia, el mismo día.
      dia: '2026-10-15',
      estado: 'LISTO',
      precioTotal: 5000,
      pagado: 0,
      saldo: 5000,
      sucursalNombre: null,
    });
    // Se ve ENTREGADO aunque la columna diga LISTO, y el saldo cuenta con el precio final.
    expect(entregada).toMatchObject({ estado: 'ENTREGADO', precioFinal: 7000, pagado: 4000, saldo: 3000 });
    expect(pagada).toMatchObject({ estado: 'EN_PROCESO', pagado: 5000, saldo: 0 });
    expect(anulada).toMatchObject({ estado: 'ANULADO' });
  });

  describe('las fechas', () => {
    it('el día es el de Bolivia, no el de UTC: a las 02:00 UTC todavía es el día anterior', async () => {
      const prueba = await baseLocalDePrueba();
      await prueba.sembrar('clientes', [ROSA]);
      // 02:00 UTC del 17/09 = 22:00 del 16/09 en Bolivia: un día antes de que empiece la ventana.
      const fuera = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000001', fecha_entrada: '2026-09-17 02:00:00' });
      // 05:00 UTC del 17/09 = 01:00 del 17/09 en Bolivia: el primer día de la ventana.
      const dentro = ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000002', fecha_entrada: '2026-09-17 05:00:00' });
      await prueba.sembrar('ordenes', [fuera, dentro]);

      expect(boletas(await listar(prueba))).toEqual(['000002']);
    });

    it('lee las dos formas en que se guarda la fecha: con zona (la tablet) y sin zona (el servidor)', async () => {
      const prueba = await baseLocalDePrueba();
      await prueba.sembrar('clientes', [ROSA]);
      await prueba.sembrar('ordenes', [
        ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000001', fecha_entrada: '2026-10-15T14:00:00.000Z' }),
        ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000002', fecha_entrada: '2026-10-15 15:00:00' }),
      ]);

      const lista = await listar(prueba);

      // Mismo día, y la de las 15:00 UTC es más nueva que la de las 14:00 UTC aunque una lleve "T" y la otra espacio.
      expect(boletas(lista)).toEqual(['000002', '000001']);
      expect(lista.map((b) => b.dia)).toEqual(['2026-10-15', '2026-10-15']);
    });

    it('con fechas elegidas mira esas, también si son anteriores a los 30 días', async () => {
      const prueba = await sucursalConBoletas();

      const lista = await listar(prueba, { fechas: { desde: '2026-07-01', hasta: '2026-08-31' } });

      expect(boletas(lista)).toEqual(['000014']);
    });

    it('incluye el primer y el último día elegidos', async () => {
      const prueba = await sucursalConBoletas();

      const lista = await listar(prueba, { fechas: { desde: '2026-10-05', hasta: '2026-10-10' } });

      expect(boletas(lista)).toEqual(['000011', '000013']);
    });

    it('una boleta sin fecha que se entienda no aparece en ninguna ventana', async () => {
      const prueba = await baseLocalDePrueba();
      await prueba.sembrar('clientes', [ROSA]);
      await prueba.sembrar('ordenes', [ordenDePrueba({ cliente_id: ROSA.id, numero_boleta: '000001', fecha_entrada: 'ayer' })]);

      expect(await listar(prueba)).toEqual([]);
    });
  });

  describe('el buscador', () => {
    it('encuentra por parte del número de boleta (las boletas tienen ceros adelante)', async () => {
      const prueba = await sucursalConBoletas();

      expect(boletas(await listar(prueba, { texto: '0012' }))).toEqual(['000012']);
      expect(boletas(await listar(prueba, { texto: '000010' }))).toEqual(['000010']);
    });

    it('encuentra por el nombre del cliente, sin importar tildes ni mayúsculas', async () => {
      const prueba = await sucursalConBoletas();

      expect(boletas(await listar(prueba, { texto: 'ROSA' }))).toEqual(['000010', '000012']);
      expect(boletas(await listar(prueba, { texto: 'mamaní' }))).toEqual(['000011', '000013']);
    });

    it('encuentra por el teléfono del cliente, aunque se escriba con guion, y por su carnet', async () => {
      const prueba = await sucursalConBoletas();

      expect(boletas(await listar(prueba, { texto: '7012-34' }))).toEqual(['000010', '000012']);
      expect(boletas(await listar(prueba, { texto: '445566' }))).toEqual(['000011', '000013']);
    });

    it('cada palabra tiene que coincidir: "rosa 7012" no trae a otra Rosa', async () => {
      const prueba = await sucursalConBoletas();
      const otraRosa = clienteDePrueba({ nombre: 'Rosa Torrez', telefono: '79999999' });
      await prueba.sembrar('clientes', [otraRosa]);
      await prueba.sembrar('ordenes', [
        ordenDePrueba({ cliente_id: otraRosa.id, numero_boleta: '000020', fecha_entrada: '2026-10-14T12:00:00.000Z' }),
      ]);

      expect(boletas(await listar(prueba, { texto: 'rosa 7012' }))).toEqual(['000010', '000012']);
    });

    it('un % o un _ escritos no son comodines', async () => {
      const prueba = await sucursalConBoletas();

      // Si fueran comodines, "ro%" encontraría a Rosa y "r_sa" también.
      expect(await listar(prueba, { texto: 'ro%' })).toEqual([]);
      expect(await listar(prueba, { texto: 'r_sa' })).toEqual([]);
    });

    it('con una sola letra todavía no filtra: trae todo, como sin escribir nada', async () => {
      const prueba = await sucursalConBoletas();

      expect(boletas(await listar(prueba, { texto: 'r' }))).toEqual(boletas(await listar(prueba)));
    });
  });

  describe('estado y saldo', () => {
    it('filtra por el estado que se ve: ENTREGADO es la que tiene entrega, aunque la columna diga LISTO', async () => {
      const prueba = await sucursalConBoletas();

      expect(boletas(await listar(prueba, { estado: 'ENTREGADO' }))).toEqual(['000012']);
      // La entregada ya no cuenta como LISTO: solo la reciente.
      expect(boletas(await listar(prueba, { estado: 'LISTO' }))).toEqual(['000010']);
      expect(boletas(await listar(prueba, { estado: 'ANULADO' }))).toEqual(['000013']);
    });

    it('"con saldo" deja las que se deben: ni las pagadas ni las anuladas', async () => {
      const prueba = await sucursalConBoletas();

      // 000010 debe todo; 000012 (entregada) debe 70 - 40; 000011 está pagada; 000013 está anulada.
      expect(boletas(await listar(prueba, { conSaldo: true }))).toEqual(['000010', '000012']);
    });

    it('los filtros se combinan', async () => {
      const prueba = await sucursalConBoletas();

      const lista = await listar(prueba, { texto: 'rosa', conSaldo: true, estado: 'ENTREGADO', fechas: { desde: '2026-10-01', hasta: '2026-10-31' } });

      expect(boletas(lista)).toEqual(['000012']);
    });
  });

  it('solo trae la sucursal que se pide', async () => {
    const prueba = await sucursalConBoletas();

    const deOtra = await listarHistorialLocal(prueba.control.base, 'otra-sucursal', FILTRO_INICIAL, HOY);

    expect(deOtra).toEqual([]);
  });
});
