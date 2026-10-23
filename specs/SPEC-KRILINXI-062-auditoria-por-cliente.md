---
id: SPEC-KRILINXI-062
name: 'Auditoría: acciones que involucran a un cliente'
slug: auditoria-por-cliente
status: in-progress
owner: krilinxito
created: 2026-10-23
scope:
  - backend/src/models/auditoria.model.ts
  - backend/src/controllers/auditoria.controller.ts
  - backend/tests/**
  - frontend/src/features/auditoria/**
priority: medium
depends_on: []
tests: []
---

## Descripción

En ¿Quién hizo qué? hay filtros por fechas, persona, acción, tabla, registro y sucursal, pero no por cliente. El admin necesita ver todo lo que pasó con un cliente: su alta, sus ediciones, y las órdenes, pagos y entregas que le corresponden. GET /api/auditoria acepta un filtro cliente_id que resuelve en Postgres (el registro tocado es del cliente, o la orden, el pago o la entrega pertenece a una orden de ese cliente), y la pantalla permite elegirlo.

## Criterios de aceptación

- [ ] GET /api/auditoria acepta cliente_id (UUID) y devuelve solo las filas cuyo registro es ese cliente o una orden, un pago o una entrega de una orden suya; un valor que no sea UUID responde 400.
- [ ] El filtro se resuelve en una sola consulta con índices, sin traer todo para filtrar en memoria, y hay un test contra la base real (test:db).
- [ ] Se combina con los demás filtros y con la paginación sin cambiar la forma de la respuesta ni la sucursal de cada acción (SPEC-ALE186-012).
- [ ] En "Buscar con más detalle" de /quien-hizo-que hay un campo para elegir el cliente (con el buscador vivo sobre la base local) y quitar el filtro.
- [ ] La descripción de cada registro dice a qué cliente se refiere cuando está disponible.
- [ ] Tests de backend y frontend con el id de esta spec y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-062', () => { ... })

Así un `grep SPEC-KRILINXI-062` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
