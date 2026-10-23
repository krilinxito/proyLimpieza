---
id: SPEC-KRILINXI-059
spec: specs/SPEC-KRILINXI-059-pwa-instalable.md
explica:
  - un evento del navegador que llega una sola vez y temprano se guarda en un módulo fuera de la pantalla
---

# SPEC-KRILINXI-059 — PWA mejor instalable en el celular

## Qué se construyó

La app ya se podía instalar como PWA, pero nadie lo sabía y el ícono seguía azul. Ahora el Inicio ofrece instalarla: un botón «Instalar en este celular» donde el navegador lo permite, y dos pasos escritos en iPhone, donde no existe ese botón. Los íconos y los colores del
manifest son del turquesa de la marca. No se armó ningún APK ni app de iPhone: se decidió seguir con la PWA.

## Cómo funciona, paso a paso

Caso: una persona abre la app en Chrome de su celular Android.

1. `main.tsx` llama a `empezarAEscuchar()` (`pwa/instalacion.ts`) **antes** de montar React. Chrome avisa que la app es instalable con el evento `beforeinstallprompt`, una sola vez y muy temprano; si el componente que muestra el botón esperara a existir para escuchar, el evento ya habría pasado.
2. El módulo impide que Chrome muestre su propio cartel (`preventDefault`), guarda el evento y avisa a quien esté mirando.
3. `useInstalarApp` (`hooks/useInstalarApp.ts`) lee ese estado con `useSyncExternalStore`: `'nada'`, `'se-puede'` o `'ayuda-iphone'`, y suma «Ahora no».
4. `AvisoInstalar` (`components/AvisoInstalar.tsx`), dentro del Inicio, dibuja el botón solo si el estado es `'se-puede'`.
5. Al tocarlo, `instalar()` suelta el evento (se puede usar una sola vez) y muestra el cartel del navegador; el botón desaparece enseguida. Cuando termina la instalación, el navegador manda `appinstalled` y el módulo recuerda que ya está instalada.
6. En iPhone (Safari) no hay evento: `esIPhone` mira el `userAgent` (y un iPad nuevo, que se presenta como Mac pero es táctil) y el aviso explica los dos pasos del propio Safari.
7. Si la app ya está abierta como app instalada (`display-mode: standalone`, o `navigator.standalone` en iPhone), no se muestra nada.

Los íconos los genera `frontend/scripts/generar-iconos.mjs`: dibuja la lavadora con distancias a figuras simples, suaviza los bordes tomando 4×4 muestras por píxel y escribe el PNG con `zlib`. El color lo lee de `--color-marca` en `index.css`.

## Dónde encaja en la arquitectura

`pwa/` es lo que concierne al navegador y no a una pantalla (como el service worker, SPEC-KRILINXI-011); el componente solo pinta y el hook solo lee. La CSP no cambió (CLAUDE.md §4): el manifest y los íconos son del propio sitio. El service worker tampoco: sigue guardando solo los archivos del build y nunca la API ni PowerSync.

## Fundamentos

**Un evento que llega una sola vez y temprano se guarda fuera de la pantalla.** Algunos eventos del navegador no esperan a que la interfaz esté lista: `beforeinstallprompt` sale cuando Chrome decide que la app es instalable, a veces antes de que React pinte nada, y no se repite. Si quien lo necesita
(un componente) empieza a escuchar al montarse, llega tarde y se lo pierde para siempre. El patrón: un módulo con estado propio escucha desde el arranque y guarda lo que llegó; el componente lo **lee** después (`useSyncExternalStore` le dice cuándo cambió). Ejemplo de este repo: `pwa/instalacion.ts` (el módulo)
y `hooks/useInstalarApp.ts` (la lectura). El test `AvisoInstalar.test.tsx` lo prueba con el caso difícil: el evento llega *antes* de que el aviso exista.

## Decisiones y por qué

