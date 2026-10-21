import type { ReactNode } from 'react';

/**
 * "Ver el detalle", plegado — SPEC-KRILINXI-042. El gráfico responde la pregunta de un vistazo; lo de
 * abajo (cada boleta, cada persona, cada cliente) sigue disponible, pero no empuja el tablero hacia
 * abajo: se abre solo si se quiere. Es un `<details>` del navegador: se maneja con el teclado y con el
 * dedo sin una línea de JavaScript, y un lector de pantalla lo anuncia como "plegado" o "desplegado".
 */
export function Detalle({ children }: { children: ReactNode }) {
  return (
    <details className="mt-4">
      <summary className="min-h-14 cursor-pointer py-3 text-xl font-semibold text-marca">Ver el detalle</summary>
      {children}
    </details>
  );
}

/** El período con mayúscula, para el renglón de debajo de la pregunta: "de hoy" → "De hoy". */
export function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
