---
id: SPEC-KRILINXI-064
spec: specs/SPEC-KRILINXI-064-ngrok-demo-cliente.md
explica:
  - proxy inverso
  - tunel (ngrok)
---

# SPEC-KRILINXI-064 — Demo para el cliente con un solo túnel de ngrok

## Qué se construyó

`npm run demo` deja la app lista para que el cliente la pruebe desde su propio equipo o celular, por **una sola dirección
pública** (la de ngrok). Compila la app apuntando a esa dirección y levanta el servidor de la app compilada, que también
reparte los pedidos al backend y a PowerSync. La guía paso a paso está en `CLAUDE.md` §11.

**Estado honesto:** todo lo que se puede probar sin ngrok está hecho y con tests. **La prueba a mano con ngrok real (último
criterio de verdad de la spec) NO se hizo** desde esta sesión: queda abajo, en "Pendiente de probar a mano".

## Cómo funciona, paso a paso

Se sigue un pedido de ingreso (`POST /api/auth/login`) desde el celular del cliente:

1. El cliente abre `https://mi-demo.ngrok-free.app`. ngrok reenvía al puerto 4173 de la computadora, con `Host: mi-demo.ngrok-free.app`.
2. `vite preview` revisa ese `Host` contra `allowedHosts` (`frontend/src/pwa/demo.ts`, `previewDeLaDemo`). Si no es el dominio de la
   demo ni localhost, responde 403 — el túnel no deja la computadora abierta a cualquier nombre.
3. La app se compiló con `VITE_API_URL=https://mi-demo.ngrok-free.app` (`entornoDeLaDemo`). `lib/api.ts:79` arma `baseURL` como
   `<apiUrl>/api`, así que el login sale a `https://mi-demo.ngrok-free.app/api/auth/login`: el **mismo origen** que la página.
4. El servidor de la app ve que la ruta empieza con `/api/` y la reenvía a `http://localhost:4000` (`proxy['/api/']`), con método,
   cuerpo y cabeceras. El backend responde y la respuesta vuelve por el mismo camino.
5. PowerSync es igual con `/powersync/…`: el proxy le **quita el prefijo** (`rewrite`) y lo manda a `localhost:8080`. La app se
   compiló con `VITE_POWERSYNC_URL=https://mi-demo.ngrok-free.app/powersync`, y el SDK agrega `/sync/stream` por su cuenta.
6. Todo lo que no es `/api/` ni `/powersync/` lo sirve el propio `vite preview` desde `dist/`.

`vite.config.ts` solo activa esto si existe `DEMO_URL_PUBLICA` (la pone `scripts/demo/demo.mjs`); sin ella, `vite preview` es el de siempre.

## Dónde encaja en la arquitectura

- **Las reglas son funciones puras en `frontend/src/pwa/demo.ts`; el script solo las corre.** Es el mismo reparto que `csp.ts`
  (reglas) y el plugin que las aplica: se prueban sin levantar nada. `scripts/demo/demo.mjs` importa `demo.ts` directamente (Node 24 quita
  los tipos solo), así que no hay dos copias de "qué dirección vale".
- **Es una lectura mía, no una regla del repo:** esto es herramienta de desarrollo, no parte de la app. No toca el backend (la lógica del
  servidor no cambió) ni el flujo offline: la app sigue escribiendo en SQLite y la cola sube por `lib/api`.
- La **CSP no se afloja**: `connect-src` queda en `'self'` más la dirección pública. Como la dirección ES el propio sitio, el resultado es el
  de siempre más un origen igual a `'self'`.

## Fundamentos

**Ya explicado antes:**

- **CORS / política del mismo origen** → ver el índice de bitácoras (`specflow notes-index`, "cors (politica del mismo origen)"). Aquí es lo que el único origen evita.
- **CSP** → SPEC-KRILINXI-020. **Service worker y su ciclo de vida** y **manifest de una PWA** → SPEC-KRILINXI-011 y 059.

