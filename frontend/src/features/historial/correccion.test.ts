import { describe, expect, it } from 'vitest';
import { boletaDePrueba, paginaDeBoletas, renglonDePrueba, SUCURSAL_CENTRO, SUCURSAL_SUR } from '../../test/historialDePrueba';
import { leerPagina } from './api/historialApi';
import { MENSAJES_CORRECCION, datosIniciales, revisarCorreccion, type DatosCorreccion } from './correccion';
import type { BoletaListada } from './types';

/** Una boleta como la deja `historialApi` (con su `origen`), a partir de una respuesta de prueba de la API. */
function boletaLeida(cambios: Record<string, unknown> = {}): BoletaListada {
  const pagina = leerPagina(paginaDeBoletas([boletaDePrueba(cambios)]));
  const boleta = pagina?.boletas[0];
  if (!boleta) throw new Error('La boleta de prueba no encaja con el contrato.');
  return boleta;
}

function revisar(boleta: BoletaListada, cambios: Partial<DatosCorreccion>) {
  if (!boleta.origen) throw new Error('Sin origen.');
  return revisarCorreccion(boleta, boleta.origen, { ...datosIniciales(boleta, boleta.origen), ...cambios });
}

const CAMISA = renglonDePrueba({ id: '00000000-0000-4000-8000-000000000001', cantidad: '2.00', precioUnitario: '15.00', subtotal: '30.00' });
const SACO = renglonDePrueba({
  id: '00000000-0000-4000-8000-000000000002',
  descripcion: 'Saco',
  cantidad: '1.00',
  precioUnitario: '20.00',
  subtotal: '20.00',
});
const RECARGO = renglonDePrueba({
  id: '00000000-0000-4000-8000-000000000003',
  momento: 'ENTREGA',
  descripcion: 'Recargo',
  cantidad: '1.00',
  precioUnitario: '5.00',
  subtotal: '5.00',
});

describe('Corregir una boleta: de la boleta al formulario — SPEC-KRILINXI-071', () => {
  it('arranca con la boleta como está: número, sucursal, día y hora de Bolivia, fecha estimada y sus prendas', () => {
    const boleta = boletaLeida({ renglones: [CAMISA, SACO, RECARGO], precioTotal: '50.00' });

    expect(datosIniciales(boleta, boleta.origen!)).toEqual({
      numeroBoleta: '001234',
      sucursalId: SUCURSAL_CENTRO,
      dia: '2026-10-15',
      hora: '18:30',
      fechaEstimada: '2026-10-18',
      descripcion: '2 camisas, 1 terno',
      precio: '50,00',
      // Los cargos al entregar no son prendas: no se corrigen aquí.
      prendas: [
        { clave: CAMISA.id, descripcion: 'Camisa', cantidad: '2', precioUnitario: '15,00' },
        { clave: SACO.id, descripcion: 'Saco', cantidad: '1', precioUnitario: '20,00' },
      ],
    });
  });
});

describe('Corregir una boleta: qué se manda — SPEC-KRILINXI-071', () => {
  it('sin tocar nada, no se manda nada', () => {
    expect(revisar(boletaLeida({ renglones: [CAMISA, SACO], precioTotal: '50.00' }), {})).toEqual({ tipo: 'sin-cambios' });
  });

  it('solo viaja lo que cambió, con los nombres de las columnas', () => {
    const revision = revisar(boletaLeida(), { numeroBoleta: ' B-77 ', sucursalId: SUCURSAL_SUR, fechaEstimada: '' });

    expect(revision).toEqual({
      tipo: 'lista',
      cuerpo: { numero_boleta: 'B-77', sucursal_id: SUCURSAL_SUR, fecha_estimada_salida: null },
    });
  });

  it('la fecha de ingreso va con la zona de Bolivia, que no cambia en el año', () => {
    expect(revisar(boletaLeida(), { dia: '2026-10-14', hora: '09:05' })).toEqual({
      tipo: 'lista',
      cuerpo: { fecha_entrada: '2026-10-14T09:05:00-04:00' },
    });
  });

  it('si cambia una prenda, van TODAS, y la descripción se vuelve a armar con ellas; el total no se manda', () => {
    const boleta = boletaLeida({ renglones: [CAMISA, SACO], precioTotal: '50.00', descripcion: '2 Camisa, 1 Saco' });
    const { prendas } = datosIniciales(boleta, boleta.origen!);

    const revision = revisar(boleta, { prendas: [{ ...prendas[0]!, cantidad: '3' }, prendas[1]!] });

    expect(revision).toEqual({
      tipo: 'lista',
      cuerpo: {
        descripcion: '3 Camisa, 1 Saco',
        renglones: [
          { id: CAMISA.id, descripcion: 'Camisa', cantidad: '3.00', precio_unitario: '15.00' },
          { id: SACO.id, descripcion: 'Saco', cantidad: '1.00', precio_unitario: '20.00' },
        ],
      },
    });
  });

  it('quitar todas las prendas manda la lista vacía, y entonces sí el total y lo que deja, escritos', () => {
    const boleta = boletaLeida({ renglones: [CAMISA], precioTotal: '30.00', descripcion: '2 Camisa' });

    expect(revisar(boleta, { prendas: [], descripcion: 'Un terno', precio: '25' })).toEqual({
      tipo: 'lista',
      cuerpo: { descripcion: 'Un terno', renglones: [], precio_total: '25.00' },
    });
  });

  it('una boleta de antes (sin prendas) cambia su precio a mano', () => {
    expect(revisar(boletaLeida(), { precio: '55,50' })).toEqual({ tipo: 'lista', cuerpo: { precio_total: '55.50' } });
  });
});

describe('Corregir una boleta: qué está mal — SPEC-KRILINXI-071', () => {
  it.each([
    ['un número de boleta sin números', { numeroBoleta: 'ABC' }, 'numeroBoleta', MENSAJES_CORRECCION.boleta],
    ['un día vacío', { dia: '' }, 'dia', MENSAJES_CORRECCION.dia],
    ['una hora imposible', { hora: '25:00' }, 'hora', MENSAJES_CORRECCION.hora],
    ['sin prendas, nada en "Qué deja"', { descripcion: '  ' }, 'descripcion', MENSAJES_CORRECCION.descripcion],
    ['sin prendas, un precio con letras', { precio: 'veinte' }, 'precio', MENSAJES_CORRECCION.precio],
  ] as const)('%s', (_caso, cambios, campo, mensaje) => {
    const revision = revisar(boletaLeida(), cambios);

    expect(revision.tipo).toBe('invalida');
    expect(revision.tipo === 'invalida' && revision.errores[campo]).toBe(mensaje);
  });

  it('una prenda mal escrita marca su campo, con la clave de la prenda', () => {
    const boleta = boletaLeida({ renglones: [CAMISA], precioTotal: '30.00' });
    const { prendas } = datosIniciales(boleta, boleta.origen!);

    const revision = revisar(boleta, { prendas: [{ ...prendas[0]!, cantidad: '0' }] });

    expect(revision.tipo === 'invalida' && Object.keys(revision.errores)).toEqual([`renglon:${CAMISA.id}:cantidad`]);
  });
});
