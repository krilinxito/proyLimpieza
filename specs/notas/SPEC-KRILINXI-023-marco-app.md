---
id: SPEC-KRILINXI-023
spec: specs/SPEC-KRILINXI-023-marco-app.md
explica:
  - aria-current
  - constantes del build (define de vite)
  - dialogo modal accesible (trampa y devolucion del foco)
  - regiones de la pagina (landmarks)
  - ruta de diseno (layout route y outlet)
  - saltar al contenido
---

# SPEC-KRILINXI-023 — Marco de la app: barra, menú y pie

## Qué se construyó

Hasta acá, cada pantalla estaba suelta: para ir de "Cobrar" a "Clientes" había que volver al
Inicio. Ahora todas comparten un marco: arriba, el negocio, la sucursal, quién atiende y Salir;
al costado (o detrás del botón "Menú" en pantalla chica), los destinos; abajo, la sucursal y la
versión. El aviso de conexión quedó debajo de la cabecera, en todas.

## Cómo funciona, paso a paso

Una empleada de la sucursal Centro abre `/cobrar` en una tablet apaisada.

1. **El router elige dos cosas, no una.** `App.tsx:38` pone todas las rutas *dentro* de
   `<Route element={<Marco />}>`. Esa ruta no tiene `path`: no responde a ninguna dirección, solo
   envuelve. React Router monta primero `Marco` y, adentro, la pantalla de `/cobrar`
   (`App.tsx:40`, que sigue pasando por `RutaProtegida`).
2. **El marco junta los datos.** `Marco` (`pages/Marco.tsx:50`) lee la sesión y la dirección
   actual. `useLugar` (`Marco.tsx:30`) busca el nombre de la sucursal de la empleada en la base
   local (`useSucursales`, de la feature de sucursales) y arma "Sucursal Centro"; para el ADMIN,
   "Administración". `destinosDelMenu` (`pages/rutas.tsx:242`) recorre `RUTAS` y devuelve el
   Inicio más lo que el rol puede abrir, cada uno con su ícono.
3. **Pone el título de la pestaña.** El efecto de `Marco.tsx:57` llama a `tituloDePestana`
   (`rutas.tsx:254`): "Cobrar · Lavandería".
4. **Reparte a las piezas.** `Cabecera` recibe el lugar, el botón del menú y `BarraSesion` (Salir);
   la barra lateral, `MenuPrincipal` con los destinos; `Pie`, el lugar y la versión. Ninguna de
   esas piezas sabe de dónde salió lo que muestra.
5. **El menú marca dónde está.** `MenuPrincipal` usa `NavLink` (`components/marco/MenuPrincipal.tsx:27`),
   que compara su destino con la dirección y le pone `aria-current="page"` solo al de "Cobrar".
   Las clases `aria-[current=page]:…` (`MenuPrincipal.tsx:31`) lo pintan en negrita, con fondo y
   con una barra a la izquierda.
6. **La pantalla va en el hueco.** `<Outlet />` (`Marco.tsx:83`), dentro del único `<main>`
   (`Marco.tsx:77`), es donde React Router pone la pantalla de `/cobrar`.
7. **Al tocar "Clientes"** cambia la dirección: React Router reemplaza lo que hay en el `<Outlet />`
   y el marco **no se vuelve a montar**. La sucursal no se relee, el menú no parpadea; solo cambian
   el `aria-current` y el título de la pestaña.

En una tablet vertical, el paso 4 es distinto solo en CSS: la barra lateral tiene `hidden lg:block`
y el botón "Menú" (`MenuCompacto`) tiene `lg:hidden`. Al tocarlo, el cajón aparece como diálogo,
el foco va al primer destino (`components/marco/MenuCompacto.tsx:35`), Tab da la vuelta dentro de
él (`atraparTab`, `MenuCompacto.tsx:43`), y al cerrarlo el foco vuelve al botón (`cerrar`,
`MenuCompacto.tsx:28`).

## Dónde encaja en la arquitectura

