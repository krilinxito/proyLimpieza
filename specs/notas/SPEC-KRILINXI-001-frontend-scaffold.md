---
id: SPEC-KRILINXI-001
spec: specs/SPEC-KRILINXI-001-frontend-scaffold.md
explica:
  - bundler
  - css por utilidades
  - enrutado del lado del cliente
  - helper de test
  - jsdom
  - npm workspaces
  - testing library
  - typescript
  - variables de entorno en el navegador
---

# SPEC-KRILINXI-001 — Scaffolding del frontend

## Qué se construyó

El esqueleto de la aplicación que van a usar en el mostrador: se abre en el navegador,
muestra un menú con lo que se puede hacer ("Registrar ropa", "Entregar ropa", "Cobrar") y
tiene ya montadas todas las pantallas, aunque por dentro todavía estén vacías. Ninguna hace
nada útil: eso llega con las specs siguientes.

Es la primera bitácora del proyecto, así que carga con casi todos los fundamentos. Las que
vengan detrás van a ser bastante más cortas, porque podrán referenciar estos.

## Cómo funciona, paso a paso

### Recorrido 1: qué pasa desde que se abre el navegador hasta que se ve el menú

1. El navegador pide `/` y recibe `frontend/index.html`. Es un archivo casi vacío: solo
   tiene `<div id="root"></div>` y una etiqueta `<script>` que apunta a `src/main.tsx`.
   **Toda la página se construye después, con JavaScript.**
2. `frontend/src/main.tsx:12` busca ese `<div id="root">` y le dice a React que pinte la
   aplicación dentro. Si no lo encuentra, falla ahí mismo con un mensaje claro
   (`main.tsx:9`) en vez de dejar una pantalla en blanco sin explicación.
3. Antes de pintar nada, envuelve la app en `<BrowserRouter>` (`main.tsx:14`). Ese
   componente es el que lee la dirección de la barra del navegador y la pone a disposición
   del resto.
4. `frontend/src/App.tsx:12` recorre la lista `RUTAS` y crea una `<Route>` por cada entrada.
   Cada `<Route>` dice: "si la dirección es *esta*, pintá *este* componente".
5. Como la dirección es `/`, gana la primera entrada de `frontend/src/pages/rutas.tsx:21` y
   se pinta `<Inicio />`.
6. `Inicio` vuelve a leer esa misma lista, se queda con las marcadas `enMenu: true` y dibuja
   un enlace grande por cada una. **El menú no está escrito a mano en ningún sitio**: sale
   del registro de rutas, así que añadir una pantalla añade su botón solo.
7. Si la dirección no coincide con ninguna, cae en la ruta comodín `path="*"`
   (`App.tsx:15`) y se ve "Esa página no existe" en vez de una pantalla en blanco.

### Recorrido 2: qué pasa cuando corrés `npm test`

1. `npm test` en la raíz ejecuta `npm run test --workspaces`, que baja a `frontend/` y
   arranca **Vitest**.
2. Vitest lee la configuración del bloque `test` de `frontend/vite.config.ts:14`. Ahí dice
   `environment: 'jsdom'`: como los tests corren en Node y en Node no hay navegador, jsdom
   simula uno.
3. Antes de cada archivo carga `src/test/setup.ts`, que añade comprobaciones cómodas sobre
   el DOM (`toBeInTheDocument`, `toHaveClass`).
4. `vite.config.ts:19` define `VITE_API_URL` solo para los tests. Sin eso, cada persona
   tendría un resultado distinto según lo que tuviera en su `.env`.
5. Busca los archivos `*.test.ts` / `*.test.tsx` dentro de `src/` y los ejecuta.

## Dónde encaja en la arquitectura

`CLAUDE.md` §5 define las carpetas del frontend, y esta spec las creó todas con un README
que explica qué va dentro. Lo que importa recordar:

- **`pages/` solo compone.** `App.tsx` no sabe nada de órdenes ni de clientes: recorre una
  lista y monta rutas. Toda la lógica de negocio vive en `features/`.
- **`lib/` es lo transversal**: cosas que usa todo el mundo y que no pertenecen a ninguna
  feature. Por ahora solo está `env.ts`; le seguirán `money` y `powersync/`.
- **`components/` es UI sin negocio** (botones, modales) y **`features/` es negocio**
  (`ordenes/`, `clientes/`…). Si un botón sabe lo que es una orden, está en la carpeta
  equivocada.
- **La regla más importante y la que aún no se puede romper porque no hay nada que romper**:
  ningún componente llama a axios ni consulta PowerSync directamente; pasa por
  `features/<x>/api` o por un hook (`CLAUDE.md` §5). Si se salta, cada componente se vuelve
  imposible de testear sin levantar medio sistema.

