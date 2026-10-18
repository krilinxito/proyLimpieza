/**
 * Claro u oscuro — SPEC-KRILINXI-030.
 *
 * El tema se marca en `<html data-tema="claro|oscuro">`, y `index.css` redefine los colores del
 * tema bajo `[data-tema='oscuro']`. Así ningún componente cambia: todos pintan con los tokens
 * (`bg-superficie`, `text-texto`) y los tokens cambian de valor.
 *
 * Quién decide: lo que la persona eligió con el botón de la cabecera, guardado en la tablet; si
 * no eligió nada, la preferencia del sistema (`prefers-color-scheme`), siguiéndola en vivo. La
 * elección es de la tablet, no de la cuenta: salir no la borra (usa otra clave que la sesión).
 *
 * No hay un `<script>` en `index.html` que lo aplique antes de pintar: la política de seguridad
 * no permite scripts en línea (SPEC-KRILINXI-020). Lo aplica `main.tsx` antes de montar React, y
 * para ese primer instante `index.css` ya pinta fondo y texto oscuros si el sistema lo pide.
 */
export type Tema = 'claro' | 'oscuro';

const CLAVE = 'lavanderia.tema';
const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

function esTema(valor: unknown): valor is Tema {
  return valor === 'claro' || valor === 'oscuro';
}

/** Lo que eligió la persona, o null si sigue al sistema. Mismo cuidado que la sesión con el almacenamiento. */
export function leerEleccion(): Tema | null {
  try {
    const guardado = localStorage.getItem(CLAVE);
    return esTema(guardado) ? guardado : null;
  } catch {
    return null;
  }
}

export function guardarEleccion(tema: Tema): void {
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    // Sin almacenamiento, la elección dura lo que dure la pestaña.
  }
}

function sistema(): MediaQueryList | null {
  // jsdom (los tests) no trae `matchMedia`: sin él, el sistema "prefiere" claro.
  return typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA_OSCURO) : null;
}

/** El tema que corresponde ahora: el elegido o, si no hay, el del sistema. */
export function temaVigente(): Tema {
  return leerEleccion() ?? (sistema()?.matches ? 'oscuro' : 'claro');
}

/** Lo pone en la página. */
export function aplicarTema(tema: Tema = temaVigente()): void {
  document.documentElement.dataset.tema = tema;
}

/**
 * Sigue al sistema mientras la persona no haya elegido: si la tablet pasa a modo oscuro (de
 * noche, por ejemplo), la app cambia sin recargar. Devuelve la función que deja de escuchar.
 */
export function seguirAlSistema(alCambiar: (tema: Tema) => void): () => void {
  const consulta = sistema();
  if (!consulta) return () => {};
  const escuchar = () => {
    if (leerEleccion() === null) alCambiar(temaVigente());
  };
  consulta.addEventListener('change', escuchar);
  return () => consulta.removeEventListener('change', escuchar);
}
