/**
 * Cuánto se cobró con cada forma de pago, de todas las sucursales juntas — SPEC-KRILINXI-042.
 *
 * **Es la única suma de dinero que se hace en el frontend, y es una excepción a CLAUDE.md §8** ("los
 * montos se suman en Postgres; el frontend no suma, muestra"). `/api/estadisticas/ingresos` trae el
 * desglose por forma de pago solo dentro de cada sucursal, y el gráfico "¿cuánto se cobró con cada
 * forma de pago?" necesita el total de todas. Se decidió sumar acá, en centavos enteros (`sumar`, de
 * `lib/money`, exacto por construcción: nada de floats), en vez de esperar un cambio en el backend.
 *
 * Si algún día `/ingresos` trae el total por forma de pago, este archivo se borra y el gráfico lee
 * el campo: el test de abajo (`totalesPorFormaDePago.test.ts`) compara esta suma con el `total` que
 * suma Postgres, para que una diferencia no pase desapercibida mientras tanto.
 */
import { METODOS_PAGO, type MetodoPago } from '../../lib/dominio';
import { desdeDecimal, sumar, type Centavos } from '../../lib/money';
import type { Ingresos } from './types';

/** Una forma de pago con lo cobrado en total, siempre las tres y en su orden fijo (`METODOS_PAGO`). */
export function totalesPorFormaDePago(ingresos: Ingresos): { metodo: MetodoPago; total: Centavos }[] {
  return METODOS_PAGO.map((metodo) => ({
    metodo,
    total: sumar(...ingresos.porSucursal.map((s) => desdeDecimal(s.porMetodo[metodo]))),
  }));
}