Una pieza de arquitectura que sí introdujo esta spec: **el registro de rutas**
(`pages/rutas.tsx:21`). Podría no existir — se podrían escribir las `<Route>` a mano en
`App.tsx`. Está porque somos dos personas trabajando en ramas distintas: si cada pantalla
nueva obligara a editar `App.tsx`, ese archivo daría conflicto de merge en cada spec. Con
el registro, una spec nueva solo cambia *su* entrada.

## Fundamentos

### Bundler (y por qué hace falta Vite)

En el código escribimos `import { useState } from 'react'`. El navegador no sabe qué es
`'react'`: solo entiende rutas de archivos y direcciones web. Un **bundler** es el programa
que traduce eso — busca las dependencias, junta todo y lo deja en archivos que el navegador
sí puede cargar. **Vite** es el nuestro. En desarrollo (`npm run dev`) además vigila los
archivos y refresca el navegador al guardar; en producción (`npm run build`) escribe la
versión final en `dist/`.

### TypeScript y qué hace `tsc --noEmit`

TypeScript es JavaScript con tipos: decir que `apiUrl` es un texto permite que el compilador
avise si alguien le pasa un número, **antes** de ejecutar nada. Los tipos no existen cuando
el código corre; se borran al compilar.

`tsc --noEmit` es curioso al principio: `--noEmit` significa "no generes archivos". Solo
revisa. De generar los archivos ya se encarga Vite; a `tsc` lo llamamos únicamente para que
nos diga si hay errores de tipos (`frontend/package.json`, script `typecheck`).

### Workspaces de npm

El repo tiene dos proyectos (`frontend/` y en el futuro `backend/`), cada uno con su
`package.json` y sus dependencias. Los **workspaces** los declaran en el `package.json` de
la raíz para que `npm install` instale todo de una vez, en un único `node_modules`
compartido, y `npm test` corra la suite de todos.

Detalle que costó un intento: npm **falla** si declarás un workspace cuya carpeta todavía no
tiene `package.json`. Por eso la raíz solo declara `frontend` de momento.

### Variables de entorno en el navegador

La dirección de la API cambia según dónde corra la app (tu máquina, la tienda, el
servidor), así que no puede estar escrita en el código. Se pone en el archivo `.env` y se
lee como `import.meta.env.VITE_API_URL`.

Dos cosas que hay que saber:

- **Solo las que empiezan por `VITE_`** llegan al navegador. Es una protección: evita que
  una contraseña del backend acabe publicada por accidente.
- **No se leen cuando la app arranca, sino cuando se compila.** Vite sustituye
  `import.meta.env.VITE_API_URL` por el texto literal. Por eso una variable que falta no da
  un error donde se configura: da una petición a `undefined/api/ordenes` mucho más tarde. De
  ahí que `frontend/src/lib/env.ts:19` la valide al arrancar y falle con un mensaje que dice
  qué hacer.
- **Nada de lo que va ahí es secreto.** Cualquiera puede leerlo desde el navegador.

### Enrutado del lado del cliente

En una web tradicional, pedir `/clientes` le pide al servidor la página de clientes. Aquí no:
el servidor manda siempre el mismo `index.html`, y es JavaScript el que mira la dirección y
decide qué pintar. Eso hace que cambiar de pantalla sea instantáneo (no se recarga nada),
y es lo que permite que la app funcione sin internet una vez cargada — que es un requisito
del proyecto, no un lujo (`CLAUDE.md` §6).

### Test unitario, jsdom y Testing Library

Un **test** es código que ejecuta otro código y comprueba que hace lo que debe. Se corre solo
y en segundos, así que avisa de una rotura antes que un usuario.

Los tests corren en Node, donde no hay navegador ni `document`. **jsdom** es una imitación de
navegador escrita en JavaScript: suficiente para crear elementos y hacer clic, sin abrir
ninguna ventana.

**Testing Library** renderiza componentes y los busca *como los buscaría una persona*:
`getByRole('link', { name: 'Registrar ropa' })` significa "el enlace que dice Registrar
ropa". Se busca por rol y texto, no por clase CSS ni por id, a propósito: así el test sigue
pasando si cambiás el diseño, y falla si rompés lo que el usuario ve. Un test que busca
`.btn-primary` se rompe con cada retoque visual y no comprueba nada útil.

### Helper de test compartido

`src/test/render.tsx:18` no prueba nada: es una herramienta para los demás tests. Casi toda
pantalla usa enlaces, y un componente con enlaces **revienta** si se renderiza sin un Router
encima. En vez de repetir ese envoltorio en cada archivo, se escribe una vez:

    renderEnRuta(<App />, '/cobrar');

`MemoryRouter` es un Router que guarda la dirección en memoria en lugar de en la barra del
navegador — justo lo que hace falta cuando no hay navegador.

