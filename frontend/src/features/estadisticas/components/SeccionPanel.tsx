import type { ReactNode } from 'react';
import { Tarjeta } from '../../../components/Tarjeta';

/**
 * Una tarjeta del dashboard — SPEC-KRILINXI-026, y desde SPEC-KRILINXI-042 la de un gráfico que
 * responde **una pregunta**. Los gráficos se dibujan sobre la superficie, que es contra la que se
 * validaron sus colores (`tema.test.ts`).
 *
 * `nombre` es el de la región ("Cobrado por sucursal"), corto y fijo; `pregunta`, el encabezado que
 * se ve, escrito como lo diría el admin ("¿Cuánto se cobró en cada sucursal?"); `periodo`, lo que
 * mira ("De hoy"), debajo. Por eso no se usa el `titulo` de `Tarjeta`: nombraría la región con la
 * pregunta y el período, y la haría cambiar de nombre al elegir fechas.
 *
 * Es una celda de la grilla del tablero (`PantallaEstadisticas`): ocupa su lugar y se estira al
 * alto de la de al lado. `entera` la lleva a todo el ancho desde 1024px, para lo que necesita
 * espacio de largo (los treinta días de ropa recibida).
 */
export function SeccionPanel({
  nombre,
  pregunta,
  periodo,
  entera = false,
  children,
}: {
  nombre: string;
  pregunta: string;
  periodo: string;
  entera?: boolean;
  children: ReactNode;
}) {
  // `grid-cols-1` y `min-w-0`: una columna que puede ENCOGERSE. Un `grid` sin columnas definidas deja que su
  // contenido ensanche la tarjeta, y en una pantalla media (dos columnas con el menú al costado) pisaba a la vecina.
  return (
    <section aria-label={nombre} className={`grid min-w-0 grid-cols-1 ${entera ? 'lg:col-span-2' : ''}`}>
      <Tarjeta>
        <h2 className="text-2xl font-bold text-texto">{pregunta}</h2>
        <p className="mt-1 text-lg text-texto-suave">{periodo}</p>
        {children}
      </Tarjeta>
    </section>
  );
}
