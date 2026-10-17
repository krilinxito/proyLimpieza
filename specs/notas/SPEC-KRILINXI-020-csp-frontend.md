---
id: SPEC-KRILINXI-020
spec: specs/SPEC-KRILINXI-020-csp-frontend.md
explica:
  - csp en meta o en cabecera http
  - la contraprueba (que el detector detecte)
  - politica de seguridad del contenido (csp)
---

# SPEC-KRILINXI-020 — Política de seguridad del contenido (CSP) para la PWA

## Qué se construyó

La app compilada le dice ahora al navegador **de dónde puede venir cada cosa y con quién puede
hablar**: sus propios archivos, la API y el servicio de PowerSync. Todo lo demás lo bloquea.

Importa porque la sesión vive en `localStorage`. Si alguien lograra meter un script en la
página, ese script podría leer el token. Con la política puesta, no corre; y si corriera, no
tendría a dónde mandar el token.

Se comprobó en un Chromium real: cero violaciones, y la app sigue abriendo sin internet.

## Cómo funciona, paso a paso

Alguien corre `npm run build` con `VITE_API_URL=http://localhost:4000` y
`VITE_POWERSYNC_URL=http://localhost:8080` en el `.env`.

1. **Vite carga el plugin.** `vite.config.ts:16` registra `cspEnElBuild()`
   (`src/pwa/csp.ts:63`). Tiene `apply: 'build'` (`:67`), así que en `npm run dev` no existe:
   Vite inyecta scripts en línea para la recarga en caliente, y la política los bloquearía.
2. **El plugin lee el entorno.** En `configResolved` (`:68`) toma las dos URLs de la
   configuración ya resuelta, la misma que usa la app.
3. **Se arma la política.** `politicaDeContenido` (`:52`) recorre `directivas` (`:29`). Casi
   todas son `'self'`; la que importa es `connect-src` (`:45`), que agrega **solo el origen**
   de cada URL. `origen` (`:20`) convierte `http://localhost:4000/api` en
   `http://localhost:4000`. Si una URL no se entiende, corta el build: mejor no compilar que
   compilar una app sin política.
4. **Se inserta en la página.** `transformIndexHtml` (`:72`) agrega
   `<meta http-equiv="Content-Security-Policy" content="…">` al principio del `<head>`
   (`injectTo: 'head-prepend'`, `:78`), antes de cualquier script.
5. **En la tablet**, el navegador lee el `<meta>` antes de cargar nada:
   - Los JS, CSS, workers y WASM del propio sitio pasan.
   - Los pedidos a `localhost:4000` y `localhost:8080` pasan.
   - Un `<script>` en línea, un `style="…"` o un `fetch` a otro lado se bloquean.

## Dónde encaja en la arquitectura

`src/pwa/` ya era "lo que hace de la app una PWA" (011): el service worker, su registro y el
test del build. La política es del mismo tipo: **infraestructura del build**, no código de una
pantalla. `csp.ts` no hace pedidos ni se importa desde la app; solo lo usan `vite.config.ts` y
sus tests.

Una regla de la 003 dice que solo `lib/api` usa `VITE_API_URL`, para que ningún código hable
con la API por su cuenta. `csp.ts` también la nombra, y es una excepción legítima: no hace
pedidos, solo **declara** al navegador que con ese origen se puede hablar. Quedó en la lista de
permitidos, con el motivo escrito (`lib/api.test.ts`).

## Fundamentos

### Qué es una política de seguridad del contenido (CSP)

Un ataque XSS (*cross-site scripting*) consiste en lograr que la página ejecute código que no es
suyo: por ejemplo, un nombre de cliente guardado como `<script>…</script>` que una pantalla
mostrara sin escapar. React escapa todo por defecto, así que es difícil. Pero basta un descuido
(`dangerouslySetInnerHTML`, una librería mal usada) para que el script corra **con los mismos
permisos que la app**: puede leer `localStorage` y mandar el token afuera.

La CSP es una segunda línea: la página le declara al navegador una lista de lo permitido, y el
navegador **se niega** a todo lo demás, aunque el código lo pida. Cada directiva cubre un tipo
de cosa:

- `script-src 'self'`: solo scripts que sean archivos del propio sitio. Ni en línea, ni `eval`.
- `connect-src`: a dónde puede hacer pedidos la página (`fetch`, XHR). Aunque un script ajeno
  corriera, no podría mandar el token a su servidor.
