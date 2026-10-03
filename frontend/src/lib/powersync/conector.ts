/**
 * El conector: lo que PowerSync le pregunta a la app.
 *
 * - `fetchCredentials`: "¿con qué token me presento al servicio?". Es el `tokenPowerSync`
 *   que guardó el login (SPEC-KRILINXI-003), no el de la API: cada uno lo verifica un
 *   servidor distinto (CLAUDE.md §6).
 * - `uploadData`: "subí lo que se escribió en el dispositivo" — SPEC-KRILINXI-007. Cada
 *   cambio de la cola va a su endpoint por `lib/api`, que pone el token y traduce los errores.
 */
import { UpdateType, type CommonPowerSyncDatabase, type CrudEntry, type PowerSyncBackendConnector } from '@powersync/common';
import { api, ErrorApi } from '../api';

/** Dónde vive cada tabla en la API. Las que no están aquí no se escriben desde el dispositivo. */
const RECURSOS: Record<string, string> = {
  clientes: '/clientes',
  ordenes: '/ordenes',
  pagos: '/pagos',
  entregas: '/entregas',
};

/** Las que admiten edición: pagos y entregas no se reescriben (SPEC-ALE186-005 y 006). */
const EDITABLES = new Set(['clientes', 'ordenes']);

/**
 * Respuestas que dicen "esto no va así": reintentar daría lo mismo para siempre. El 401 NO
 * está: es la sesión la que no vale, no el dato, y con la sesión nueva el dato sube igual.
 * El 403 y el 422 tampoco cambian al reintentar, así que van con los rechazos.
 */
const RECHAZOS = new Set([400, 403, 404, 409, 422]);

type Peticion = { metodo: 'post' | 'patch'; ruta: string; cuerpo: Record<string, unknown> };

/** Lo que la API no tiene cómo recibir. Se guarda para corregir, nunca se tira. */
export class OperacionNoAdmitida extends Error {
  constructor() {
    super('Este cambio no se puede guardar así. Avisale al encargado.');
    this.name = 'OperacionNoAdmitida';
  }
}

/** Traduce una operación de la cola a la petición que la API entiende. */
export function aPeticion(operacion: CrudEntry): Peticion {
  const ruta = RECURSOS[operacion.table];
  const datos = operacion.opData ?? {};
  if (ruta && operacion.op === UpdateType.PUT) {
    // El id viaja en el cuerpo: lo generó el dispositivo (CLAUDE.md §6).
    return { metodo: 'post', ruta, cuerpo: { id: operacion.id, ...datos } };
  }
  if (ruta && operacion.op === UpdateType.PATCH && EDITABLES.has(operacion.table)) {
    return { metodo: 'patch', ruta: `${ruta}/${operacion.id}`, cuerpo: datos };
  }
  throw new OperacionNoAdmitida();
}

function esRechazo(error: unknown): error is ErrorApi | OperacionNoAdmitida {
  return error instanceof OperacionNoAdmitida || (error instanceof ErrorApi && RECHAZOS.has(error.status));
}

/** Copia lo rechazado a `para_corregir`, para que el empleado lo vea y no se pierda. */
async function guardarParaCorregir(db: CommonPowerSyncDatabase, operacion: CrudEntry, error: ErrorApi | OperacionNoAdmitida) {
  await db.execute(
    `INSERT INTO para_corregir (id, tabla, registro_id, operacion, datos, codigo, mensaje, fecha)
     VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)`,
    [
      operacion.table,
      operacion.id,
      operacion.op,
      JSON.stringify(operacion.opData ?? {}),
      error instanceof ErrorApi ? error.codigo : 'NO_ADMITIDA',
      error.message,
      new Date().toISOString(),
    ],
  );
}

/**
 * Sube la cola, una transacción por vez y en orden.
 *
 * - Aceptado (2xx, también el 200 de un reintento): la transacción se da por subida.
 * - Sin conexión, 5xx o sesión vencida: se lanza. PowerSync reintenta más tarde con la cola
 *   intacta; nada escrito se pierde.
 * - Rechazado: se guarda en `para_corregir` y se sigue. Si se lanzara, un solo rechazo
 *   trabaría para siempre todo lo que viene detrás.
 */
export async function subirCola(db: CommonPowerSyncDatabase): Promise<void> {
  for (let transaccion = await db.getNextCrudTransaction(); transaccion; transaccion = await db.getNextCrudTransaction()) {
    for (const operacion of transaccion.crud) {
      try {
        const { metodo, ruta, cuerpo } = aPeticion(operacion);
        await api.request({ method: metodo, url: ruta, data: cuerpo });
      } catch (error) {
        if (!esRechazo(error)) throw error;
        await guardarParaCorregir(db, operacion, error);
      }
    }
    await transaccion.complete();
  }
}

export function crearConector(url: string, obtenerToken: () => string | null): PowerSyncBackendConnector {
  return {
    async fetchCredentials() {
      // Se consulta en cada conexión, nunca se guarda: si mañana la sesión se renueva, el
      // token nuevo se usa sin tocar este archivo. Sin sesión, `null` le dice a PowerSync
      // que no hay nadie adentro, y no se conecta.
      const token = obtenerToken();
      return token ? { endpoint: url, token } : null;
    },

    uploadData: subirCola,
  };
}
