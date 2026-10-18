/**
 * La búsqueda del Mostrador: clientes y boletas en una sola lista — SPEC-KRILINXI-033.
 *
 * No es una regla nueva de búsqueda: junta las dos que ya existen (SPEC-KRILINXI-032),
 * `buscarClientes` y `buscarRopaVivo`, sobre la base local y la sucursal de trabajo.
 *
 * Qué entra de cada una:
 *  - de la ropa, solo las boletas que coinciden **por su número**. Las que coinciden por su
 *    cliente no se listan sueltas: se ven en la ficha de ese cliente, que sí está en la lista.
 *    Si no, buscar "rosa" mostraría a Rosa y, al lado, cada una de sus boletas.
 *  - de los clientes, todos los que coinciden.
 *
 * El orden: la boleta exacta primero (quien escribe el número entero busca esa), después los
 * clientes, después las otras boletas. Como mucho 6 en total, como el buscador.
 */
import type { BaseLocal } from '../../../lib/powersync';
import type { ResultadosDeBusqueda } from '../../../lib/texto';
import { buscarClientes, MAXIMO_RESULTADOS } from '../../clientes/api/clientesLocal';
import { buscarRopaVivo } from '../../ordenes/api/ropaLocal';
import type { Encontrado } from '../types';

export async function buscarEnMostrador(
  base: BaseLocal,
  sucursalId: string,
  texto: string,
): Promise<ResultadosDeBusqueda<Encontrado>> {
  const escrito = texto.trim();
  const [clientes, ropa] = await Promise.all([buscarClientes(base, texto), buscarRopaVivo(base, sucursalId, texto)]);

  const porBoleta = ropa.resultados.filter((orden) => orden.numeroBoleta.includes(escrito));
  const exactas = porBoleta.filter((orden) => orden.numeroBoleta === escrito);
  const otras = porBoleta.filter((orden) => orden.numeroBoleta !== escrito);

  const todos: Encontrado[] = [
    ...exactas.map((orden) => ({ tipo: 'boleta' as const, orden })),
    ...clientes.resultados.map((cliente) => ({ tipo: 'cliente' as const, cliente })),
    ...otras.map((orden) => ({ tipo: 'boleta' as const, orden })),
  ];
  return {
    resultados: todos.slice(0, MAXIMO_RESULTADOS),
    hayMas: todos.length > MAXIMO_RESULTADOS || clientes.hayMas || ropa.hayMas,
  };
}
