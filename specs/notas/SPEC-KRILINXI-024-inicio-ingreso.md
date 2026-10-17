---
id: SPEC-KRILINXI-024
spec: specs/SPEC-KRILINXI-024-inicio-ingreso.md
explica:
  - enlace o boton (segun lo que hace)
  - tarjeta tocable con nombre accesible corto
---

# SPEC-KRILINXI-024 — Inicio, ingreso y página no encontrada con el tema

## Qué se construyó

Lo primero que se ve de la app pasó al tema: el Inicio ya no es una columna de botones celestes
sino tarjetas de tareas con ícono, nombre y una línea de para qué sirven, y un saludo a quien
atiende. El ingreso es una tarjeta centrada, y la página que no existe y los avisos de "esto es
solo para…" ofrecen "Volver al inicio" como un botón visible.

## Cómo funciona, paso a paso

Rosa, empleada, abre `/`.

1. `Inicio` (`frontend/src/pages/Inicio.tsx:48`) pide sus tareas a `destinosDelMenu('EMPLEADO')`
   —la misma función que arma el menú del marco (SPEC-KRILINXI-023)— y saca el propio Inicio. Por
   eso el Inicio y el menú no pueden discrepar: no hay dos listas.
2. Cada destino ya trae `icono` y `descripcion`, que `pages/rutas.tsx` declara desde la spec del
   marco justamente para este momento.
3. `TarjetaTarea` (`Inicio.tsx:16`) arma un solo `<Link>` que ocupa toda la tarjeta. Su nombre
   accesible sale del `<span>` del título (`aria-labelledby`, `Inicio.tsx:21`) y la descripción
   queda enlazada como descripción (`aria-describedby`, `Inicio.tsx:22`). El lector de pantalla dice
   "Registrar ropa, enlace" y, si se detiene, "Cuando el cliente deja ropa…".
4. Las tarjetas van en una lista dentro de `<nav aria-label="Tareas">`: dos columnas desde `lg`.

Si en cambio Rosa escribe `/personal`, `RutaProtegida` muestra `AvisoSoloAdministrador`, que ahora
es un `Aviso` de información con el mismo texto y un `EnlaceBoton` "Volver al inicio"
(`frontend/src/components/EnlaceBoton.tsx:28`).

## Dónde encaja en la arquitectura

- **`pages/` compone, `rutas.tsx` registra.** El Inicio no decide qué tareas existen: lee el
  registro. Una pantalla nueva con `enMenu`, `icono` y `descripcion` aparece sola en el menú y en el
  Inicio.
- **La pantalla de ingreso se mudó a `features/auth/`** (`PantallaIngreso`), junto a su formulario.
  Antes el registro la armaba con un `Pantalla` genérico; ahora el título vive dentro de la tarjeta,
  así que la pantalla es de la feature y el registro solo la nombra.
- **`EnlaceBoton` es de `components/`**: no sabe a dónde lleva ni por qué, solo recibe `a`.

## Fundamentos

**Enlace o botón: lo decide lo que hace, no cómo se ve.** Un `<a>` (enlace) lleva a otro lugar; un
`<button>` hace algo en el lugar (cobrar, guardar, abrir un modal). El navegador y el lector de
pantalla los tratan distinto: un enlace se anuncia como "enlace", se puede abrir en otra pestaña y
aparece en la lista de enlaces de la página; un botón se activa también con la barra espaciadora y
no tiene dirección. "Volver al inicio" lleva a otra pantalla, así que es un enlace, aunque se vea
como botón porque es lo que hay que tocar (`EnlaceBoton`). Al revés —un `<div onClick>` o un botón
que navega— rompe el teclado o miente sobre qué va a pasar. Por eso existen las dos piezas: `Boton`
para acciones, `EnlaceBoton` para ir a otro lado.

**Una tarjeta entera que se toca, con un nombre corto.** Hacer de toda la tarjeta un enlace da un
blanco grande (bueno para el dedo de una persona mayor), pero por defecto el nombre accesible de un
enlace es *todo* su texto. Con `aria-labelledby` el nombre es solo el título, y con
`aria-describedby` la descripción queda disponible sin alargar el nombre. Los tests lo comprueban
igual que lo oiría alguien: `toHaveAccessibleName('Registrar ropa')` y
`toHaveAccessibleDescription(…)` (`frontend/src/pages/Inicio.test.tsx`).

**Ya explicado antes:**

- **Etiqueta y descripción accesibles** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Tokens de diseño** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)

## Decisiones y por qué

- **`EnlaceBoton` en `components/`, aunque la spec no lo nombraba.** "Volver al inicio" aparecía en
  cuatro lugares con las mismas clases escritas a mano; una pieza compartida es lo que `components/`
  existe para tener.
- **La regla de la paleta cruda se volvió una lista de carpetas** (`CON_EL_TEMA`,
  `frontend/src/test/arquitectura.test.ts:192`). Cada spec de la ola agrega las suyas; cuando estén
  todas, la regla cubre la app entera.

## Los tests

- **Reusé** `renderEnRuta`, `sesionDePrueba` y `sinJerga`.
- **`App.test.tsx`** comparaba el `textContent` de los enlaces del Inicio; ahora cada tarjeta trae su
  descripción, así que lee el nombre de donde sale de verdad: el elemento de `aria-labelledby`.
- **`estilos.test.tsx`** dejó de exigir `bg-sky-700` (que ya nadie usa en el Inicio) y comprueba que
  el build genere `bg-marca`, una clase del tema.

## Si mañana tenés que tocar esto

Para cambiar el texto de una tarea, se cambia su `descripcion` en `pages/rutas.tsx`: `rutas.test.ts`
exige que tenga entre 10 y 80 caracteres. Cuidado con `sinJerga`: el Inicio se revisa entero, así
que una descripción con "orden" o "sistema" lo hace fallar.
