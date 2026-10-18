---
id: SPEC-KRILINXI-031
spec: specs/SPEC-KRILINXI-031-aviso-conexion-discreto.md
explica:
  - aria-expanded
  - cerrar tocando fuera)
  - desplegable que no es un modal (disclosure
  - un boton dentro de una region viva
  - un solo lugar para un texto que se muestra en dos piezas
---

# SPEC-KRILINXI-031 — Conexión en una esquina

## Qué se construyó

El estado de la conexión dejó de ser una franja ancha arriba de cada pantalla. Ahora es una
píldora chica en la cabecera que dice, en corto, cómo están las cosas ("Con internet", "Sin
internet · 3 por guardar"); al tocarla muestra la frase completa de siempre. El aviso grande vuelve
a aparecer solo cuando hay algo que hacer: registros que el servidor rechazó y hay que corregir.

## Cómo funciona, paso a paso

Sigamos el número "3 registros sin subir" desde la base local hasta la pantalla.

1. **La base avisa.** `observarEstado` (`frontend/src/lib/powersync/control.ts`) calcula
   `{ conectado, pendientes, paraCorregir }` cada vez que cambia algo, y `useConexion` lo pone
   en el estado de React (SPEC-KRILINXI-007).
2. **El marco lo lee una sola vez** (`frontend/src/pages/Marco.tsx:63`) y lo reparte:
   - a la píldora de la cabecera, solo `conectado` y `pendientes` (`Marco.tsx:76`);
   - al aviso grande, entero, pero **solo si `paraCorregir > 0`** (`Marco.tsx:95`).
3. **La píldora arma su texto corto** con `resumenConexion` (`frontend/src/components/textoConexion.ts:31`)
   → "Sin internet · 3 por guardar" (`PildoraConexion.tsx:56`). El color cambia a advertencia
   sin internet, pero quien informa es el texto.
4. **Al tocarla**, `aria-expanded` pasa a `true` (`PildoraConexion.tsx:50`) y aparece debajo un
   párrafo con `fraseConexion` (`textoConexion.ts:20`): "Trabajando sin internet — 3 registros se
   guardarán cuando vuelva la conexión.". Es la misma función que usa el aviso grande.
5. **Para cerrarla**, mientras está abierta escucha dos cosas en todo el documento
   (`PildoraConexion.tsx:32`): un toque fuera de ella (`pointerdown`) y la tecla Escape, que además
   devuelve el foco al botón. Al cerrarse deja de escuchar.
6. **Si el servidor rechaza algo**, `paraCorregir` pasa a 1 y el marco vuelve a mostrar el
   `AvisoConexion` de siempre, con el enlace a "Registros para corregir". Nada de lo que no se pudo
   guardar queda en silencio (§6).

## Dónde encaja en la arquitectura

- **`components/textoConexion.ts`** son funciones puras: entra un estado, sale una frase. Están en
  `components/` porque las usan dos componentes compartidos, y aparte de ellos porque no son UI.
- **`components/marco/PildoraConexion.tsx`** solo recibe props, como todo `components/marco/`
  (SPEC-KRILINXI-023). No lee la base: eso lo hace `useConexion`, en el marco.
- **`pages/Marco.tsx`** decide **cuándo** se muestra cada cosa. Por eso la regla "el aviso grande
  solo si hay algo para corregir" está ahí y no dentro de `AvisoConexion`, que sigue mostrando lo
  que le pasan: así sus tests de siempre siguen valiendo tal cual.

## Fundamentos

### Un desplegable que no es un modal (disclosure)

Hay dos maneras de mostrar algo "encima" al tocar un botón:

- **Un diálogo modal** (el menú en pantalla chica, `ModalConfirmacion`): tapa lo de atrás, atrapa
  el foco adentro y hay que cerrarlo para seguir. Se usa cuando hay que decidir algo.
- **Un desplegable (disclosure)**: un botón que muestra u oculta un bloque, sin tapar ni atrapar
  nada. Se usa para información extra que se puede ignorar. Es lo que es la píldora.

Lo que lo hace accesible son dos atributos en el botón: `aria-expanded` (abierto o cerrado, que el
lector de pantalla anuncia) y `aria-controls` (el `id` del bloque que muestra). El test los
comprueba juntos: el `aria-controls` del botón tiene que ser el `id` del párrafo que aparece.

Cerrar "tocando fuera" se hace escuchando `pointerdown` en todo el documento y preguntando si el
toque cayó dentro del contenedor (`contenedor.current.contains(evento.target)`). Se usa
`pointerdown` y no `click` porque cubre mouse, dedo y lápiz, y llega antes: el desplegable se
cierra en el mismo toque que activa otra cosa. Los oyentes se ponen **solo mientras está abierta**
(el `useEffect` depende de `abierta`): cerrada no escucha nada.

### Un botón dentro de una región viva

La píldora es un botón (se toca), pero también tiene que anunciar los cambios solita, como hacía el
aviso con `role="status"`. Un mismo elemento no puede ser las dos cosas: un botón con
`role="status"` deja de ser botón. Por eso hay dos capas: `<div role="status">` por fuera y el
`<button>` adentro (`PildoraConexion.tsx:46`). Cuando cambia el texto del botón, el lector de
pantalla lo anuncia porque está dentro de la región viva.

### Un solo lugar para lo que se dice dos veces

Antes, la frase vivía dentro de `AvisoConexion`. Con dos piezas que dicen lo mismo (la píldora y el
aviso), copiar la frase en la segunda habría sido el comienzo de dos versiones distintas de la
verdad: el día que alguien cambia "se guardarán" por "se subirán" en una, la otra queda vieja. Por
eso salió a `textoConexion.ts`, con su test, y las dos la importan.

**Ya explicado antes:**

- **Regiones vivas (role status y alert)** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)
- **Diálogo modal accesible (trampa y devolución del foco)** → SPEC-KRILINXI-023 (`specs/notas/SPEC-KRILINXI-023-marco-app.md`)

## Decisiones y por qué

- **Discreto, pero en palabras.** CLAUDE.md §9 pedía el estado "siempre visible y en palabras".
  Se mantuvo: sigue visible en todas las pantallas con sesión y sigue diciéndolo con texto; lo que
  cambió es el tamaño. §9 se corrigió para decirlo.
- **El aviso grande no se borró, se condicionó.** Cuando hay que corregir algo, una píldora en una
  esquina es demasiado fácil de pasar por alto (§6: "ningún error de sincronización puede quedar en
  silencio").
- **"Con internet · guardando 2"** también es corto: mientras sube, la persona sabe que no tiene que
  hacer nada.
- **Sin sesión no hay píldora**: sin nadie adentro no hay base local de la que leer.

## Los tests

- **Ampliado `controlFalso`**: ahora acepta el estado de la conexión que tiene que avisar,
  `controlFalso({ estado: { conectado: false, pendientes: 3, paraCorregir: 0 } })`. Antes cada
  test que lo necesitaba armaba su propio `mockImplementation` (hay uno así en `BarraSesion.test`);
  los próximos ya no tienen que hacerlo.
- **Nuevo `textoConexion.test.ts`**: el texto corto, caso por caso.
- **En `Marco.test.tsx`**: la píldora en cada estado, el despliegue (con Escape y tocando fuera), el
  aviso grande solo con algo para corregir, y que sea un `status` con texto.
- **Lo que jsdom no puede medir**: que en pantalla chica la píldora no empuje Salir fuera de la
  pantalla. El test comprueba lo que lo garantiza (texto corto, sin partir, cabecera con `flex-wrap`),
  pero mirarlo de verdad pide un navegador angosto.
- Cinco corridas en modo lento sin fallos, y una mutación (mostrar el aviso grande siempre) hace
  fallar los dos tests que lo vigilan.

## Si mañana tenés que tocar esto

- Para cambiar cómo se dice algo de la conexión, `textoConexion.ts`: lo toman la píldora y el aviso.
- Para cambiar **cuándo** aparece el aviso grande, `pages/Marco.tsx`, no `AvisoConexion`.
- Probalo a mano en un navegador angosto (unos 360px), sin internet y con varios pendientes, con el
  ADMIN atendiendo (que suma "Dejar de atender" a la cabecera): es el caso más apretado.
