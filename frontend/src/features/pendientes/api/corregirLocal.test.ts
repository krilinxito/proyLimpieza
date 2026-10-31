import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { baseLocalDePrueba } from '../../../test/baseLocalDePrueba';
import { clienteDePrueba, ordenDePrueba, SUCURSAL_DE_PRUEBA } from '../../../test/filasDePrueba';
import { subirAceptando, subirRechazando } from '../../../test/rechazos';
import { telefonoDeOtro } from '../../clientes/api/clientesLocal';
import { MENSAJES } from '../../ordenes/api/ordenesLocal';
import { MENSAJES_RENGLON } from '../../ordenes/renglones';
import { MENSAJES_CORRECCION, prepararCorreccion } from '../correccion';
import { descartarRegistro, guardarCorreccion } from './corregirLocal';
import { listarParaCorregir, type RegistroParaCorregir } from './paraCorregirLocal';

const BOLETA_REPETIDA = 'Ese número de boleta ya está usado en esta sucursal. Revisa el papel y vuelve a escribirlo.';

/** Una orden recién registrada en la tablet (en la cola, sin subir), como la escribe registrar ropa. */
async function registrarOrden(base: Awaited<ReturnType<typeof baseLocalDePrueba>>['control']['base'], cambios = {}) {
  const orden = ordenDePrueba(cambios);
  const columnas = Object.keys(orden);
  await base.ejecutar(
    `INSERT INTO ordenes (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
    Object.values(orden),
  );
  return orden;
}

/** El único registro para corregir que hay. */
async function elRechazado(base: Parameters<typeof listarParaCorregir>[0]): Promise<RegistroParaCorregir> {
  const [registro, ...otros] = await listarParaCorregir(base);
  expect(otros).toEqual([]);
  if (!registro) throw new Error('No hay ningún registro para corregir.');
  return registro;
}

describe('Corregir: qué formulario se abre — SPEC-KRILINXI-013', () => {
  it('una orden rechazada abre sus datos tal como se enviaron, sin el precio (SPEC-KRILINXI-068)', async () => {
    const { control, db } = await baseLocalDePrueba();
    await registrarOrden(control.base, { numero_boleta: '001234', descripcion: '2 sacos', precio_total: '1250.50' });
    await subirRechazando(db, 409, 'BOLETA_DUPLICADA', BOLETA_REPETIDA);

    const correccion = prepararCorreccion(await elRechazado(control.base));

    expect(correccion).toEqual({
      tipo: 'formulario',
      campos: expect.any(Array),
      // El precio de una boleta sale de sus renglones: no se corrige acá (SPEC-KRILINXI-068).
      valores: { numero_boleta: '001234', descripcion: '2 sacos', fecha_estimada_salida: '' },
    });
  });

  it('una edición muestra solo lo que se cambió', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const rosa = clienteDePrueba();
    await sembrar('clientes', [rosa]);
    await control.base.ejecutar("UPDATE clientes SET telefono = '70999999' WHERE id = ?", [rosa.id]);
    await subirRechazando(db, 409, 'TELEFONO_DUPLICADO', 'Ese teléfono ya es de otro cliente.');

    const correccion = prepararCorreccion(await elRechazado(control.base));

    expect(correccion.tipo === 'formulario' && correccion.campos.map((c) => c.clave)).toEqual(['telefono']);
  });

  it('un cambio de estado no abre formulario: dice dónde rehacerlo', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const orden = ordenDePrueba();
    await sembrar('ordenes', [orden]);
    await control.base.ejecutar("UPDATE ordenes SET estado = 'LISTO' WHERE id = ?", [orden.id]);
    await subirRechazando(db, 409, 'TRANSICION_INVALIDA', 'Esta ropa ya fue anulada.');

    expect(prepararCorreccion(await elRechazado(control.base))).toEqual({
      tipo: 'sin-formulario',
      mensaje: MENSAJES_CORRECCION.estado,
    });
  });
});

describe('Corregir un alta rechazada — SPEC-KRILINXI-013', () => {
  it('la vuelve a escribir con el mismo id y la boleta nueva, la encola y la saca de la lista', async () => {
    const { control, db } = await baseLocalDePrueba();
    const orden = await registrarOrden(control.base, { numero_boleta: '001234' });
    await subirRechazando(db, 409, 'BOLETA_DUPLICADA', BOLETA_REPETIDA);
    const registro = await elRechazado(control.base);
    const { valores } = prepararCorreccion(registro) as { valores: Record<string, string> };

    const resultado = await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, registro, {
      ...valores,
      numero_boleta: '001235',
    });

    expect(resultado).toEqual({ tipo: 'guardada' });
    expect(await listarParaCorregir(control.base)).toEqual([]);
    // Lo que sube es la misma alta, con la boleta corregida y todo lo demás tal cual.
    const pedidos = await subirAceptando(db);
    expect(pedidos).toEqual([
      expect.objectContaining({
        metodo: 'POST',
        ruta: '/ordenes',
        cuerpo: expect.objectContaining({
          id: orden.id,
          numero_boleta: '001235',
          cliente_id: orden.cliente_id,
          fecha_entrada: orden.fecha_entrada,
          precio_total: '50.00',
        }),
      }),
    ]);
  });

  it('funciona aunque la fila rechazada siga en la tablet (todavía no se revirtió)', async () => {
    const { control, db } = await baseLocalDePrueba();
    const orden = await registrarOrden(control.base, { numero_boleta: '001234' });
    await subirRechazando(db, 409, 'BOLETA_DUPLICADA', BOLETA_REPETIDA);
    // La base de prueba nunca sincroniza: la fila rechazada sigue ahí, con su boleta.
    expect(await control.base.consultar('SELECT numero_boleta FROM ordenes')).toEqual([{ numero_boleta: '001234' }]);
    const registro = await elRechazado(control.base);

    // Ni su propia boleta cuenta como repetida: es la fila que se está corrigiendo.
    const resultado = await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, registro, {
      numero_boleta: '001234',
      descripcion: '2 pantalones',
      precio_total: '50',
      fecha_estimada_salida: '',
    });

    expect(resultado).toEqual({ tipo: 'guardada' });
    expect(await control.base.consultar('SELECT id FROM ordenes')).toEqual([{ id: orden.id }]);
  });

  it('valida la boleta contra la sucursal con el mismo mensaje que registrar ropa, y no escribe nada', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    await sembrar('ordenes', [ordenDePrueba({ numero_boleta: '009999' })]);
    await registrarOrden(control.base, { numero_boleta: '001234' });
    await subirRechazando(db, 409, 'BOLETA_DUPLICADA', BOLETA_REPETIDA);
    const registro = await elRechazado(control.base);

    const resultado = await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, registro, {
      numero_boleta: '009999',
      descripcion: '2 pantalones',
      precio_total: '50',
      fecha_estimada_salida: '',
    });

    expect(resultado).toEqual({ tipo: 'invalida', errores: { numero_boleta: MENSAJES.boletaOcupada } });
    expect(await listarParaCorregir(control.base)).toHaveLength(1);
    expect(await db.getCrudBatch()).toBeNull();
  });

  it('si el servidor rechaza también la corrección, vuelve a la lista con el motivo nuevo', async () => {
    const { control, db } = await baseLocalDePrueba();
    await registrarOrden(control.base, { numero_boleta: '001234' });
    await subirRechazando(db, 409, 'BOLETA_DUPLICADA', BOLETA_REPETIDA);
    const registro = await elRechazado(control.base);
    await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, registro, {
      numero_boleta: '001235',
      descripcion: '2 pantalones',
      precio_total: '50',
      fecha_estimada_salida: '',
    });

    await subirRechazando(db, 409, 'SUCURSAL_CERRADA', 'Esta sucursal está cerrada.');

    expect(await elRechazado(control.base)).toEqual(
      expect.objectContaining({ que: 'Ropa con la boleta 001235', mensaje: 'Esta sucursal está cerrada.' }),
    );
  });

  it('un cobro rechazado porque su orden no llegó se reenvía tal cual una vez corregida la orden', async () => {
    const { control, db } = await baseLocalDePrueba();
    const orden = await registrarOrden(control.base, { numero_boleta: '001234' });
    await control.base.ejecutar(
      "INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo) VALUES (uuid(), ?, ?, '20.00', 'ADELANTO', 'EFECTIVO')",
      [orden.id, SUCURSAL_DE_PRUEBA],
    );
    await subirRechazando(db, 409, 'BOLETA_DUPLICADA', BOLETA_REPETIDA);
    const [laOrden, elCobro] = await listarParaCorregir(control.base);
    if (!laOrden || !elCobro) throw new Error('Faltan registros para corregir.');

    await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, laOrden, {
      numero_boleta: '001235',
      descripcion: '2 pantalones',
      precio_total: '50',
      fecha_estimada_salida: '',
    });
    const { valores } = prepararCorreccion(elCobro) as { valores: Record<string, string> };
    expect(await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, elCobro, valores)).toEqual({ tipo: 'guardada' });

    // En el orden en que se corrigieron: primero la orden, después el cobro que le apunta.
    const pedidos = await subirAceptando(db);
    expect(pedidos.map((p) => [p.ruta, (p.cuerpo as Record<string, unknown>).orden_id ?? null])).toEqual([
      ['/ordenes', null],
      ['/pagos', orden.id],
    ]);
  });
});

describe('Corregir una edición rechazada — SPEC-KRILINXI-013', () => {
  it('manda como edición solo lo corregido', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const rosa = clienteDePrueba({ telefono: '70123456' });
    await sembrar('clientes', [rosa]);
    await control.base.ejecutar("UPDATE clientes SET telefono = '70999999' WHERE id = ?", [rosa.id]);
    await subirRechazando(db, 409, 'TELEFONO_DUPLICADO', 'Ese teléfono ya es de otro cliente.');
    const registro = await elRechazado(control.base);

    expect(await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, registro, { telefono: '70888888' })).toEqual({
      tipo: 'guardada',
    });

    const pedidos = await subirAceptando(db);
    expect(pedidos).toEqual([
      expect.objectContaining({ metodo: 'PATCH', ruta: `/clientes/${rosa.id}`, cuerpo: { telefono: '70888888' } }),
    ]);
  });

  it('sin ningún cambio no guarda: pide corregir o descartar', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const rosa = clienteDePrueba();
    await sembrar('clientes', [rosa]);
    await control.base.ejecutar("UPDATE clientes SET telefono = '70999999' WHERE id = ?", [rosa.id]);
    await subirRechazando(db, 409, 'TELEFONO_DUPLICADO', 'Ese teléfono ya es de otro cliente.');
    const registro = await elRechazado(control.base);

    expect(await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, registro, { telefono: '70999999' })).toEqual({
      tipo: 'invalida',
      errores: { general: MENSAJES_CORRECCION.sinCambios },
    });
  });

  it('un teléfono que ya es de otro cliente se rechaza en la tablet diciendo de quién es', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const rosa = clienteDePrueba({ telefono: '70123456' });
    await sembrar('clientes', [rosa, clienteDePrueba({ nombre: 'Juan Mamani', telefono: '70555555' })]);
    await control.base.ejecutar("UPDATE clientes SET telefono = '70999999' WHERE id = ?", [rosa.id]);
    await subirRechazando(db, 409, 'TELEFONO_DUPLICADO', 'Ese teléfono ya es de otro cliente.');

    expect(
      await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, await elRechazado(control.base), { telefono: '70555555' }),
    ).toEqual({ tipo: 'invalida', errores: { telefono: telefonoDeOtro('Juan Mamani') } });
  });
});

describe('Descartar — SPEC-KRILINXI-013', () => {
  it('lo saca de la lista sin mandar nada', async () => {
    const { control, db } = await baseLocalDePrueba();
    await registrarOrden(control.base, { id: randomUUID() });
    await subirRechazando(db, 409, 'BOLETA_DUPLICADA', BOLETA_REPETIDA);

    await descartarRegistro(control.base, (await elRechazado(control.base)).id);

    expect(await listarParaCorregir(control.base)).toEqual([]);
    expect(await db.getCrudBatch()).toBeNull();
  });
});

describe('Corregir los renglones de la boleta — SPEC-KRILINXI-068', () => {
  /** Un renglón recién escrito en la tablet (en la cola, sin subir), de la orden que se le pase. */
  async function escribirRenglon(
    base: Awaited<ReturnType<typeof baseLocalDePrueba>>['control']['base'],
    ordenId: string,
    cambios: Record<string, unknown> = {},
  ) {
    const fila = {
      id: randomUUID(),
      orden_id: ordenId,
      sucursal_id: SUCURSAL_DE_PRUEBA,
      momento: 'INGRESO',
      posicion: 0,
      descripcion: 'Camisa',
      cantidad: '2.50',
      precio_unitario: '15.00',
      ...cambios,
    };
    const columnas = Object.keys(fila);
    await base.ejecutar(
      `INSERT INTO orden_items (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
      Object.values(fila),
    );
    return fila;
  }

  it('un renglón rechazado abre sus tres datos, con la cantidad y el precio como se escriben', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const orden = ordenDePrueba();
    await sembrar('ordenes', [orden]);
    await escribirRenglon(control.base, orden.id);
    await subirRechazando(db, 409, 'TOTAL_EXCEDIDO', 'Con ese renglón, la boleta sumaría más que su total.');

    const registro = await elRechazado(control.base);

    expect(registro.que).toBe('Prenda «Camisa» de una boleta');
    expect(prepararCorreccion(registro)).toEqual({
      tipo: 'formulario',
      campos: [
        { clave: 'descripcion', etiqueta: 'Qué es', tipo: 'texto' },
        { clave: 'cantidad', etiqueta: 'Cuántas', tipo: 'cantidad' },
        { clave: 'precio_unitario', etiqueta: 'Precio de cada una (Bs)', tipo: 'monto' },
      ],
      valores: { descripcion: 'Camisa', cantidad: '2,5', precio_unitario: '15,00' },
    });
  });

  it('corregido, vuelve a subir con el mismo id y los números como texto decimal', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const orden = ordenDePrueba();
    await sembrar('ordenes', [orden]);
    const renglon = await escribirRenglon(control.base, orden.id);
    await subirRechazando(db, 409, 'TOTAL_EXCEDIDO', 'Se pasa del total.');

    const resultado = await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, await elRechazado(control.base), {
      descripcion: 'Camisa',
      cantidad: '2',
      precio_unitario: '12,50',
    });

    expect(resultado).toEqual({ tipo: 'guardada' });
    const [pedido] = await subirAceptando(db);
    expect(pedido).toMatchObject({
      metodo: 'POST',
      ruta: '/orden-items',
      cuerpo: { id: renglon.id, orden_id: orden.id, momento: 'INGRESO', cantidad: '2.00', precio_unitario: '12.50' },
    });
  });

  it('valida con las mismas reglas que al escribirlo', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const orden = ordenDePrueba();
    await sembrar('ordenes', [orden]);
    await escribirRenglon(control.base, orden.id);
    await subirRechazando(db, 409, 'TOTAL_EXCEDIDO', 'Se pasa del total.');

    expect(
      await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, await elRechazado(control.base), {
        descripcion: ' ',
        cantidad: '0',
        precio_unitario: 'quince',
      }),
    ).toEqual({
      tipo: 'invalida',
      errores: {
        descripcion: MENSAJES_RENGLON.sinDescripcion,
        cantidad: MENSAJES_RENGLON.cantidad,
        precio_unitario: MENSAJES_RENGLON.precio,
      },
    });
  });

  it('una entrega rechazada por el precio vuelve a subir con el precio final que da la tablet ahora', async () => {
    const { control, db, sembrar } = await baseLocalDePrueba();
    const orden = ordenDePrueba({ precio_total: '50.00' });
    await sembrar('ordenes', [orden]);
    // El cargo del servidor ya bajó (sincronizado); la entrega se había mandado con otro precio.
    await sembrar('orden_items', [
      { id: randomUUID(), orden_id: orden.id, momento: 'ENTREGA', descripcion: 'Recargo', cantidad: '1.00', precio_unitario: '5.00' },
    ]);
    await control.base.ejecutar(
      "INSERT INTO entregas (id, orden_id, sucursal_id, tipo_retiro, precio_final) VALUES (uuid(), ?, ?, 'CON_BOLETA', '65.00')",
      [orden.id, SUCURSAL_DE_PRUEBA],
    );
    await subirRechazando(db, 409, 'PRECIO_FINAL_DISTINTO', 'El precio de la boleta con sus cargos es Bs 55.00.');
    const registro = await elRechazado(control.base);

    // El precio final ya no es un campo que se corrija a mano.
    expect(prepararCorreccion(registro)).toMatchObject({ tipo: 'formulario', valores: { tipo_retiro: 'CON_BOLETA' } });
    const { valores } = prepararCorreccion(registro) as { valores: Record<string, string> };
    expect(valores).not.toHaveProperty('precio_final');
    expect(await guardarCorreccion(control.base, SUCURSAL_DE_PRUEBA, registro, valores)).toEqual({ tipo: 'guardada' });

    const [pedido] = await subirAceptando(db);
    expect(pedido).toMatchObject({ ruta: '/entregas', cuerpo: { orden_id: orden.id, precio_final: '55.00' } });
  });
});
