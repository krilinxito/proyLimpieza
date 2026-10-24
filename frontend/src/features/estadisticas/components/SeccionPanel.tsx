import { useRef, useState, type ReactNode } from 'react';
import { estiloBoton } from '../../../components/estilosBoton';
import { Icono } from '../../../components/iconos';
import { Tarjeta } from '../../../components/Tarjeta';
import { VistaGrande } from './VistaGrande';

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
 * Desde SPEC-KRILINXI-065 las tarjetas van **una debajo de otra, siempre del mismo ancho** (ya no hay dos columnas ni
 * una que ocupe la fila entera), y la que tiene un gráfico (`ampliable`) lleva el botón "Agrandar": abre `VistaGrande`
 * con **los mismos hijos** dibujados en grande. Al cerrarla, el foco vuelve a este botón. Un `ampliable` en `false` es
 * una tarjeta sin gráfico que mostrar (cargando, con un aviso o sin datos): agrandar nada no sirve.
 */
export function SeccionPanel({
  nombre,
  pregunta,
  periodo,
  ampliable = false,
  children,
}: {
  nombre: string;
  pregunta: string;
  periodo: string;
  ampliable?: boolean;
  children: ReactNode;
}) {
  const [grande, setGrande] = useState(false);
  // Un `<button>` propio y no `Boton`: hay que devolverle el foco al cerrar, y `Boton` no entrega su elemento.
  const agrandar = useRef<HTMLButtonElement>(null);

  function cerrar() {
    setGrande(false);
    agrandar.current?.focus();
  }

  // `grid-cols-1` y `min-w-0`: una columna que puede ENCOGERSE. Un `grid` sin columnas definidas deja que su
  // contenido ensanche la tarjeta, y en una pantalla media (con el menú al costado) pisaba a la vecina.
  return (
    <section aria-label={nombre} className="grid min-w-0 grid-cols-1">
      <Tarjeta>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-texto">{pregunta}</h2>
            <p className="mt-1 text-lg text-texto-suave">{periodo}</p>
          </div>
          {ampliable && (
            <button
              ref={agrandar}
              type="button"
              aria-haspopup="dialog"
              onClick={() => setGrande(true)}
              className={estiloBoton('secundario', 'compacto')}
            >
              <Icono nombre="agrandar" />
              {/* El nombre accesible dice cuál gráfico: "Agrandar: Cobrado por día". */}
              <span>
                Agrandar<span className="sr-only">: {nombre}</span>
              </span>
            </button>
          )}
        </div>
        {children}
      </Tarjeta>
      {grande && (
        <VistaGrande nombre={nombre} pregunta={pregunta} periodo={periodo} alCerrar={cerrar}>
          {children}
        </VistaGrande>
      )}
    </section>
  );
}
