/**
 * Provocar un rechazo del servidor de verdad — SPEC-KRILINXI-013 (por ruta: SPEC-KRILINXI-021)
 *
 * Lo que está en `para_corregir` lo escribe la subida (`subirCola`) cuando el servidor dice
 * que no. En vez de insertar esas filas a mano —y arriesgarse a que el test pruebe un
 * formato que la subida ya no escribe—, este helper sube la cola contra un servidor falso
 * que rechaza todo, y devuelve lo que le llegó:
 *
 *     const { control, db } = await baseLocalDePrueba();
 *     await control.base.ejecutar('INSERT INTO ordenes (id, numero_boleta) VALUES (?, ?)', [id, '001234']);
 *     await subirRechazando(db, 409, 'BOLETA_DUPLICADA', 'Ese número de boleta ya está usado…');
 *     // ahora `para_corregir` tiene la orden, como en la tablet
 *
 * Para la segunda subida —ver qué manda la cola después de corregir— está `subirAceptando`,
 * que contesta 201 a todo y devuelve los pedidos.
 */
import type { CommonPowerSyncDatabase } from '@powersync/common';
import { subirCola } from '../lib/powersync/conector';
import { cuerpoError, simularApi } from './apiFalsa';

export async function subirRechazando(db: CommonPowerSyncDatabase, status: number, codigo: string, mensaje: string) {
  const servidor = simularApi(() => ({ status, data: cuerpoError(codigo, mensaje) }));
  await subirCola(db);
  return servidor.pedidos;
}

/**
 * Como `subirRechazando`, pero con un rechazo distinto por ruta — SPEC-KRILINXI-021. Para el caso
 * de un cliente repetido: el cliente vuelve con 409 y su ropa con 400, porque en el servidor ese
 * cliente no existe. Una ruta que no está en la lista se acepta.
 *
 *     await subirRechazandoPorRuta(db, {
 *       '/clientes': [409, 'TELEFONO_DUPLICADO', 'Ese teléfono ya es de otro cliente.'],
 *       '/ordenes': [400, 'VALIDACION', 'Ese cliente no está registrado.'],
 *     });
 */
export async function subirRechazandoPorRuta(
  db: CommonPowerSyncDatabase,
  rechazos: Record<string, [status: number, codigo: string, mensaje: string]>,
) {
  const servidor = simularApi((pedido) => {
    const rechazo = rechazos[pedido.ruta];
    return rechazo ? { status: rechazo[0], data: cuerpoError(rechazo[1], rechazo[2]) } : { status: 201, data: {} };
  });
  await subirCola(db);
  return servidor.pedidos;
}

export async function subirAceptando(db: CommonPowerSyncDatabase) {
  const servidor = simularApi(() => ({ status: 201, data: {} }));
  await subirCola(db);
  return servidor.pedidos;
}