- **`components/marco/` dibuja, `pages/Marco.tsx` decide.** Las piezas del marco solo reciben props,
  como todo `components/` (CLAUDE.md §5). Quien sabe de sesión, base local y rutas es `Marco`, en
  `pages/`, que es la capa de composición. Si `Cabecera` llamara a `useSucursales`, `components/`
  dependería de una feature, y la regla `components/sinDatos.test.ts` lo frenaría. Ese test ahora
  mira también las subcarpetas: antes leía solo el primer nivel, y `marco/` habría quedado afuera
  sin que nadie lo notara.
- **`rutas.tsx` sigue siendo el único registro.** El menú no tiene su propia lista de pantallas:
  la deriva de `RUTAS` (`enMenu`, `puedeVer`). Una pantalla nueva aparece en el menú y en el
  Inicio con solo agregarla al registro con su `icono` y su `descripcion` (`pages/rutas.test.ts`
  falla si faltan).
- **Salir no se movió.** Su lógica (el aviso con los registros sin guardar, SPEC-KRILINXI-010)
  sigue en `features/auth/components/BarraSesion.tsx`. Solo dejó de ser un `<header>`: dentro de la
  cabecera, habría sido una segunda.
- **`Pantalla` ya no es la página**, es el título y el contenido. Lo que rodea a la pantalla es del
  marco.

## Fundamentos

**Ruta de diseño (layout route) y `<Outlet />`.** En React Router, una `<Route>` puede tener otras
adentro. La de afuera dibuja lo común y marca con `<Outlet />` dónde va la de adentro. Si no tiene
`path`, no corresponde a ninguna dirección: es solo un envoltorio. Sin esto, había dos caminos, y
los dos malos: repetir cabecera y menú en cada pantalla (como antes `BarraSesion` y `AvisoConexion`,
montados uno por uno en `elementoDe`), o envolver `<Routes>` en un componente, que funciona pero
no sabe en qué ruta está. Con la ruta de diseño, el marco se monta una vez y sobrevive a los
cambios de pantalla. Ejemplo: `App.tsx:38` y `Marco.tsx:83`.

**Regiones de la página (landmarks).** Un lector de pantalla no "ve" la página: la recorre. Para
saltar rápido, usa las regiones que declaran ciertos elementos: `<header>` es `banner` (la
cabecera del sitio), `<nav>` es `navigation`, `<main>` es `main` (lo importante), `<footer>` es
`contentinfo`. Por eso **tiene que haber un solo `<main>`** (antes cada `Pantalla` traía el suyo, y
con el marco habrían sido dos), un solo `banner` (por eso `BarraSesion` dejó de ser `<header>`), y
el `<nav>` lleva nombre ("Menú principal"), porque las páginas de la auditoría también son un `<nav>`
("Páginas de quién hizo qué"). Los tests buscan por estas mismas regiones: `getByRole('main')`,
`getByRole('banner')`, `getByRole('contentinfo')` (`pages/Marco.test.tsx`).

**Diálogo modal accesible: trampa de foco y devolución del foco.** Un cajón abierto tapa la
pantalla. Para quien ve, está claro que lo de atrás no se toca; para el teclado no lo está, y Tab
seguiría por los botones tapados. Un diálogo modal hace tres cosas: (1) mueve el foco adentro al
abrir (`MenuCompacto.tsx:35`); (2) atrapa el Tab, que del último elemento vuelve al primero y con
Shift al revés (`atraparTab`, `MenuCompacto.tsx:43`); (3) al cerrar, devuelve el foco a lo que lo
abrió (`cerrar`, `MenuCompacto.tsx:28`). Sin el (3), el foco queda en un elemento que ya no existe,
y el navegador lo manda al principio de la página: quien usa teclado pierde el lugar cada vez.
`aria-modal="true"` le avisa al lector de pantalla que lo de atrás no cuenta, y `aria-expanded`
en el botón dice si el cajón está abierto. `ModalConfirmacion` (SPEC-KRILINXI-002) ya movía el
foco a "Cancelar"; el cajón es el primer diálogo del proyecto que lo atrapa y lo devuelve.

**`aria-current="page"`.** Marca, dentro de un grupo de enlaces, el que lleva a donde ya estás. El
lector de pantalla lo dice ("Cobrar, página actual"). Colgar el estilo del mismo atributo
(`aria-[current=page]:font-bold`) garantiza que lo que se ve y lo que se anuncia nunca se
contradigan: no hay una clase "activo" aparte que alguien pueda olvidarse de poner.

