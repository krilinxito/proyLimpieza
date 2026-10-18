---
id: SPEC-KRILINXI-030
spec: specs/SPEC-KRILINXI-030-tema-oscuro.md
explica:
  - aplicar el tema sin script en linea (csp y primer instante)
  - lo que se da vuelta en un tema oscuro
  - simular una preferencia del sistema (matchMedia) en los tests
  - tema como variables que cambian de valor (no clases dark:)
---

# SPEC-KRILINXI-030 — Tema oscuro

## Qué se construyó

La app tiene un tema oscuro. Si la tablet está en modo oscuro, la app también, y cambia sola
cuando la tablet cambia. En la cabecera hay un botón redondo y discreto (una luna en claro, un sol
en oscuro) para elegir a mano; la elección queda guardada en la tablet, también al salir de la
cuenta. De paso, quien atiende se muestra como un círculo con su inicial ("Perfil"), en lugar de
"Atiende: <nombre>".

## Cómo funciona, paso a paso

Sigamos qué pasa cuando alguien toca "Tema oscuro" y cómo eso llega a un botón azul.

1. **El botón solo avisa.** `BotonTema` (`frontend/src/components/marco/BotonTema.tsx`) recibe el
   tema y una función por props: no sabe nada de dónde se guarda. El marco se los pasa
   (`frontend/src/pages/Marco.tsx:76`).
2. **El hook decide.** `cambiar` (`frontend/src/hooks/useTema.ts:21`) calcula el tema contrario,
   lo guarda en la tablet (`guardarEleccion`, línea 23), lo aplica y actualiza su estado para que
   el botón diga "Tema claro".
3. **Aplicar es poner una marca en `<html>`.** `aplicarTema` (`frontend/src/lib/tema.ts:55`) hace
   `document.documentElement.dataset.tema = 'oscuro'`, es decir `<html data-tema="oscuro">`.
4. **El CSS cambia los valores, no las clases.** En `frontend/src/index.css:111`,
   `:root[data-tema='oscuro']` redefine cada `--color-*` del tema. Un botón primario tiene la clase
   `bg-marca`, y Tailwind la compiló como `background-color: var(--color-marca)`: no cambió nada
   en el botón, cambió lo que vale `--color-marca` (de `#1e40af` a `#93c5fd`). Por eso **ningún
   componente se tocó** en esta spec.
5. **Al volver a abrir la app**, `main.tsx:11` llama a `aplicarTema()` antes de montar React: lee
   la elección guardada (o, sin elección, la preferencia del sistema, `lib/tema.ts:49`) y la
   primera pantalla ya sale en ese tema.
6. **Sin elección, sigue a la tablet.** `useTema` se suscribe al cambio de `prefers-color-scheme`
   (`useTema.ts:14` → `lib/tema.ts:68`). Si la tablet pasa a modo oscuro de noche, la app también,
   sin recargar. Con una elección guardada, el sistema ya no manda.

## Dónde encaja en la arquitectura

- **`index.css`** es la única fuente de los colores (SPEC-KRILINXI-022). El tema oscuro es un
  segundo bloque en el mismo archivo, con los mismos nombres: así el test del tema puede leer los
  dos y compararlos.
- **`lib/tema.ts`** es lo único que toca la marca de `<html>` y la clave `lavanderia.tema` del
  almacenamiento. Es `lib/` porque no pertenece a ninguna feature (como `lib/reloj`).
- **`hooks/useTema.ts`** es transversal (§5): lo usa el marco, no una feature.
- **`components/marco/BotonTema.tsx`** solo pinta y avisa por props, como el resto de
  `components/marco/` (SPEC-KRILINXI-023). No lee el almacenamiento: eso lo prohíbe el test de
  arquitectura para `pages/` y los componentes de las features, y aquí se respeta la misma idea.
- **Lo que no le toca a un componente: elegir un color.** Si uno escribe `bg-white` o `#fff`, se
  queda blanco en el tema oscuro. La paleta cruda ya la prohíbe el test de arquitectura
  (SPEC-KRILINXI-027); se buscaron además hexadecimales escritos a mano y no hay ninguno.

