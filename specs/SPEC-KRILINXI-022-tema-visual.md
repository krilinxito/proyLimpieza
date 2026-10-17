---
id: SPEC-KRILINXI-022
name: Tema visual y piezas base de la interfaz
slug: tema-visual
status: draft
owner: krilinxito
created: 2026-10-17
scope:
  - frontend/src/index.css
  - frontend/src/components/**
  - frontend/public/**
  - frontend/package.json
  - frontend/vite.config.ts
  - frontend/src/pwa/build.test.ts
  - frontend/src/test/**
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

Primera spec de la ola estética. Hoy no hay tema: `index.css` es solo `@import 'tailwindcss'` y cada pantalla escribe sus colores a mano (`bg-red-50`, `bg-sky-50`, `bg-green-50`, `bg-amber-50` repetidos). Esta spec fija el lenguaje visual que copiarán las siguientes (marco de la app, inicio, pantallas del mostrador y del admin): colores, tamaños, bordes y sombras como tokens de Tailwind v4 (`@theme`), una fuente propia muy legible (Atkinson Hyperlegible, diseñada para baja visión; servida desde el propio sitio por la CSP de SPEC-KRILINXI-020), un juego de íconos SVG, y las piezas compartidas rediseñadas (`Boton`, `CampoTexto`, `ModalConfirmacion`, `Paginas`) más tres nuevas (`Tarjeta`, `Aviso`, `Insignia`).

No toca ninguna pantalla de `features/` ni `pages/`: esas pasan al tema en sus propias specs. Ningún texto visible ni nombre accesible cambia, para que la suite existente siga pasando sin tocar sus afirmaciones. `components/` sigue sin saber del negocio: `Insignia` recibe un tono (neutro, información, éxito, advertencia, peligro), y qué tono lleva cada estado de la orden lo decide la feature.

## Criterios de aceptación

- [ ] `index.css` declara en `@theme` los tokens del sistema: color de marca, superficie, texto, texto suave, borde, y los cuatro tonos de aviso (información, éxito, advertencia, peligro) con su fondo y su texto; el tamaño de letra base es de al menos 18px.
- [ ] Un test lee los pares texto/fondo del tema desde `index.css` y comprueba que cada uno alcanza un contraste de al menos 4,5:1 (WCAG AA); falla si alguien cambia un color y lo deja ilegible.
- [ ] Ningún archivo de `components/` usa clases de la paleta cruda de Tailwind (`sky-700`, `slate-400`, `red-50`…): solo los tokens del tema. Lo vigila un test de arquitectura.
- [ ] La fuente Atkinson Hyperlegible (normal y negrita, woff2) se sirve desde el propio sitio, el build la deja en el precache (lo comprueba `src/pwa/build.test.ts`) y `csp.ts` no necesita cambios.
- [ ] `components/iconos` exporta los íconos de las pantallas y del marco (registrar ropa, ropa, cobrar, entregar, clientes, personal, sucursales, quién hizo qué, estadísticas, menú, cerrar, salir, alerta, inicio) como SVG en línea con `aria-hidden="true"` y sin `style`; un test lo comprueba para cada uno.
- [ ] `Boton` conserva su API y sus variantes, mide al menos 56px de alto, muestra un anillo de foco visible con teclado (`focus-visible`), y deshabilitado se distingue por algo más que el color; acepta un `icono` opcional que se muestra antes del texto y no cambia su nombre accesible.
- [ ] `CampoTexto` muestra la etiqueta siempre visible arriba y, si hay error, el texto del error con el ícono de alerta en el tono de peligro, con `aria-invalid` y el error enlazado por `aria-describedby`.
- [ ] `ModalConfirmacion` se ve como una tarjeta sobre un fondo oscurecido y conserva su comportamiento: solo `onConfirmar` ejecuta; cancelar, Escape o tocar fuera llaman a `onCancelar`.
- [ ] `Aviso` recibe un tipo (información, éxito, advertencia, error) y siempre muestra texto, con un ícono decorativo; los de error y advertencia usan `role="alert"`, los de información y éxito `role="status"`.
- [ ] `Tarjeta` agrupa contenido con superficie, borde y título opcional como encabezado; `Insignia` muestra un texto con el tono que recibe, y el color nunca es la única señal (el texto siempre está).
- [ ] Toda la suite existente del frontend pasa sin modificar ninguna afirmación de texto ni de rol, y ningún `.tsx` de la app usa `style={…}`.
- [ ] `components/README.md` y CLAUDE.md (§2 y §5) describen los tokens y las piezas nuevas, con la regla de usar los tokens y no colores sueltos.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-022', () => { ... })

Así un `grep SPEC-KRILINXI-022` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
