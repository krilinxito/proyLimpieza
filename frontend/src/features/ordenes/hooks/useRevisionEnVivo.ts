import { useEffect, useRef, useState } from 'react';
import type { DatosRopa, RevisionDeRopa } from '../types';

/** Cuánto se espera después de la última tecla antes de revisar: escribir rápido revisa una sola vez, lo último. */
const PAUSA_MS = 150;

export type RevisionEnVivo = {
  /** La última revisión que llegó, o null si todavía no hay (o aún no se eligió cliente). */
  revision: RevisionDeRopa | null;
  /** Si esa revisión es de lo que hay escrito ahora: si se siguió escribiendo, todavía no. */
  alDia: boolean;
};

/**
 * Revisa lo escrito de la ropa mientras se escribe, sin guardar — SPEC-KRILINXI-058. De acá salen el visto de cada campo y de
 * cada tarjeta de Registrar ropa. Llama a `revisar`, que por dentro es la misma validación del guardado: lo que se ve bien acá
 * es lo que el guardado acepta.
 *
 * Espera una pausa entre teclas y descarta la respuesta de una revisión vieja que llega tarde (como `BuscadorVivo`, SPEC-KRILINXI-032).
 * Sin datos (todavía no hay cliente elegido) no revisa nada.
 */
export function useRevisionEnVivo(
  datos: DatosRopa | null,
  revisar: (datos: DatosRopa) => Promise<RevisionDeRopa>,
): RevisionEnVivo {
  // Los datos se resumen en un texto: así el efecto se vuelve a ejecutar cuando algo cambia de verdad, y no en cada pintada.
  const clave = datos === null ? '' : JSON.stringify(datos);
  const [guardada, setGuardada] = useState<{ clave: string; revision: RevisionDeRopa } | null>(null);
  // Siempre la última función, sin volver a revisar cuando solo cambia su identidad.
  const revisarActual = useRef(revisar);
  revisarActual.current = revisar;

  useEffect(() => {
    if (clave === '') return;
    let vigente = true;
    const espera = setTimeout(() => {
      revisarActual
        .current(JSON.parse(clave) as DatosRopa)
        .then((revision) => vigente && setGuardada({ clave, revision }))
        .catch((error: unknown) => console.error('No se pudo revisar lo escrito.', error));
    }, PAUSA_MS);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [clave]);

  return { revision: guardada?.revision ?? null, alDia: guardada !== null && guardada.clave === clave };
}