## Fundamentos

### Un tema como variables que cambian de valor (y no clases que cambian)

Hay dos maneras de hacer un tema oscuro con Tailwind:

- **Variante `dark:`** en cada clase: `bg-white dark:bg-slate-800`. Cada componente declara sus
  dos colores. Funciona, pero hay que tocar cada componente, y uno olvidado queda blanco.
- **Redefinir los tokens**: los componentes usan `bg-superficie`, y lo que cambia según el tema es
  cuánto vale `--color-superficie`. Es lo que se hizo acá.

La segunda funciona porque Tailwind v4 compila `bg-marca` como `var(--color-marca)`: la utilidad
**apunta** a la variable, no copia su valor. Un test lo verifica sobre el CSS compilado
(`frontend/src/estilos.test.tsx`, el bloque de SPEC-KRILINXI-030). Si algún día Tailwind
"incrustara" el valor (lo hace con `@theme inline`), el tema oscuro dejaría de tener efecto sin
ningún error, y ese test es el que lo avisaría.

Y la regla CSS: `:root[data-tema='oscuro']` está fuera de las capas de Tailwind, y los estilos sin
capa ganan siempre a los que están en una capa (`@layer theme`, donde Tailwind pone los valores
claros). Además es más específica. Por eso no hace falta `!important`.

### Lo que se da vuelta en oscuro

No basta con invertir. Tres cosas cambian de papel, y el test de contraste es lo que obliga a
verlas:

- **`marca` es a la vez fondo de botón y color de texto** (un enlace, el nombre del negocio). En
  oscuro, para leerse como texto sobre la superficie oscura, tiene que ser clara (`#93c5fd`); pero
  entonces el texto blanco encima de un botón no se leería. Por eso `sobre-marca` pasa a ser oscuro
  (`index.css:117`). Lo mismo con `peligro`.
- **La antigüedad se aclara al envejecer.** En claro, más vieja era más oscura; en oscuro, lo que
  resalta sobre la superficie es lo claro. El test pasó de "más oscura" a "más contraste", que es
  la regla de fondo en los dos temas.
- **Las cuatro series de los gráficos no cambian.** Se corrió el validador de la guía de
  visualización contra la superficie oscura (`#1e293b`) con todas las parejas: pasan las cinco
  comprobaciones (peor par con daltonismo deutan ΔE 9,3; todas ≥ 3:1). La rampa de antigüedad
  oscura (`#3b82f6`, `#7fb0f7`, `#c3dafe`) pasa las comprobaciones de rampa ordinal.

### Aplicar el tema sin un script en línea (la CSP y el primer instante)

La receta común es un `<script>` dentro de `index.html` que pone la clase antes de que el navegador
pinte. Acá está prohibido: la política de seguridad del contenido no admite scripts en línea
(SPEC-KRILINXI-020). Se resolvió en dos partes:

- `main.tsx` aplica el tema **antes de montar React**. Como `index.html` no tiene contenido propio
  (solo `<div id="root">`), no hay nada que se vea en el tema equivocado.
- Para el instante entre que el navegador pinta el fondo y corre el JavaScript, una media query
  (`index.css:161`) pinta **solo el fondo y el texto** oscuros si la tablet lo prefiere y todavía
  no hay `data-tema`. Son dos valores, iguales a los del bloque oscuro, y un test vigila que lo
  sigan siendo.

Lo que no se pudo evitar: si alguien eligió oscuro a mano en una tablet que prefiere claro, el
fondo puede verse claro una fracción de segundo al abrir. Y la pantalla de arranque de la app
instalada usa el `background_color` del manifiesto (`vite.config.ts`), que es uno solo.

### Simular una preferencia del sistema en los tests

jsdom no tiene `window.matchMedia`: para él, el sistema nunca prefiere nada. `test/sistemaDePrueba.ts`
lo reemplaza mientras dura el test (`vi.stubGlobal`, y `onTestFinished` lo deshace) y deja cambiar la
respuesta en vivo con `sistema.cambiar({ oscuro: true })`, que avisa a quien escucha, como el
navegador.

