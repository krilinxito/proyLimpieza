/**
 * Dinero en el dispositivo, en centavos enteros.
 *
 * Mismo principio que `backend/src/utils/money.ts` (CLAUDE.md §6): el `number` de JS es
 * punto flotante binario, `0.1 + 0.2` da `0.30000000000000004`, y sumado sobre muchos
 * pagos el saldo deja de cuadrar. Así que todo monto se guarda como la cantidad ENTERA de
 * centavos, y solo se convierte a texto en el último momento, para mostrarlo.
 *
 * La diferencia con el helper del backend es de quién viene el texto. El backend lee lo que
 * devuelve Postgres ("12.50", siempre con punto). Aquí el texto lo escribe una persona en el
 * mostrador, que puede poner coma o punto — por eso `parsearMonto` acepta los dos.
 */

/** Un monto en centavos. Siempre entero: 1250 son 12,50. */
export type Centavos = number;

// Dígitos, y como mucho UN separador (coma o punto) seguido de uno o dos decimales.
// Sin signo: en este negocio ningún monto es negativo (CLAUDE.md §3).
const MONTO_ESCRITO = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Convierte a centavos lo que escribió el empleado: "12,50", "12.50", "12,5" o "12".
 *
 * Es estricto a propósito. "1.234" se rechaza en vez de adivinar si son mil doscientos
 * treinta y cuatro o uno con veintitrés: un error que pide volver a escribirlo es mejor
 * que cobrar mil veces menos. Los mensajes de error son para mostrarse tal cual en pantalla.
 */
export function parsearMonto(texto: string): Centavos {
  const limpio = texto.trim();

  if (limpio === '') {
    throw new Error('Escribí un monto.');
  }

  const partes = MONTO_ESCRITO.exec(limpio);
  if (!partes) {
    throw new Error('El monto tiene que ser un número, con hasta dos decimales. Por ejemplo: 12,50');
  }

  const [, enteros = '0', decimales = ''] = partes;
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

/** Suma montos. Enteros con enteros: exacto por construcción. */
export function sumar(...montos: Centavos[]): Centavos {
  return montos.reduce((total, monto) => total + monto, 0);
}

/** Resta dos montos. Puede dar negativo: un saldo a favor del cliente. */
export function restar(a: Centavos, b: Centavos): Centavos {
  return a - b;
}

/**
 * Centavos → texto para la pantalla, con coma decimal y punto de miles: 123456 → "1.234,56".
 *
 * Se arma a mano y no con `Intl.NumberFormat`: el resultado de Intl depende de los datos de
 * idioma que traiga cada navegador, y un monto no puede verse distinto según la tablet. El
 * símbolo de moneda no va aquí: nadie lo confirmó todavía, y cuando se decida lo pone la
 * pantalla.
 */
export function formatearMonto(centavos: Centavos): string {
  if (!Number.isInteger(centavos)) {
    throw new Error(`Los centavos tienen que ser un entero, y llegó ${centavos}.`);
  }

  const signo = centavos < 0 ? '-' : '';
  const absoluto = Math.abs(centavos);
  const enteros = String(Math.trunc(absoluto / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimales = String(absoluto % 100).padStart(2, '0');

  return `${signo}${enteros},${decimales}`;
}
