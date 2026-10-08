// Límite de intentos en el login — SPEC-ALE186-016.
//
// Es lógica de negocio que no es de ninguna tabla, que es justo lo que le toca a
// `services/` (CLAUDE.md, sección 5). Vive en la memoria del proceso y no en la
// base: no hay migraciones, y una tabla nueva exigiría `down -v`. El costo, que
// está anotado en §13: se pierde si el servidor se reinicia, y no alcanza si algún
// día hay más de una instancia del backend.
//
// Cuenta los intentos FALLIDOS SEGUIDOS por nombre de usuario. Después de
// `MAXIMO_FALLOS`, ese nombre queda bloqueado `BLOQUEO_MS`, aunque la contraseña
// sea la correcta. Bloquea también nombres que no existen: si solo bloqueara los
// reales, la respuesta delataría cuáles son (como el login, SPEC-ALE186-002).

/** Intentos fallidos seguidos que se toleran. El siguiente ya encuentra el bloqueo. */
export const MAXIMO_FALLOS = 5;

/**
 * Cuánto dura el bloqueo. Corto a propósito: en un mostrador, una persona mayor
 * puede equivocarse varias veces seguidas, y no puede quedarse sin trabajar.
 */
export const BLOQUEO_MS = 5 * 60 * 1000;

interface Entrada {
  fallos: number;
  ultimoFallo: number;
  /** Hasta cuándo está bloqueado (ms); `null` si todavía no llegó al máximo. */
  bloqueadoHasta: number | null;
}

export interface Limitador {
  /** Segundos que faltan para que termine el bloqueo (hacia arriba), o `null` si no está bloqueado. */
  segundosDeBloqueo(username: string): number | null;
  registrarFallo(username: string): void;
  registrarExito(username: string): void;
  /** Cuántos nombres recuerda. Para comprobar que la memoria no crece sin límite. */
  cantidad(): number;
  /** Olvida todo. Solo para los tests, que comparten este estado entre sí. */
  reiniciar(): void;
}

/**
 * Un limitador con su propio reloj.
 *
 * El reloj es el del PROCESO (`Date.now`), no `now()` de Postgres como en
 * SPEC-ALE186-015: acá solo se miden intervalos dentro del mismo servidor, nunca
 * se comparan con fechas de la base, y preguntarle la hora a la base rompería la
 * regla de no tocarla mientras el usuario está bloqueado. Se recibe como
 * parámetro para que un test pueda pasar uno falso.
 */
export function crearLimitador(ahora: () => number = () => Date.now()): Limitador {
  const entradas = new Map<string, Entrada>();

  /**
   * Olvida a quien no tiene un bloqueo vigente ni fallos recientes. Sin esto,
   * probar miles de nombres inventados dejaría miles de entradas para siempre, y
   * la memoria del servidor crecería hasta caerse. Recorrer el mapa en cada
   * consulta cuesta poco: solo quedan los nombres con actividad de los últimos
   * 5 minutos.
   */
  function olvidarViejas(t: number): void {
    for (const [username, entrada] of entradas) {
      const bloqueoVigente = entrada.bloqueadoHasta !== null && entrada.bloqueadoHasta > t;
      if (!bloqueoVigente && t - entrada.ultimoFallo >= BLOQUEO_MS) entradas.delete(username);
    }
  }

  return {
    segundosDeBloqueo(username) {
      const t = ahora();
      olvidarViejas(t);
      const entrada = entradas.get(username);
      if (entrada?.bloqueadoHasta === null || entrada === undefined) return null;
      if (entrada.bloqueadoHasta <= t) {
        // Terminó el bloqueo: vuelve a tener sus 5 intentos.
        entradas.delete(username);
        return null;
      }
      return Math.ceil((entrada.bloqueadoHasta - t) / 1000);
    },

    registrarFallo(username) {
      const t = ahora();
      const entrada = entradas.get(username) ?? { fallos: 0, ultimoFallo: t, bloqueadoHasta: null };
      entrada.fallos += 1;
      entrada.ultimoFallo = t;
      if (entrada.fallos >= MAXIMO_FALLOS) entrada.bloqueadoHasta = t + BLOQUEO_MS;
      entradas.set(username, entrada);
    },

    registrarExito(username) {
      entradas.delete(username);
    },

    cantidad() {
      return entradas.size;
    },

    reiniciar() {
      entradas.clear();
    },
  };
}

/** El limitador del login: uno solo para todo el proceso. */
export const limitadorLogin = crearLimitador();