**Saltar al contenido.** Con teclado, cada pantalla empieza en la cabecera y el menú: siete u ocho
Tab antes de llegar al primer campo. El enlace "Saltar al contenido" es lo primero enfocable, está
escondido (`sr-only`) hasta que tiene el foco, y lleva el foco al `<main>` (que acepta foco por su
`tabIndex={-1}`, `Marco.tsx:77`). Mueve el foco a mano en vez de dejar que el `#contenido` cambie la
dirección, porque en esta app un cambio de dirección es una navegación del router.

**Constantes del build (`define` de Vite).** La versión está en `frontend/package.json`, que no
viaja al navegador. `define` (`vite.config.ts:15`) le dice a Vite: "donde aparezca
`__VERSION_APP__`, escribí este texto". El reemplazo es literal, al compilar, en el build y en los
tests (que usan la misma configuración). TypeScript no sabe que existe, así que se declara con
`declare const` (`pages/version.ts:8`) y se exporta con un nombre normal, para que nadie más tenga
que tocar el nombre raro.

**Ya explicado antes:**

- **Enrutado del lado del cliente** → SPEC-KRILINXI-001 (`specs/notas/SPEC-KRILINXI-001-frontend-scaffold.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **`focus-visible`** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)
- **Regiones vivas (`role="status"` y `"alert"`)** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)

## Decisiones y por qué

- **Barra lateral desde 1024px, cajón debajo** (la decidió el usuario al crear la spec). La
  alternativa, una fila arriba, no entra con seis destinos en letra grande; y la hamburguesa en todos
  los tamaños esconde justo lo que una persona mayor necesita ver.
- **El cajón solo existe en el DOM mientras está abierto.** Si estuviera siempre (oculto con CSS),
  jsdom no lo ocultaría y cada enlace del menú aparecería dos veces en los tests. Además, cerrado no
  tiene nada que anunciar.
- **Sin nombre de sucursal mientras no bajó, en vez de "Cargando…"**: un texto que cambia a los
  dos segundos de abrir distrae más de lo que informa, y el nombre no es necesario para trabajar.
- **El nombre del negocio es un enlace al Inicio, no un `h1`.** El `h1` de cada página es el de la
  pantalla, que es lo que cambia; dos `h1` iguales en todas las páginas harían ruido.

## Los tests

- **Reusé** `renderEnRuta`, `sesionDePrueba` y `controlFalso`. Para que la cabecera tenga una
  sucursal que mostrar, `conSucursal()` (en `pages/Marco.test.tsx`) le enseña al `consultar` del doble
  a devolver una fila: el mismo `controlFalso` de siempre, con un `mockImplementation`.
- **Generalicé** `components/sinDatos.test.ts` para que use `archivosFuente('components')` (que
  recorre subcarpetas) en vez de `readdirSync` del primer nivel.
- **Ajusté cuatro tests de otras specs** que buscaban "Registrar ropa" o "Ropa en el local" sin decir
  dónde: ahora el menú también los nombra. Buscan dentro de `getByRole('main')` o por rol
  (`heading`). Es la regla que quedó en CLAUDE.md §2 para las pantallas que vengan.
- El de la trampa de foco **sí prueba algo**: `fireEvent.keyDown` no mueve el foco por sí mismo (no es
  un Tab de verdad), así que si `atraparTab` no existiera, el foco se quedaría en el último y el test
  fallaría.
- La suite pasó también en modo lento (`LENTO_MS=200`), porque el marco suma una lectura de la base
  local (la sucursal) en todas las pantallas.

## Si mañana tenés que tocar esto

- **Una pantalla nueva en el menú:** una entrada en `RUTAS` con `enMenu: true`, `icono` y `descripcion`.
  No hay que tocar el marco.
- **Lo que no se puede probar en jsdom** es el CSS: que la barra lateral desaparezca debajo de 1024px,
  que el cajón se vea bien y que el "Saltar al contenido" aparezca con Tab. Para eso, `npm run dev`, las
  herramientas del navegador en modo tablet (768 y 1024 de ancho) y probar con el teclado.
- Si un test nuevo falla con "Found multiple elements", casi seguro buscó un nombre de pantalla en toda
  la página: buscalo dentro de `main`.
