import { Boton } from './Boton';

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
 * (SPEC-KRILINXI-016) cuando la auditoría (SPEC-KRILINXI-018) necesitó lo mismo. Con una sola
 * página no muestra nada.
 */
export function Paginas({ pagina, total, porPagina, irAPagina, nombre }: Props) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas === 1) return null;
  return (
    <nav aria-label={nombre} className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <Boton variante="secundario" onClick={() => irAPagina(pagina - 1)} disabled={pagina <= 1}>
        Anteriores
      </Boton>
      <p className="text-xl text-texto">
        Página {pagina} de {paginas}
      </p>
      <Boton variante="secundario" onClick={() => irAPagina(pagina + 1)} disabled={pagina >= paginas}>
        Siguientes
      </Boton>
    </nav>
  );
}
