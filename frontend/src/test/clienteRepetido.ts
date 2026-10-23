/**
 * Un cliente dado de alta en dos tablets — SPEC-KRILINXI-021
 *
 * Esta tablet da de alta a Rosa sin internet y le registra ropa con adelanto. Otra tablet ya la
 * había dado de alta: al subir, el cliente vuelve con 409 (teléfono repetido) y la ropa y el
 * adelanto con 400 (su cliente no existe en el servidor). Después baja la Rosa de la otra tablet,
 * salvo que se pida lo contrario:
 *
 *     const { control, db, cliente } = await dosTabletsConLaMismaRosa();
 *     // `cliente` es el registro para corregir del cliente rechazado
 *     const sinLaOtra = await dosTabletsConLaMismaRosa({ bajaLaOtra: false });
 */
import { baseLocalDePrueba } from './baseLocalDePrueba';
import { SUCURSAL_DE_PRUEBA } from './filasDePrueba';
import { subirRechazandoPorRuta } from './rechazos';
import { listarParaCorregir } from '../features/pendientes/api/paraCorregirLocal';

export const ROSA_RECHAZADA = '00000000-0000-4000-8000-0000000000a1';
export const ROSA_DE_LA_OTRA_TABLET = '00000000-0000-4000-8000-0000000000b1';
export const ORDEN = '00000000-0000-4000-8000-0000000000c9';

export async function dosTabletsConLaMismaRosa({ bajaLaOtra = true } = {}) {
  const prueba = await baseLocalDePrueba();
  const { base } = prueba.control;
  await base.ejecutar("INSERT INTO clientes (id, nombre, telefono) VALUES (?, 'Rosa Q.', '70123456')", [ROSA_RECHAZADA]);
  await base.ejecutar(
    "INSERT INTO ordenes (id, numero_boleta, cliente_id, sucursal_id, descripcion, fecha_entrada, precio_total, estado) VALUES (?, '001234', ?, ?, '2 sacos', '2026-10-16T14:00:00.000Z', '50.00', 'RECIBIDO')",
    [ORDEN, ROSA_RECHAZADA, SUCURSAL_DE_PRUEBA],
  );
  await base.ejecutar(
    "INSERT INTO pagos (id, orden_id, sucursal_id, monto, tipo, metodo, fecha_pago) VALUES (uuid(), ?, ?, '20.00', 'ADELANTO', 'EFECTIVO', '2026-10-16T14:00:00.000Z')",
    [ORDEN, SUCURSAL_DE_PRUEBA],
  );
  await subirRechazandoPorRuta(prueba.db, {
    '/clientes': [409, 'TELEFONO_DUPLICADO', 'Ese teléfono ya es de Rosa Quispe.'],
    '/ordenes': [400, 'VALIDACION', 'Ese cliente no está registrado. Búscalo por su teléfono o dalo de alta.'],
    '/pagos': [400, 'VALIDACION', 'Esa orden no existe en esta sucursal. Revisa el número de boleta.'],
  });
  if (bajaLaOtra) await prueba.sembrar('clientes', [{ id: ROSA_DE_LA_OTRA_TABLET, nombre: 'Rosa Quispe', telefono: '70123456' }]);
  const [cliente] = (await listarParaCorregir(base)).filter((r) => r.tabla === 'clientes');
  if (!cliente) throw new Error('El cliente no quedó para corregir.');
  return { ...prueba, cliente };
}

