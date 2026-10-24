import { Boton } from './Boton';
import { Icono } from './iconos';

type Props = {
  /** Desde 1. */
  pagina: number;
  /** Cuántos hay en total, no solo en esta página: lo dice el servidor. */
  total: number;
  porPagina: number;
  irAPagina: (pagina: number) => void;
  /** Para quien lee la pantalla en voz alta: "Páginas de clientes". */
  nombre: string;
};

/**
 * "Anteriores · Página 2 de 3 · Siguientes" — salió de la lista de clientes de las estadísticas
 * (SPEC-KRILINXI-016) cuando la auditoría (SPEC-KRILINXI-018) necesitó lo mismo.
 *
 * Desde SPEC-KRILINXI-054 es **un solo bloque** (un recuadro con los dos botones y el texto adentro) y más chico:
 * botones compactos y letra de renglón, en vez de tres piezas sueltas que ocupaban dos filas en el celular.
 *
 * Desde SPEC-KRILINXI-066, en un celular (menos de 640px) los botones son una flecha sin palabras visibles —su nombre sigue
 * siendo "Anteriores" y "Siguientes" para el lector de pantalla— y el recuadro y la letra se achican, para que todo
 * entre en un solo renglón angosto. El contador "Página N de M" se ve siempre, también ahí. Desde `sm` es la barra de
 * siempre, con palabras. Los botones siguen midiendo 48px: chicos a la vista, no al dedo.
 *
 * Desde SPEC-KRILINXI-041 se ve siempre que haya algo en la lista, también con una sola página
 * ("Página 1 de 1", con los dos botones apagados): así se sabe que la lista está paginada y que no
 * queda nada por ver, en vez de dudar si falta una barra. Con la lista vacía no se dibuja: debajo
 * de "No hay ropa" no tiene sentido.
 */
export function Paginas({ pagina, total, porPagina, irAPagina, nombre }: Props) {
  if (total === 0) return null;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  // `flex-wrap` dentro del bloque: en una pantalla muy angosta el texto baja de renglón sin salirse del recuadro.
  return (
    <nav aria-label={nombre} className="mt-3 flex justify-center sm:mt-4">
      <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl border border-borde-suave bg-superficie p-1 sm:gap-2 sm:p-1.5">
        <Boton variante="secundario" tamano="compacto" onClick={() => irAPagina(pagina - 1)} disabled={pagina <= 1}>
          <span className="sm:hidden">
            <Icono nombre="volver" tamano="size-5" />
          </span>
          <span className="sr-only sm:not-sr-only">Anteriores</span>
        </Boton>
        <p className="px-1 text-base text-texto sm:text-lg">
          Página {pagina} de {paginas}
        </p>
        <Boton variante="secundario" tamano="compacto" onClick={() => irAPagina(pagina + 1)} disabled={pagina >= paginas}>
          <span className="sr-only sm:not-sr-only">Siguientes</span>
          <span className="sm:hidden">
            <Icono nombre="seguir" tamano="size-5" />
          </span>
        </Boton>
      </div>
    </nav>
  );
}
