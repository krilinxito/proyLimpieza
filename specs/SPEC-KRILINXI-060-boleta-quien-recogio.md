---
id: SPEC-KRILINXI-060
name: Mostrar quién retiró la ropa cuando fue sin boleta
slug: boleta-quien-recogio
status: draft
owner: krilinxito
created: 2026-10-23
scope:
  - backend/src/models/ordenes.model.ts
  - backend/src/controllers/ordenes.controller.ts
  - backend/tests/**
  - frontend/src/features/historial/**
  - frontend/src/features/mostrador/**
priority: medium
depends_on:
  - SPEC-KRILINXI-056
tests: []
---

## Descripción

Una entrega sin boleta exige nombre y carnet de quien retira, pero ese dato no se ve al mirar la boleta en el historial. Se muestra, en el detalle de la boleta del historial y del Mostrador, quién la retiró (nombre y carnet) cuando la entrega fue SIN_BOLETA, y "Retiró con la boleta" cuando fue CON_BOLETA. Para el admin el dato viene de GET /api/ordenes, que hoy no lo trae; en la tablet ya está en la base local.

## Criterios de aceptación

- [ ] GET /api/ordenes trae por cada orden entregada el tipo de entrega y, si fue sin boleta, el nombre y el carnet de quien retiró; la forma de la respuesta queda documentada en la spec y en CLAUDE.md.
- [ ] El detalle de una boleta entregada en el historial (admin y quien atiende) muestra "Retiró: nombre, carnet" si fue sin boleta, y "Retiró con la boleta" si fue con boleta.
- [ ] En el Mostrador el detalle de una boleta entregada muestra lo mismo, leído de la base local y sin internet.
- [ ] Una boleta no entregada no muestra nada de retiro.
- [ ] Tests de backend (con dobles y contra la base real) y de frontend con el id de esta spec, sin jerga, y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-060', () => { ... })

Así un `grep SPEC-KRILINXI-060` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