- **Un botón solo si hay algo que ofrecer.** Un «Instalar» que no hace nada es peor que ninguno: en un navegador que no lo ofrece (Firefox, Safari de escritorio) no aparece nada, y en iPhone, donde no se puede desde un botón, aparece la explicación.
- **«Ahora no» esconde el aviso solo hasta recargar**, no para siempre: quien lo descarta un día puede querer instalarla otro, y un botón que desaparece sin vuelta no se recupera.
- **Los dos botones son secundarios:** la acción principal del Inicio sigue siendo una sola (SPEC-KRILINXI-037); instalar no es lo que se vino a hacer al mostrador.
- **`background_color` también turquesa.** La pantalla de arranque de la app instalada es del color de la marca y el ícono lleva el mismo fondo, así el arranque no tiene costuras. Antes era blanco.
- **El ícono «maskable» es el mismo dibujo al 74%.** Android lo recorta con la forma que prefiera; lo importante tiene que quedar dentro de la zona segura (un círculo del 80% del lado). Un test mide píxel por píxel que nada del dibujo cae afuera.
- **Los íconos se generan con un script del repo**, no a mano: sin una herramienta de imágenes instalada, un script de Node puro es lo que cualquiera puede volver a correr cuando la marca cambie.

## Los tests

`pwa/instalacion.test.ts` usa una ventana de mentira con la que se puede disparar el evento a mano; `AvisoInstalar.test.tsx` lo prueba en pantalla (también el caso de iPhone, simulando el `userAgent`); `pwa/iconos.test.ts` lee los PNG y comprueba tamaños, fondo de la marca y zona segura; `pwa/build.test.ts` compila de verdad y mira el
manifest (`id`, colores iguales a `index.css`, los tres íconos) y que el precache no guarde direcciones de la API; `csp.test.ts` comprueba que no apareció ningún origen nuevo. Los íconos se comparan contra `--color-marca`: si la marca cambia y nadie corre el generador, falla.

## Cómo probarlo a mano en un celular Android

jsdom no instala nada, así que esto no se puede automatizar. Antes de un release:

1. `npm run build`, y publicar la carpeta `frontend/dist` por **HTTPS** (Chrome solo permite instalar desde un sitio seguro; `localhost` también vale para probar en la misma máquina, con `npx vite preview --port 4173`).
2. En Chrome del celular, abrir la dirección, iniciar sesión y esperar a que cargue (el service worker se instala en la primera visita con conexión).
3. En el Inicio tiene que aparecer la tarjeta «Instalar la app» con el botón «Instalar en este celular». Tocarlo: Chrome muestra su cartel; aceptar.
4. En la pantalla de inicio del celular tiene que estar el ícono turquesa de la lavadora, con el nombre «Lavandería». Abrirlo: arranca con la pantalla turquesa, sin barra del navegador.
5. Poner el celular en modo avión y abrirla de nuevo: tiene que abrir (CLAUDE.md §4).
6. Con la app instalada, la tarjeta del Inicio ya no aparece.

**Si el navegador no ofrece instalar** (la tarjeta no aparece): (a) ya está instalada (el aviso se esconde adrede); (b) no es HTTPS; (c) es Firefox o un navegador sin instalación; (d) Chrome ya la ofreció y se rechazó hace poco: él mismo espera unos días antes de volver a ofrecer. En Chrome siempre se puede instalar a mano
desde el menú de tres puntos → «Instalar app» o «Agregar a la pantalla de inicio». En DevTools → Application → Manifest, Chrome dice exactamente qué le falta a la app para ser instalable.

**En iPhone:** Safari → botón Compartir → «Agregar a pantalla de inicio». La tarjeta del Inicio lo explica con esas palabras.

## Si mañana tenés que tocar esto

Si cambia el color de la marca: `node frontend/scripts/generar-iconos.mjs`, y cambiar `theme_color`/`background_color` en `vite.config.ts` y el `theme-color` de `index.html` (el build test dice cuál quedó desfasado). Un ícono nuevo pide también su entrada en el manifest.
