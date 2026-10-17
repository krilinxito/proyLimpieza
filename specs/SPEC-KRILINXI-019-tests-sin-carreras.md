---
id: SPEC-KRILINXI-019
name: Una suite del frontend sin carreras
slug: tests-sin-carreras
status: draft
owner: krilinxito
created: 2026-10-17
scope:
  - frontend/src/**/*.test.ts
  - frontend/src/**/*.test.tsx
  - frontend/src/test/**
  - frontend/vite.config.ts
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

La suite del frontend falla de vez en cuando sin que el código esté mal. En la segunda ola pasó con "con boleta y pagando lo que falta…" (`PantallaEntregar.test.tsx`, SPEC-KRILINXI-009), anotado en CLAUDE.md §13 sin causa confirmada, y con dos tests de SPEC-KRILINXI-016 que SPEC-KRILINXI-018 arregló: los dos eran **carreras**, un test que afirmaba algo asíncrono (una lectura de la base local, un pedido) con `getBy…` o después de esperar otra cosa.

Antes de la ola estética, que va a tocar casi todas las pantallas y sus tests, esta spec deja la suite confiable: reproduce y arregla el fallo de entregas con su causa a la vista, busca el mismo patrón en el resto de los tests y lo corrige, y deja una forma de comprobarlo (varias corridas completas seguidas). De paso corrige CLAUDE.md §13, que dice que arreglar `npm audit` exige Vitest 5 en los dos workspaces cuando el frontend ya lo usa.

## Criterios de aceptación

- [ ] El sistema tiene identificada la causa del fallo intermitente de "con boleta y pagando lo que falta…", con el mensaje de error capturado y explicado en la bitácora
- [ ] El sistema pasa ese test 30 veces seguidas en una corrida aislada y en la suite completa después del arreglo
- [ ] El sistema no tiene en los tests de pantalla afirmaciones con getBy… sobre algo que llega de forma asíncrona (base local, API, efectos) sin una espera antes (findBy… o waitFor sobre eso mismo)
- [ ] El sistema pasa la suite completa del frontend 10 veces seguidas sin ningún fallo, y la forma de repetirlo queda escrita para el equipo
- [ ] El sistema no sube los tiempos de espera globales de Testing Library ni de Vitest para tapar una carrera: si alguno se sube, la bitácora dice por qué no era una carrera
- [ ] CLAUDE.md queda sin la nota del test intermitente si se resolvió, y con la línea de Vitest 5 corregida (el frontend ya lo usa; falta el backend)

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-019', () => { ... })

Así un `grep SPEC-KRILINXI-019` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
