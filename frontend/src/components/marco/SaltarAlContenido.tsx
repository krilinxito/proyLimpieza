/**
 * El primer Tab de cada página — SPEC-KRILINXI-023. Quien usa teclado no tiene que recorrer la
 * cabecera y el menú entero en cada pantalla para llegar a lo que vino a hacer.
 *
 * Invisible hasta que tiene el foco (`sr-only` y `focus:not-sr-only`). El foco se mueve a mano
 * en vez de dejar que el enlace cambie la dirección (`#contenido`): con el router de la app, un
 * cambio de dirección es una navegación.
 */
export function SaltarAlContenido({ destino }: { destino: string }) {
  return (
    <a
      href={`#${destino}`}
      onClick={(evento) => {
        evento.preventDefault();
        document.getElementById(destino)?.focus();
      }}
      className="sr-only rounded-xl bg-marca px-4 py-3 text-xl font-semibold text-sobre-marca focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      Saltar al contenido
    </a>
  );
}