**Ya explicado antes:**

- **Tokens de diseño** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)
- **Contraste WCAG (luminancia relativa)** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)
- **Política de seguridad del contenido (CSP)** → SPEC-KRILINXI-020 (`specs/notas/SPEC-KRILINXI-020-csp-frontend.md`)
- **Paleta segura para daltonismo** → SPEC-KRILINXI-026 (`specs/notas/SPEC-KRILINXI-026-estadisticas-tablero.md`)
- **Dobles de prueba** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Doble envío (estado y ref)** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)

## Decisiones y por qué

- **La app siempre pone `data-tema`, también cuando sigue al sistema.** La alternativa era una
  media query con todos los colores oscuros más un bloque para la elección manual: dos copias de
  cada color, que tarde o temprano se desincronizan. Así hay una copia, y la media query solo cubre
  el primer instante con dos valores.
- **El botón es un ícono discreto (luna en claro, sol en oscuro), por pedido explícito.** La
  primera versión decía "Tema oscuro" en palabras, para respetar "un ícono nunca va solo"
  (`iconos.tsx`, §9); se pidió algo más sutil. Queda como **la única excepción** a esa regla, y
  documentada en `iconos.tsx`: su nombre va en `aria-label` (lector de pantalla) y en `title` (al
  pasar el mouse). Es aceptable porque cambiar el tema es opcional y no es parte del trabajo del
  mostrador; no sirve de precedente para una acción del negocio.
- **Quien atiende pasó de "Atiende: Rosa Quispe" a un círculo con su inicial** (`Avatar`, en
  `components/marco/`), que dice "Perfil" al pasar el mouse. Es un `<span role="img">` con el
  nombre completo como nombre accesible, **no un botón**: el perfil todavía no existe, y un botón
  que no hace nada confunde. Cuando haya una spec de perfil, ese círculo pasa a ser el botón que lo
  abre. Lo que se pierde: el nombre ya no se lee a simple vista en la cabecera.
- **La elección es de la tablet, no de la cuenta.** Salir borra la sesión y la atención, pero no
  el tema: lo eligió quien mira esa pantalla, no quien entra.
- **Se agregó el par `texto` sobre `marca-suave`** al test: es la opción elegida (método de pago,
  sucursal) y no estaba medido.

## Los tests

- **Ampliado `test/tema.test.ts`**: ahora lee dos bloques (`bloque('claro' | 'oscuro')`) y mide los
  mismos pares en los dos, más que el oscuro redefina todos los colores y que el primer instante use
  sus mismos valores. Un color nuevo se agrega a los dos bloques, y el test lo exige.
- **Ampliado `estilos.test.tsx`**: comprueba sobre el CSS compilado que las utilidades leen la
  variable y que el bloque oscuro llega al build.
- **Creado `test/sistemaDePrueba.ts`**: el doble de `matchMedia`. Lo va a necesitar cualquier test
  que dependa de una preferencia del sistema (por ejemplo, movimiento reducido).
- **El detalle de los dos toques**: el test que toca el botón dos veces espera a que vuelva a estar
  habilitado entre toque y toque. `Boton` descarta un segundo toque mientras el primero termina
  (contra el doble cobro), y una persona no toca dos veces en el mismo microsegundo.
- Prueba de mutación hecha a mano: con un gris oscuro de `texto-suave` y sin `antiguedad-3` en el
  bloque oscuro, fallan los cinco tests que corresponden.

## Si mañana tenés que tocar esto

- Un color nuevo va en **los dos** bloques de `index.css`, y su par en `test/tema.test.ts`.
- Si un componente se ve mal solo en oscuro, casi seguro usa un token para algo que no es su papel
  (por ejemplo `text-marca` sobre `bg-marca-suave`). Agregá el par al test antes de cambiar el color.
- La prueba en un navegador de verdad (jsdom no pinta): `npm run build && npx vite preview`, cambiar
  el modo oscuro del sistema y recorrer el mostrador y las estadísticas en los dos temas.