Cuando veas que vas a copiar y pegar un montaje de test por tercera vez, eso es la señal
para convertirlo en un helper como este.

### CSS por utilidades (Tailwind)

En vez de escribir CSS aparte y nombrar clases (`.boton-principal`), se componen clases
pequeñas directamente en el marcado: `bg-sky-700` (fondo azul), `px-6` (espacio a los
lados), `text-xl` (letra grande). Se ve recargado al principio y se lee muy rápido después,
porque no hay que ir a buscar a otro archivo qué hace cada nombre.

Tailwind **lee tu código** para saber qué clases usás y genera solo esas: la hoja final pesa
lo que uses y nada más. Eso tiene un efecto curioso que nos mordió al escribir el test — está
contado abajo.

**Ya explicado antes:** nada todavía. Esta es la primera bitácora del proyecto; a partir de
aquí, lo que ya esté aquí se referencia en vez de repetirse.

## Decisiones y por qué

- **Sin el SDK de PowerSync ni el plugin de PWA**, aunque el `CLAUDE.md` los liste en el
  stack. Una dependencia que no se configura hasta dentro de tres specs es peso muerto que
  envejece sola; cuando llegue su spec vas a querer la versión de ese momento. Se descartó
  "instalarlo todo de una vez" a sabiendas.
- **El `package.json` de la raíz declara solo `frontend`.** La alternativa —declarar también
  `backend`— no es que sea fea: es que npm falla, porque esa carpeta todavía no tiene
  `package.json`. Cuando el otro dev arranque, añade su línea.
- **TypeScript 7**, que es la versión estable actual. Compila mucho más rápido, y con un
  equipo aprendiendo, la velocidad con la que el editor te marca un error importa más de lo
  que parece.
- **El Router se monta en `main.tsx` y no dentro de `App`.** Así los tests pueden montar la
  app en la ruta que quieran. Si `App` trajera su propio `BrowserRouter`, para probar la
  pantalla de "cobrar" habría que simular la barra de direcciones del navegador.
- **Las pantallas vacías existen igualmente**, con un texto honesto ("Esta parte todavía no
  está hecha"). Cuesta cinco líneas y evita que cada spec futura tenga que tocar el registro
  de rutas.

## Los tests

24 tests en 4 archivos. No había ningún helper que reutilizar —es la primera spec del
proyecto—, así que se creó el primero: **`src/test/render.tsx`**, explicado arriba. Las
specs siguientes deberían usarlo en vez de `render()` a secas.

Vale la pena mirar dos de ellos:

- **`src/App.test.tsx`** recorre el propio registro de rutas con `it.each`: genera un test
  por cada ruta declarada. Si alguien añade una entrada y se olvida de la pantalla, el test
  aparece y falla solo. Es un patrón que conviene copiar: en vez de escribir un test por
  caso, se recorre la lista que ya existe.
- **`src/estilos.test.tsx`** compila el CSS de verdad con Vite y comprueba que hay una regla
  para cada utilidad que usan las pantallas.

Y una advertencia honesta sobre ese último: **no comprueba que el navegador pinte los
estilos**. Se intentó. Tailwind v4 emite `@layer` y variables CSS, y el motor de estilos de
jsdom no entiende ninguna de las dos, así que `getComputedStyle` devuelve los valores por
defecto aunque el CSS esté cargado. Lo que el test sí garantiza: Tailwind está instalado,
enchufado a Vite, leyendo nuestros archivos y generando las reglas. Verificar el pintado de
verdad pide un navegador real, y eso es otra spec.

El detalle divertido: el test comprueba también que **no** se generen utilidades que nadie
usa. La primera versión fallaba, porque escribir `bg-fuchsia-300` en el test hacía que
Tailwind —que escanea todos los archivos, tests incluidos— la generase. Ahora el nombre se
arma en tiempo de ejecución para que el escáner no pueda verlo.

## Si mañana tenés que tocar esto

- **Añadir una pantalla**: una entrada en `frontend/src/pages/rutas.tsx:21`. Nada más. Si te
  ves editando `App.tsx`, parate y preguntá por qué.
- **Añadir una variable de entorno**: va en `frontend/src/lib/env.ts` y en `.env.example`, en
  los dos sitios, y tiene que empezar por `VITE_`.
- **Los tests van al lado del archivo que prueban** (`env.ts` → `env.test.ts`), y el
  `describe` **siempre** lleva el id de la spec: es lo que permite ir del test a la spec y al
  revés.
- **Ojo con `npm run typecheck`**: si lo corrés con una tubería (`| tail`), el código de
  salida que ves es el del `tail`, no el de `tsc`, y un fallo pasa desapercibido. Nos pasó.
