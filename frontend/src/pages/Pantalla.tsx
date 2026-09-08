import type { ReactNode } from 'react';

/**
 * Envoltorio mínimo de una pantalla: título grande y contenido.
 *
 * Deliberadamente pobre. Los componentes de mostrador de verdad —botones grandes, modal de
 * confirmación, aviso de conexión— son de su propia spec; meterlos aquí ahora sería
 * inventarlos dos veces.
 */
export function Pantalla({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold text-slate-900">{titulo}</h1>
      {children}
    </main>
  );
}
