---
id: SPEC-KRILINXI-011
spec: specs/SPEC-KRILINXI-011-pwa-offline.md
explica:
  - manifest de una pwa
  - precache (la cascara de la app)
  - respuesta de navegacion en una app de una sola pagina
  - service worker y su ciclo de vida
  - un test que compila la app
---

# SPEC-KRILINXI-011 — La app abre sin internet (PWA)

## Qué se construyó

Hasta ahora, si la tablet recargaba la página sin internet, aparecía el dinosaurio del
navegador, aunque la base local tuviera todas las órdenes. Ahora, después de una primera
visita con conexión, la app abre igual sin internet, en cualquier pantalla. Además se puede
instalar en la tablet como una app más, con su ícono. Cuando se publica una versión nueva, la
tablet la toma al recargar o al volver a abrir, nunca en medio de un cobro.

## Cómo funciona, paso a paso

**Primera visita, con internet.** Elena abre la app en la tablet nueva.

1. `frontend/src/main.tsx:27` llama a `registrarServiceWorker`. En la app compilada
   (`import.meta.env.PROD`) registra `/sw.js` (`frontend/src/pwa/registrar.ts:26`).
2. El navegador baja `sw.js` y lo **instala**. `sw.js` es `frontend/src/pwa/sw.ts`
   compilado aparte por vite-plugin-pwa (`frontend/vite.config.ts:17`), que en el lugar de
   `self.__WB_MANIFEST` escribió la lista de los 35 archivos del build: el HTML, el JS, el
   CSS, los workers y los 4 WASM del SQLite de PowerSync, los íconos y el manifest.
3. Al instalarse, `precache(...)` (`sw.ts:42`) baja esos 35 archivos y los guarda en la Cache
   Storage del navegador. Son unos 8 MB, una sola vez.

**Al día siguiente, sin internet.** La tablet se reinició y no hay wifi. Elena toca el ícono.

4. El navegador va a pedir `/ropa`, pero antes le pregunta al service worker. Las rutas se
   prueban en orden: primero la de `sw.ts:49`, cuya condición es `esPantallaDeLaApp`
   (`frontend/src/pwa/navegacion.ts:22`). Es una navegación (`mode: 'navigate'`), del
   origen de la app, y no empieza con la dirección de la API ni la de PowerSync: sí es una
   pantalla.
5. No hay ninguna versión esperando, así que responde con `index.html` guardado
   (`sw.ts:59`). Ese HTML pide su JS y su CSS, que atiende la ruta del precache (`sw.ts:63`)
   desde la caché.
6. React Router mira la dirección, dibuja "Ropa en el local", la sesión sale de
   `localStorage` y las órdenes de SQLite, como siempre (CLAUDE.md §6).
7. Cuando la pantalla le pide algo a la API, ninguna ruta del service worker lo reclama (no es
   una navegación y no está en la lista del precache), así que el pedido va a la red tal cual
   y falla como sin service worker. `lib/api` lo traduce a `ErrorSinConexion`.

**Una semana después, versión nueva.** Se publica un arreglo. Elena tiene la app abierta.

8. Al navegar, el navegador nota que `sw.js` cambió, instala la versión nueva y la deja
   **esperando**. La pantalla de Elena sigue con la vieja, sin enterarse.
9. Elena recarga. La ruta de `sw.ts:49` (todavía la de la versión vieja) ve que hay una
   esperando y que esta es la única ventana (`puedeTomarElMando`). Entonces le avisa
   (`sw.ts:55`), espera a que se active (`esperarQueSeActive`) y responde una página vacía
   que pide recargar (`respuestaQueRecarga`).
10. Esa segunda carga ya la atiende la versión nueva. Elena vio una recarga un poco más
    larga. La sesión y la base local siguen ahí: el service worker solo tocó su propia caché
    de archivos.

Esto último se comprobó con la app compilada en Chromium (con Playwright, fuera del repo):
abrir `/ropa` sin red respondió 200 desde el service worker, el pedido a la API falló, la
versión nueva no recargó la pantalla por su cuenta y una sola recarga la aplicó, con
`localStorage` intacto.

## Dónde encaja en la arquitectura

- **`src/pwa/`** es una carpeta nueva al lado de `lib/` y `features/`. No es una feature del
  negocio (no hay pantalla ni datos) ni una librería que usen las features: es cómo se
  **entrega** la app al navegador. Por eso va aparte, y nada de `features/` la importa.
