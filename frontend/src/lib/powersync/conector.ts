/**
 * El conector: lo que PowerSync le pregunta a la app.
 *
 * - `fetchCredentials`: "¿con qué token me presento al servicio?". Es el `tokenPowerSync`
 *   que guardó el login (SPEC-KRILINXI-003), no el de la API: cada uno lo verifica un
 *   servidor distinto (CLAUDE.md §6).
 * - `uploadData`: "subí lo que se escribió en el dispositivo". Todavía no: es de la spec
 *   `cola-subida`. Ver la nota en `uploadData`.
 */
import type { PowerSyncBackendConnector } from '@powersync/common';

/** Lo que falla mientras no exista la subida. Nombrado para que se reconozca en el log. */
export class SubidaNoDisponible extends Error {
  constructor() {
    super('La subida de cambios todavía no está implementada: los cambios esperan en la cola.');
    this.name = 'SubidaNoDisponible';
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

    async uploadData() {
      // Lanza a propósito, y no termina en silencio. Si terminara sin marcar la transacción
      // como subida, PowerSync vería la misma operación en la siguiente vuelta y escribiría
      // un aviso de "posible bug". Lanzando, lo toma como un error de subida: reintenta más
      // tarde y la cola queda intacta. Nada escrito en el dispositivo se pierde.
      throw new SubidaNoDisponible();
    },
  };
}
