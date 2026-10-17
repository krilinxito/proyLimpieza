---
id: SPEC-KRILINXI-024
name: Inicio, ingreso y página no encontrada con el tema
slug: inicio-ingreso
status: finished
owner: krilinxito
created: 2026-10-17
scope:
  - frontend/src/pages/Inicio.tsx
  - frontend/src/pages/NoEncontrada.tsx
  - frontend/src/pages/EnConstruccion.tsx
  - frontend/src/pages/Inicio.test.tsx
  - frontend/src/features/auth/components/**
  - frontend/src/estilos.test.tsx
  - frontend/src/App.test.tsx
  - frontend/src/test/arquitectura.test.ts
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-023
tests:
  - frontend/src/App.test.tsx
  - frontend/src/components/EnlaceBoton.test.tsx
  - frontend/src/estilos.test.tsx
  - frontend/src/pages/Inicio.test.tsx
  - frontend/src/test/arquitectura.test.ts
---

## Descripción

Tercera spec de la ola estética. El marco (SPEC-KRILINXI-023) ya rodea todas las pantallas, pero lo primero que se ve —el ingreso y el Inicio— sigue siendo una columna de botones celestes (`bg-sky-700`) con la paleta cruda. Esta spec pasa al tema (SPEC-KRILINXI-022) las pantallas de entrada: el **Inicio** como tarjetas grandes de tareas, con el ícono, el nombre y la `descripcion` que cada ruta ya declara en `pages/rutas.tsx`, y un saludo a quien atiende; el **ingreso** como una tarjeta centrada; la **página no encontrada** con un camino claro de vuelta; y los avisos de "solo para el administrador / empleado" con `Aviso`.

El Inicio no lista sus tareas a mano: usa `destinosDelMenu` sin el propio Inicio, la misma fuente que el menú. Ningún texto visible cambia, salvo el saludo nuevo. Al terminar, la regla que prohíbe la paleta cruda (`test/arquitectura.test.ts`) se extiende a `pages/` y `features/auth/`.

## Criterios de aceptación

- [ ] El Inicio muestra una tarjeta por cada tarea que el rol puede abrir (las de `destinosDelMenu`, sin el propio Inicio), en el mismo orden que el menú; cada una es un enlace cuyo nombre accesible es el título de la ruta y que muestra su ícono y su `descripcion`.
- [ ] Las tarjetas del Inicio se tocan con comodidad: al menos 96px de alto, el texto del título en tamaño 2xl, y en pantalla ancha se acomodan en dos columnas.
- [ ] El Inicio saluda por su nombre a quien atiende ("Hola, Rosa Quispe") debajo del título "Lavandería", que sigue siendo el `h1`.
- [ ] La pantalla de ingreso muestra el formulario dentro de una tarjeta centrada con el nombre del negocio arriba; los campos, el botón y los mensajes de error son los de siempre y se ven con el tema.
- [ ] La página no encontrada dice qué pasó y ofrece un único enlace "Volver al inicio" con estilo de botón.
- [ ] Los avisos de "solo para el administrador" y "solo para quien atiende el mostrador" se muestran con `Aviso` de tipo información, con el mismo texto que hoy.
- [ ] `estilos.test.tsx` deja de exigir `bg-sky-700` y comprueba en su lugar una clase del tema (`bg-marca`) generada por el build.
- [ ] La regla de la paleta cruda de `test/arquitectura.test.ts` cubre también `pages/` y `features/auth/`, y pasa.
- [ ] Toda la suite existente pasa, y `sinJerga()` no encuentra palabras del sistema en el Inicio.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-024', () => { ... })

Así un `grep SPEC-KRILINXI-024` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