- **El service worker no lee ni escribe datos del negocio.** Las lecturas siguen saliendo de
  SQLite y las escrituras siguen yendo a la cola de PowerSync (CLAUDE.md §6). Si el service
  worker guardara respuestas de la API, habría dos copias locales de los mismos datos, y la
  de la caché sería vieja sin que nadie lo notara. Por eso no tiene ninguna regla para la API
  ni para PowerSync, y `esPantallaDeLaApp` los excluye aunque compartan dominio.
- **`sw.ts` solo conecta piezas.** Lo que decide (qué es una pantalla, cuándo cambiar de
  versión) está en `navegacion.ts` y `actualizar.ts`, funciones puras que se testean en
  jsdom. Al service worker en sí no se lo puede correr en un test unitario: lo cubren el test
  del build y la prueba en el navegador.
- **`sw.ts` no nombra `apiUrl`.** El test de arquitectura de SPEC-KRILINXI-003 dice que solo
  `lib/api` usa la dirección de la API. En vez de abrirle una excepción, el service worker
  excluye `Object.values(entorno)`: todos los servidores, y cualquiera que se agregue a
  `lib/env` queda excluido solo.

## Fundamentos

### Service worker y su ciclo de vida

Un service worker es un script que el navegador instala **aparte de la página**, y que se
pone en el medio de cada pedido que hacen las páginas de su sitio, incluso del pedido que
abre la página. Puede responder con algo guardado, ir a la red o las dos cosas. Es lo único
del navegador que puede contestar "abrir `/ropa`" cuando no hay red: ni el JS de la app
puede, porque sin ese HTML la app ni siquiera arrancó.

Tiene tres estados que importan:

- **Instalando:** baja lo que necesita (aquí, el precache).
- **Esperando:** si ya había una versión anterior a cargo, la nueva espera. Mientras haya
  alguna pantalla abierta con la vieja, la vieja sigue mandando.
- **Activo:** es el que atiende los pedidos.

La espera existe por una razón concreta: una pantalla abierta cargó el JS de la versión
vieja y todavía puede pedir archivos de esa versión (en esta app, `lib/powersync/web.ts` y
los WASM se cargan recién al entrar). Si la versión nueva tomara el mando enseguida, esos
archivos, que tienen otro nombre en el build nuevo, ya no estarían, y la pantalla se rompería
a mitad del turno. Lo que hacen muchos tutoriales (`skipWaiting` apenas se instala, y
recargar la página sola) evita la espera a costa de ese riesgo, o de recargarle la pantalla a
alguien que está cobrando.

Y una sutileza: **recargar no termina la espera.** La página nueva nace antes de que muera la
vieja, así que el navegador nunca ve "cero pantallas abiertas". Por eso `sw.ts:52-57` hace el
cambio a mano en el momento de la recarga, y solo si es la única ventana.

### Precache (la cáscara de la app)

Precachear es guardar los archivos de la app **al instalar**, no a medida que se piden. La
lista sale del build (`globPatterns` en `vite.config.ts:26`) e incluye un número de versión
por archivo: si un archivo no cambió entre versiones, no se vuelve a bajar. Sin precache, la
app solo abriría sin internet si casualmente se hubieran visitado antes todas las pantallas y
cargado todos los pedazos. Al de este repo hay que subirle el tope por archivo
(`vite.config.ts:8`): Workbox no guarda nada de más de 2 MiB, y dos de los WASM de PowerSync
pesan más.

### Respuesta de navegación en una app de una sola página

En una app como esta hay **un solo HTML**. `/ropa` o `/cobrar` no son archivos: las arma
React Router en el navegador. Con internet, el servidor de archivos devuelve `index.html` para
cualquier dirección (`vite preview` lo hace, y el servidor de producción tiene que hacerlo).
Sin internet, ese trabajo pasa al service worker, que responde `index.html` desde la caché a
toda navegación que sea una pantalla. Si respondiera solo a `/`, abrir la app en `/ropa`
sin internet daría error, aunque `/` funcionara.

### Manifest de una PWA

`manifest.webmanifest` es un JSON que le dice al sistema operativo cómo instalar la app:
nombre, ícono, en qué dirección abre (`start_url`) y cómo se ve (`display: standalone`: sin
la barra del navegador, como una app). El ícono `maskable` tiene más margen porque Android lo
recorta en círculo o en gota. Se arma desde `vite.config.ts:31`, y el plugin lo enlaza en el
`index.html`.

