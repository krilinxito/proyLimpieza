---
id: SPEC-KRILINXI-040
name: La API del historial de boletas
slug: historial-boletas-api
status: finished
owner: krilinxito
created: 2026-10-19
scope:
  - backend/src/routes/ordenes.routes.ts
  - backend/src/controllers/ordenes.controller.ts
  - backend/src/models/ordenes.model.ts
  - backend/tests/**
  - CLAUDE.md
priority: medium
depends_on: []
tests:
  - backend\tests\db\ordenesHistorial.db.test.ts
  - backend\tests\http\ordenesHistorial.test.ts
  - backend\tests\unit\ordenesHistorial.model.test.ts
---

## Descripción

El admin no tiene en la tablet la ropa de las sucursales (CLAUDE.md §7), así que para ver el historial completo de boletas necesita pedirlo a la API, como las estadísticas (§8). Hoy no hay ningún `GET` de órdenes. Esta spec agrega `GET /api/ordenes`, solo para el ADMIN: paginado como la auditoría (`utils/paginacion.ts`), con filtros por fechas de entrada (días de Bolivia, `utils/periodo.ts`), sucursal, estado, texto (número de boleta o cliente) y "con saldo pendiente", y con el saldo de cada boleta ya calculado en Postgres.

## Criterios de aceptación

- [ ] `GET /api/ordenes` responde solo al ADMIN; un EMPLEADO recibe 403, y sin sesión 401.
- [ ] Devuelve una página de boletas, de la más nueva a la más vieja, con: id, número de boleta, sucursal (id y nombre), cliente (id, nombre y teléfono), descripción, estado (ENTREGADO si tiene entrega), fecha de entrada, fecha estimada, precio total, precio final si se entregó, pagado y saldo (los montos como texto, como en las estadísticas).
- [ ] Filtra por `desde`/`hasta` (días de Bolivia, con `enElPeriodo` sobre `fecha_entrada`), `sucursal_id`, `estado`, `texto` (parte del número de boleta, del nombre del cliente o de su teléfono) y `con_saldo=true`; los filtros se combinan.
- [ ] Sin `desde`, trae todo el historial (no los últimos 30 días): es el historial completo.
- [ ] Pagina con `pagina` y `por_pagina` como la auditoría, con el total para saber cuántas páginas hay.
- [ ] Un filtro inválido (fecha mal escrita, estado que no existe) responde 400 con el formato de error de siempre.
- [ ] Tests con dobles para el controller y el SQL que arma el model, y tests contra Postgres real (`test:db`) para el saldo y los filtros combinados.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-040', () => { ... })

Así un `grep SPEC-KRILINXI-040` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