**Proxy inverso (concepto nuevo).** Un servidor que recibe el pedido en nombre de otros y lo reenvía al que corresponde, según la ruta.
Existe para que el navegador vea una sola dirección aunque detrás haya varios programas (la app, la API, PowerSync). Sin él, la app tendría que
hablar con tres direcciones públicas, habría que abrir CORS y ngrok necesitaría tres túneles (el plan gratuito casi seguro no los permite).
En este repo: `previewDeLaDemo` en `frontend/src/pwa/demo.ts`, que le pasa su configuración al proxy que Vite ya trae.

**Túnel (ngrok).** Un programa que abre una conexión saliente desde tu computadora hacia un servicio, y el servicio publica una dirección
https que entra por esa conexión. Sirve para mostrar algo que corre en tu máquina sin abrir puertos del router. Tiene HTTPS real, y eso permite
que la PWA se instale y funcione sin internet (los service workers no existen sin HTTPS, salvo en localhost).

## Decisiones y por qué

- **Un solo túnel, no tres.** Alternativa descartada: un túnel por servicio. Habría que abrir CORS, compilar con tres direcciones y depender del
  límite de túneles del plan.
- **PowerSync bajo `/powersync` con el prefijo quitado.** Alternativa: dejarlo en la raíz. Choca con las rutas de la app (`/` es la app).
- **Hallazgo que habría roto el modo sin internet:** `sw.ts` le decía al service worker "no atiendas nada que empiece con la dirección de la
  API". Con un solo origen, esa dirección pelada es **todo el sitio**, y ninguna pantalla se habría abierto sin internet. Ahora excluye
  `<apiUrl>/api` y `<powersyncUrl>` (`sw.ts`). La prueba de la regla ya existía con el caso "mismo dominio" (`navegacion.test.ts`); lo que faltaba era
  pasársela bien. Cambia solo cómo se arma la lista: con las direcciones de siempre (otro origen cada una) el resultado es el mismo.
- **El script falla en vez de compilar a ciegas.** Sin `DEMO_URL_PUBLICA` (o con http, o con ruta) dice qué falta en español y sale con 1, antes de compilar.
- **No se pidió `CORS_ORIGENES`.** Un pedido del mismo origen se atiende igual; el test del backend lo comprueba (`seguridad.test.ts`). La guía
  dice dónde ponerlo si algún día la API se publica aparte.

## Los tests

Todos llevan el id. `frontend/src/pwa/demo.test.ts` levanta **de verdad** `vite preview` (la API `preview()` de Vite) con la configuración
de `previewDeLaDemo`, contra dos servidores HTTP falsos que anotan lo que reciben: comprueba método, ruta, cuerpo y cabeceras de `/api/*`, que
`/powersync/*` llega sin prefijo, que una pantalla no toca a ningún servicio, y que otro `Host` recibe 403. También compara las directivas de la
CSP de la demo con las del build normal y corre el script (sin dirección → falla; con `--simular` → muestra el plan). Se creó el patrón
"servidor falso que anota lo que le llega" dentro de ese archivo; si otra spec necesita probar un proxy, se puede sacar a `src/test/`.
`backend/tests/http/seguridad.test.ts` suma los dos casos de CORS. Además se compiló a mano con las variables de la demo y se leyó el
`<meta>` de la CSP en `dist/index.html`.

## Prueba a mano con ngrok real (criterio 7)

El 2026-10-23 krilinxito abrió la demo por la dirección pública de ngrok desde su celular y dio el resultado por bueno. Su observación: quedan
detalles **visuales** por corregir, que van en otra spec (`SPEC-KRILINXI-065`), no en esta.

**Lo que NO quedó registrado**, porque no se detalló en la prueba: el paso a paso de registrar ropa, cobrar y entregar; si la sincronización de
PowerSync atravesó el túnel entre dos dispositivos (el riesgo principal); si abrió sin internet tras la primera visita; si la página de aviso
del plan gratuito molestó algún pedido; y cuántos túneles permite el plan. Quien repita la prueba antes de una demo importante debería revisar
esos puntos.

## Si mañana tienes que tocar esto

Empieza por `frontend/src/pwa/demo.ts` y su test. Cuidado: la dirección pública queda **compilada** en la app, así que cambiar de dominio exige
volver a correr `npm run demo`; y cualquier regla del service worker que mire la dirección de la API debe usar `/api`, no el origen pelado.