- `style-src 'self'`: ni estilos en línea. Una inyección de CSS también puede filtrar datos.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`: cierran tres caminos clásicos.

**Defensa en profundidad** (→ SPEC-ALE186-009): React es la primera barrera, la CSP la segunda.

### `<meta>` o cabecera HTTP

La política puede llegar de dos formas: en una cabecera de la respuesta HTTP o en un `<meta>`
dentro del HTML. Acá va como `<meta>` porque **el repo no tiene servidor web**: la app es un
puñado de archivos estáticos, y quién los sirve todavía no está decidido.

El `<meta>` tiene dos límites:

- **No admite `frame-ancestors`**, la directiva que impide que otra página meta la app en un
  marco invisible y le haga tocar botones al usuario (*clickjacking*).
- **No admite avisos de violación** (`report-to`): si en una tablet algo se bloquea, nadie se
  entera.

Los dos se arreglan pasando la política a una cabecera cuando haya servidor de producción, y
quedó escrito así en CLAUDE.md §13.

### La contraprueba: que el detector detecte

La prueba en el navegador dijo "0 violaciones". Pero un cero solo vale si el instrumento puede
dar otro número. Si el script no escuchara bien los eventos, o si la política no se aplicara,
también daría cero.

Por eso hubo una segunda corrida que **inyecta a propósito** las tres cosas prohibidas: un
`<script>` en línea, un `style="color: red"` y un `fetch` a un servidor ajeno. El navegador
bloqueó y reportó las tres, y el script no corrió. Recién ahí el "0" de la primera corrida
dice algo.

Es la misma idea que romper una regla de arquitectura para ver que su test falla (→ prueba de
mutación, SPEC-KRILINXI-003), aplicada a una herramienta de medición.

**Ya explicado antes:**

- **Cabeceras de seguridad (helmet)** → SPEC-ALE186-023 (`specs/notas/SPEC-ALE186-023-endurecer-http.md`): las de la API; esta es la del frontend.
- **Un test que compila la app** → SPEC-KRILINXI-011 (`specs/notas/SPEC-KRILINXI-011-pwa-offline.md`): ahí se suma la comprobación de la política.
- **Precache (la cáscara de la app)** → SPEC-KRILINXI-011: el modo sin internet que se volvió a comprobar con la política puesta.
- **Test de arquitectura** → SPEC-KRILINXI-002: la regla nueva "sin `style={…}`".
- **Variables de entorno en el navegador** → SPEC-KRILINXI-001: por qué las URLs quedan fijas en el build.

## Decisiones y por qué

- **Sin `'wasm-unsafe-eval'`.** La spec dejaba prevista esa excepción para el WASM de PowerSync.
  En el navegador no hizo falta: con la base local abierta (WASM y workers en marcha) el
  navegador no reportó ninguna violación. Se midió antes de abrir la puerta. Si una versión
  nueva del SDK la llegara a necesitar, la prueba a mano de CLAUDE.md §4 lo va a mostrar.
- **Sin `ws:`/`wss:` en `connect-src`.** PowerSync en la web sincroniza por HTTP con streaming,
  no por WebSocket (lo dice su propio código).
- **Las barras del volumen sin `style`.** Las dibuja `anchoDeBarra` (`SeccionVolumen.tsx:25`),
  con clases de una lista escrita entera (`ANCHOS`, `:9`), en pasos de 5 %. Escrita entera
  porque Tailwind solo genera las clases que encuentra literales. La alternativa era
  `'unsafe-inline'` en estilos; se eligió la política estricta.
- **La prueba en el navegador, a mano y documentada**, no con Playwright en el repo. Sumarlo es
  una dependencia de ~150 MB y una spec propia. La lista para repetirla está en CLAUDE.md §4.

## Los tests

- **`src/pwa/csp.test.ts`** (puro): qué permite cada directiva, que no aparezca nada en línea ni
  `*`, que una URL rota corte el build y que el plugin solo corra al compilar.
- **`src/pwa/build.test.ts`** (`:93`, el de la 011): compila de verdad y mira el `index.html`.
  Comprueba que la política está antes de cualquier script, que conecta solo con los dos
  servicios del entorno y que el build no trae scripts ni estilos en línea. Lee el atributo
  decodificando las entidades (`&#39;`), igual que el navegador.
- **`test/arquitectura.test.ts`** (`:175`): ningún componente usa `style={…}`. Sin esta regla, un
  estilo en línea se vería bien en `npm run dev` y desaparecería en la tablet sin avisar.
- **La verificación en Chromium** (un script descartable, fuera del repo): build + `vite preview`,
  sesión de prueba en `localStorage`, y las dos corridas descriptas arriba.

## Si mañana tenés que tocar esto

- **Un servicio externo nuevo** (otra API, un mapa, una fuente de letra): sumalo en `directivas()`
  de `csp.ts`, o el navegador lo va a bloquear sin que ningún test de jsdom se entere.
- **Antes de un release**, la prueba a mano de CLAUDE.md §4: la consola del navegador sin errores
  de "Content Security Policy", y la app abriendo "Sin conexión".
- **Cuando haya servidor de producción**, la política va a una cabecera, con `frame-ancestors
  'none'`.
