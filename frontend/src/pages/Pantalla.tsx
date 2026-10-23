import type { ReactNode } from 'react';

/**
 * El título de una pantalla y su contenido.
 *
 * No es un `<main>`: el único de la página es el del marco (`pages/Marco.tsx`, SPEC-KRILINXI-023),
 * que lo rodea con la cabecera, el menú y el pie. Dos `<main>` confundirían al lector de pantalla
 * sobre dónde empieza lo importante.
 */
export function Pantalla({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    // `relative`: la flechita de volver (`BotonAtras`) se coloca respecto de esta columna, en el hueco de su izquierda.
    <div className="relative mx-auto max-w-3xl px-4 py-6 lg:px-6">
      <h1 className="text-3xl font-bold text-texto">{titulo}</h1>
      {children}
    </div>
  );
}
