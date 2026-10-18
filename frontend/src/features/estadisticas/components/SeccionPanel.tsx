import type { ReactNode } from 'react';
import { Tarjeta } from '../../../components/Tarjeta';

/**
 * Una sección del panel, en su tarjeta — SPEC-KRILINXI-026. Los gráficos se dibujan sobre la
 * superficie, que es contra la que se validaron sus colores (`tema.test.ts`).
 *
 * `nombre` es el de la región ("Cobrado"), corto y fijo; `titulo`, el encabezado que se ve, con
 * el período ("Cobrado de hoy"). Por eso no se usa el `titulo` de `Tarjeta`, que nombraría la
 * región con el período y la haría cambiar de nombre al elegir fechas.
 */
export function SeccionPanel({ nombre, titulo, children }: { nombre: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-label={nombre} className="mt-8">
      <Tarjeta>
        <h2 className="text-2xl font-bold text-texto">{titulo}</h2>
        {children}
      </Tarjeta>
    </section>
  );
}