### Un test que compila la app

`frontend/src/pwa/build.test.ts:22` corre `vite build` con la configuración real hacia una
carpeta temporal, y revisa lo que salió. Es más lento que un test normal (un par de
segundos), pero es el único que ve lo que de verdad llega al navegador. La prueba de mutación
(ver SPEC-KRILINXI-003) lo confirmó: con el tope bajado a 2 MiB, el build falla nombrando los
dos WASM que quedarían afuera, y la suite queda en rojo. Corre en entorno `node`
(`// @vitest-environment node`), el primero del frontend: por eso `src/test/setup.ts` ahora
comprueba que exista `localStorage` antes de limpiarlo.

**Ya explicado antes:**

- **Variables de entorno en el navegador** → SPEC-KRILINXI-001 (`specs/notas/SPEC-KRILINXI-001-frontend-scaffold.md`)
- **Prueba de mutación**, **inversión de dependencia** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Offline-first (bajada y subida)** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)

## Decisiones y por qué

- **Service worker propio (`injectManifest`) y no el generado (`generateSW`).** El generado
  solo ofrece dos opciones: esperar a que se cierren todas las ventanas (y entonces recargar no
  aplica la versión nueva) o tomar el mando enseguida (con el riesgo de arriba). La spec pide
  aplicarla al recargar y sin recargar sola: eso requiere código propio.
- **Todos los WASM al precache (~7 MB).** PowerSync elige entre cuatro variantes según lo
  que soporte el navegador. Guardar solo una sería apostar a cuál va a elegir cada tablet.
- **El registro, a mano en `main.tsx`, y no con `virtual:pwa-register`.** Ese módulo virtual
  solo existe dentro del build de Vite: los tests tendrían que imitarlo. `registrar.ts` recibe
  el navegador como argumento y se prueba con un doble.
- **Un script clásico (`rollupFormat: 'iife'`).** Un service worker como módulo ES no lo
  entienden todos los navegadores de tablets viejas.
- **`<meta http-equiv="refresh">` además de la cabecera `Refresh`, y esperar la activación.**
  En la prueba en Chromium, con la cabecera sola y sin esperar, la pantalla quedaba en blanco.
  Como se corrigieron las dos cosas a la vez, no se sabe cuál de las dos lo causaba.

## Los tests

- **Nuevos, sin helper compartido:** `navegacion.test.ts`, `actualizar.test.ts` y
  `registrar.test.ts` prueban funciones puras con dobles chicos (un `EventTarget` con `state`
  hace de `ServiceWorker`; un objeto con `register` hace de `navigator`). Son casos únicos:
  ninguna otra spec va a necesitar un service worker falso.
- **`build.test.ts`** es el que da confianza en el resultado. La próxima spec que toque
  `vite.config.ts` lo va a sentir si rompe el precache. Corre **solo y al final**: en
  `vite.config.ts`, `test.projects` lo pone en un grupo aparte (`groupOrder: 1`). Al cerrar la
  spec, una de ocho corridas completas falló en un test de SPEC-KRILINXI-007 que espera un
  texto con el tope de 1 s de `findBy…`, y la compilación en paralelo es la sospechosa (no se
  guardó el mensaje exacto de esa falla). Es el mismo problema de CPU saturada que ya describe
  SPEC-ALE186-022 para el backend.
- **Tocado:** `src/test/setup.ts`, para que los tests en entorno `node` no fallen al limpiar
  un `localStorage` que no existe.

## Si mañana tenés que tocar esto

- **Para cambiar qué se guarda:** `globPatterns` y `TOPE_POR_ARCHIVO` en `vite.config.ts`, y
  correr `build.test.ts`.
- **Para probar el service worker en serio:** `npm run build` y `npx vite preview` en el
  frontend, y en Chrome DevTools → Application → Service workers (con "Offline" para cortar
  la red). En `npm run dev` no existe, a propósito.
- **Cuidado con agregar rutas a `sw.ts`.** Cualquier regla que guarde respuestas de la API
  rompe la regla de CLAUDE.md §6. Si algún día hace falta (por ejemplo, para las
  estadísticas del admin), va en una spec propia que lo discuta.
- **La primera visita necesita conexión, y bajar 8 MB.** En una sucursal con wifi flojo
  conviene instalar la app en la oficina antes de llevar la tablet.
