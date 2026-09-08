// Dinero, en centavos enteros.
//
// Postgres guarda los montos como NUMERIC(10,2), que es decimal exacto. Ni
// JavaScript ni SQLite tienen ese tipo: el `number` de JS es punto flotante
// binario y no puede representar 0.1 exactamente. Por eso:
//
//   0.1 + 0.2 === 0.30000000000000004
//
// Da igual que el error sea diminuto: sumado sobre miles de pagos, el saldo de
// una orden deja de cuadrar y nadie sabe por qué. La regla del proyecto
// (sección 6) es que el dinero NUNCA se toca con floats.
//
// La solución es la de siempre en contabilidad: trabajar con la unidad más
// chica —el centavo— como número ENTERO. Los enteros en JS son exactos hasta
// 9.007.199.254.740.991, y NUMERIC(10,2) llega como mucho a 99.999.999,99, que
// son 9.999.999.999 centavos. Entra de sobra.

/** Un monto en centavos. Siempre entero: 1250 son 12,50. */
export type Centavos = number;

// Lo que acepta `parse`: dígitos, un punto opcional y hasta dos decimales.
// Deliberadamente estricto — ver la nota de abajo.
const MONTO_VALIDO = /^-?\d+(\.\d{1,2})?$/;

/**
 * Convierte a centavos lo que devuelve Postgres para una columna NUMERIC.
 *
 * `pg` entrega esas columnas como string ("12.50"), y está bien que lo haga:
 * pasarlas por `Number()` es justamente lo que hay que evitar.
 *
 * Rechaza cualquier cosa con más de dos decimales, y eso incluye los resultados
 * contaminados por floats ("0.30000000000000004"). Es a propósito: si un float
 * se coló, es mejor un error ruidoso acá que un descuadre silencioso en el
 * saldo tres semanas después.
 */
export function parse(valor: string | number): Centavos {
  const texto = typeof valor === 'number' ? String(valor) : valor.trim();

  if (!MONTO_VALIDO.test(texto)) {
    throw new Error(`"${valor}" no es un monto válido (se esperaba algo como "12.50").`);
  }

  const negativo = texto.startsWith('-');
  const [enteros = '0', decimales = ''] = texto.replace('-', '').split('.');
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));

  return negativo ? -centavos : centavos;
}

/** Suma montos. Enteros con enteros: exacto por construcción. */
export function sumar(...montos: Centavos[]): Centavos {
  return montos.reduce((total, monto) => total + monto, 0);
}

/** Resta dos montos. Puede dar negativo (un saldo a favor del cliente). */
export function restar(a: Centavos, b: Centavos): Centavos {
  return a - b;
}

/**
 * Centavos -> el string decimal que entiende Postgres ("1250" -> "12.50").
 *
 * Sirve para las dos direcciones: es lo que se le pasa a una columna NUMERIC
 * como parámetro, y también lo que se manda al frontend para mostrar. El
 * símbolo de moneda y el separador decimal local son cosa de la pantalla, no
 * de este helper.
 */
export function formatear(centavos: Centavos): string {
  if (!Number.isInteger(centavos)) {
    throw new Error(`Los centavos tienen que ser un entero, y llegó ${centavos}.`);
  }

  const signo = centavos < 0 ? '-' : '';
  const absoluto = Math.abs(centavos);

  return `${signo}${Math.trunc(absoluto / 100)}.${String(absoluto % 100).padStart(2, '0')}`;
}
