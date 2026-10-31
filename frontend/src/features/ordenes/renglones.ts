/**
 * Los renglones de la boleta — SPEC-KRILINXI-068: qué prenda, cuántas y a qué precio cada una.
 *
 * Es la parte pura (sin base ni pantalla), en un solo lugar: la usan Registrar ropa (los renglones de la boleta), la
 * entrega (los cargos al entregar, que son renglones también) y Para corregir (un renglón que el servidor rechazó). Las
 * reglas repiten las del backend (`ordenItems.controller.ts`) con sus mismos límites: acá son cortesía, para que el
 * empleado se entere al momento; la garantía es del servidor (CLAUDE.md §6).
 *
 * El subtotal se calcula con `subtotal` de `lib/money`, la misma cuenta que hace Postgres. Nunca se guarda: la base
 * guarda cantidad y precio unitario, y el subtotal sale siempre de ellos.
 */
import {
  CANTIDAD_MAXIMA,
  formatearCantidad,
  parsearCantidad,
  parsearMonto,
  subtotal,
  sumar,
  type Centavos,
} from '../../lib/money';

const LARGO_MAXIMO_DESCRIPCION = 150; // VARCHAR(150) en `orden_items`
const MONTO_MAXIMO: Centavos = 9_999_999_999; // NUMERIC(10,2)

export const MENSAJES_RENGLON = {
  sinDescripcion: 'Escribe qué es, por ejemplo «Camisa» o «Edredón».',
  descripcionLarga: 'Esa descripción es demasiado larga. Escríbela más corta.',
  cantidad: 'Escribe cuántas son, con números mayores que cero, por ejemplo 2 o 2,5.',
  cantidadAlta: 'Esa cantidad es demasiado alta. Revísala.',
  precio: 'Escribe el precio de cada una con números, por ejemplo 15 o 15,50.',
  subtotalAlto: 'El subtotal de esta prenda es demasiado alto. Revisa la cantidad y el precio.',
  totalAlto: 'El total de la boleta es demasiado alto. Revisa las cantidades y los precios.',
} as const;

/** Un renglón tal como lo escribe el empleado, sin limpiar. */
export type RenglonEscrito = {
  /**
   * Lo identifica mientras se escribe (para saber qué campo se tocó aunque se quite otro renglón) y, al guardar, es su
   * `id` en la base: lo genera el dispositivo, como todos (CLAUDE.md §6).
   */
  clave: string;
  descripcion: string;
  /** Como la escribió: "2", "2,5". */
  cantidad: string;
  /** Como lo escribió: "15", "15,50". */
  precioUnitario: string;
};

/** Los tres datos de un renglón que pueden estar mal. */
export type CampoRenglon = 'descripcion' | 'cantidad' | 'precioUnitario';

/** El nombre de un campo de un renglón en los errores del formulario: `renglon:<clave>:<campo>`. */
export type ClaveCampoRenglon = `renglon:${string}:${CampoRenglon}`;

export function claveCampo(clave: string, campo: CampoRenglon): ClaveCampoRenglon {
  return `renglon:${clave}:${campo}`;
}

/** Un renglón ya limpio y válido. */
export type RenglonValido = {
  clave: string;
  descripcion: string;
  /** En centésimas: 2,5 son 250. */
  cantidad: number;
  precioUnitario: Centavos;
  subtotal: Centavos;
};

/** Un renglón nuevo, vacío salvo la cantidad: casi siempre es una. */
export function renglonNuevo(): RenglonEscrito {
  return { clave: crypto.randomUUID(), descripcion: '', cantidad: '1', precioUnitario: '' };
}

/** Si el empleado escribió algo en el renglón (la cantidad que ya viene puesta no cuenta). */
export function tieneAlgoEscrito(renglon: RenglonEscrito): boolean {
  return renglon.descripcion.trim() !== '' || renglon.precioUnitario.trim() !== '' || !['', '1'].includes(renglon.cantidad.trim());
}

function leer(texto: string, parsear: (t: string) => number): number | null {
  try {
    return parsear(texto);
  } catch {
    return null;
  }
}

/** Valida un renglón: lo que está mal de cada campo, o el renglón limpio si está todo bien. */
export function validarRenglon(renglon: RenglonEscrito): {
  errores: Partial<Record<CampoRenglon, string>>;
  valido: RenglonValido | null;
} {
  const errores: Partial<Record<CampoRenglon, string>> = {};
  const descripcion = renglon.descripcion.trim();
  if (descripcion === '') errores.descripcion = MENSAJES_RENGLON.sinDescripcion;
  else if (descripcion.length > LARGO_MAXIMO_DESCRIPCION) errores.descripcion = MENSAJES_RENGLON.descripcionLarga;

  const cantidad = leer(renglon.cantidad, parsearCantidad);
  if (cantidad === null || cantidad <= 0) errores.cantidad = MENSAJES_RENGLON.cantidad;
  else if (cantidad > CANTIDAD_MAXIMA) errores.cantidad = MENSAJES_RENGLON.cantidadAlta;

  const precio = leer(renglon.precioUnitario, parsearMonto);
  if (precio === null || precio > MONTO_MAXIMO) errores.precioUnitario = MENSAJES_RENGLON.precio;

  if (cantidad === null || precio === null || Object.keys(errores).length > 0) return { errores, valido: null };

  const elSubtotal = subtotal(cantidad, precio);
  if (elSubtotal > MONTO_MAXIMO) return { errores: { precioUnitario: MENSAJES_RENGLON.subtotalAlto }, valido: null };
  return { errores, valido: { clave: renglon.clave, descripcion, cantidad, precioUnitario: precio, subtotal: elSubtotal } };
}

/** El subtotal que se puede mostrar mientras se escribe, o null si el renglón todavía no tiene cantidad y precio válidos. */
export function subtotalEscrito(renglon: RenglonEscrito): Centavos | null {
  const cantidad = leer(renglon.cantidad, parsearCantidad);
  const precio = leer(renglon.precioUnitario, parsearMonto);
  if (cantidad === null || precio === null || cantidad <= 0 || cantidad > CANTIDAD_MAXIMA) return null;
  return subtotal(cantidad, precio);
}

/** Lo que suman los renglones que ya tienen cantidad y precio: el total que se muestra mientras se escribe. */
export function totalEscrito(renglones: readonly RenglonEscrito[]): Centavos {
  return sumar(...renglones.map((r) => subtotalEscrito(r) ?? 0));
}

/** El total de renglones válidos, o el error si se pasa de lo que entra en la base. */
export function totalDe(renglones: readonly RenglonValido[]): { total: Centavos; error: string | null } {
  const total = sumar(...renglones.map((r) => r.subtotal));
  return { total, error: total > MONTO_MAXIMO ? MENSAJES_RENGLON.totalAlto : null };
}

/** Lo que suman los cargos al entregar (renglones de ENTREGA) de una orden, según la tablet. */
export function sumaDeCargos(renglones: readonly { momento: string; subtotal: Centavos }[]): Centavos {
  return sumar(...renglones.filter((r) => r.momento === 'ENTREGA').map((r) => r.subtotal));
}

/**
 * La descripción de la boleta armada con sus renglones: "2 Camisa, 1 Edredón king". Es lo que se guarda en
 * `ordenes.descripcion`, así el buscador, el historial y las boletas de antes siguen funcionando sin cambios.
 */
export function describirRenglones(renglones: readonly Pick<RenglonValido, 'cantidad' | 'descripcion'>[]): string {
  return renglones.map((r) => `${formatearCantidad(r.cantidad)} ${r.descripcion}`).join(', ');
}
