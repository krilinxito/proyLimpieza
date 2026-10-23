/**
 * Instalar la app en el celular — SPEC-KRILINXI-059.
 *
 * Chrome y Edge (Android y escritorio) avisan con un evento, `beforeinstallprompt`, que la app se puede instalar, y lo entregan **una
 * sola vez, temprano**: antes de que React monte ninguna pantalla. Por eso quien escucha es este módulo, desde que arranca la app
 * (`main.tsx` llama a `empezarAEscuchar`), y no el componente que muestra el botón: si esperara a montarse, el evento ya habría pasado.
 * Guarda el evento (después de impedir que el navegador muestre su propio cartel) hasta que alguien toque "Instalar".
 *
 * Safari en iPhone no tiene ese evento: no deja instalar desde un botón. Ahí lo único posible es explicar los dos pasos del
 * propio Safari ("Compartir" y "Agregar a pantalla de inicio"), y eso es el estado `ayuda-iphone`.
 *
 * Todo recibe la `ventana` como argumento (por omisión, la del navegador) para poder probarlo con una de mentira.
 */

/** El evento que Chrome entrega: aún no está en los tipos de TypeScript. */
export type EventoDeInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** Lo que hace falta de la ventana; `window` cumple esta forma. */
export type Ventana = {
  addEventListener: (tipo: string, oyente: (evento: Event) => void) => void;
  removeEventListener: (tipo: string, oyente: (evento: Event) => void) => void;
  /** Ausente en un entorno sin pantalla (los tests): ahí nunca se considera instalada por su modo de pantalla. */
  matchMedia?: (consulta: string) => { matches: boolean };
  navigator: { userAgent: string; maxTouchPoints?: number; standalone?: boolean };
};

/**
 * Qué se le muestra a la persona:
 *  - `nada`: ya está instalada, o el navegador no ofrece instalar;
 *  - `se-puede`: el navegador ofreció instalar, y se muestra el botón;
 *  - `ayuda-iphone`: Safari en iPhone o iPad, sin instalar: se explican los dos pasos.
 */
export type EstadoDeInstalacion = 'nada' | 'se-puede' | 'ayuda-iphone';

let ofrecido: EventoDeInstalacion | null = null;
let instalada = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((oyente) => oyente());

/** Empieza a escuchar el aviso del navegador. Devuelve cómo dejar de escuchar. Se llama una vez, al arrancar. */
export function empezarAEscuchar(ventana: Ventana = window): () => void {
  const alOfrecerse = (evento: Event) => {
    // Sin esto Chrome muestra su propia barrita; acá la ofrece la app, con palabras del negocio.
    evento.preventDefault();
    ofrecido = evento as EventoDeInstalacion;
    avisar();
  };
  const alInstalarse = () => {
    ofrecido = null;
    instalada = true;
    avisar();
  };
  ventana.addEventListener('beforeinstallprompt', alOfrecerse);
  ventana.addEventListener('appinstalled', alInstalarse);
  return () => {
    ventana.removeEventListener('beforeinstallprompt', alOfrecerse);
    ventana.removeEventListener('appinstalled', alInstalarse);
  };
}

/** Para enterarse cuando cambia el estado (lo que pide `useSyncExternalStore`). Devuelve cómo darse de baja. */
export function suscribirseALaInstalacion(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Si la app ya está abierta como app instalada (y no como pestaña del navegador). */
export function estaInstalada(ventana: Ventana = window): boolean {
  return instalada || ventana.matchMedia?.('(display-mode: standalone)').matches === true || ventana.navigator.standalone === true;
}

/** iPhone, iPod o iPad (un iPad nuevo se presenta como Mac, pero con pantalla táctil). */
export function esIPhone(navegador: Ventana['navigator']): boolean {
  if (/iPhone|iPad|iPod/.test(navegador.userAgent)) return true;
  return /Macintosh/.test(navegador.userAgent) && (navegador.maxTouchPoints ?? 0) > 1;
}

export function estadoDeInstalacion(ventana: Ventana = window): EstadoDeInstalacion {
  if (estaInstalada(ventana)) return 'nada';
  if (ofrecido) return 'se-puede';
  return esIPhone(ventana.navigator) ? 'ayuda-iphone' : 'nada';
}

export type ResultadoDeInstalar = 'aceptada' | 'rechazada' | 'no-disponible';

/**
 * Muestra el cartel de instalación del navegador y dice qué contestó la persona. El navegador deja usar el evento una sola
 * vez: se suelta antes de usarlo, así el botón desaparece enseguida y no se puede tocar dos veces.
 */
export async function instalar(): Promise<ResultadoDeInstalar> {
  const evento = ofrecido;
  if (!evento) return 'no-disponible';
  ofrecido = null;
  avisar();
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  return outcome === 'accepted' ? 'aceptada' : 'rechazada';
}

/** Vuelve todo a como arranca la app. Solo para los tests: cada uno parte de cero. */
export function olvidarTodoParaPruebas(): void {
  ofrecido = null;
  instalada = false;
  oyentes.clear();
}
