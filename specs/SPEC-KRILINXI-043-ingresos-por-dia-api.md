---
id: SPEC-KRILINXI-043
name: Lo cobrado por día, en la API
slug: ingresos-por-dia-api
status: in-progress
owner: krilinxito
created: 2026-10-19
scope:
  - backend/src/routes/estadisticas.routes.ts
  - backend/src/controllers/estadisticas.controller.ts
  - backend/src/models/estadisticas.model.ts
  - backend/tests/**
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

Las estadísticas dan lo cobrado en todo el período (`/api/estadisticas/ingresos`, SPEC-ALE186-008), pero no cómo fue día por día: con eso no se puede dibujar una tendencia. Esta spec agrega `GET /api/estadisticas/ingresos-por-dia`, solo para el ADMIN, con el mismo contrato de período y sucursal que las demás (`leerPeriodo`, días de Bolivia, `sucursal_id` opcional) y la misma forma que `/volumen` (SPEC-ALE186-013): todos los días del período, también los que quedan en cero, para que la línea no salte días.

## Criterios de aceptación

- [ ] `GET /api/estadisticas/ingresos-por-dia` responde solo al ADMIN (403 para un EMPLEADO, 401 sin sesión), como las demás estadísticas.
- [ ] Acepta `desde`, `hasta` y `sucursal_id` opcionales con las mismas reglas que las demás estadísticas; sin `desde`, los últimos 30 días.
- [ ] Devuelve un registro por cada día del período (en Bolivia), en orden, también los días sin cobros con total "0.00", con el total del día y el desglose por forma de pago.
- [ ] Los montos se suman en Postgres y salen como texto ("125.50"), como manda CLAUDE.md §8.
- [ ] El día de cada pago es el de Bolivia: un cobro de las 21:00 cae en ese día y no en el siguiente; el filtro usa `enElPeriodo` sobre `fecha_pago` y `horaDelNegocio` solo para agrupar (SPEC-ALE186-021).
- [ ] La suma de todos los días da lo mismo que `/ingresos` para el mismo período y sucursal.
- [ ] Tests con dobles para el controller y el SQL, y contra Postgres real (`test:db`) para los días en cero, el borde de las 21:00 y la coincidencia con `/ingresos`.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-043', () => { ... })

Así un `grep SPEC-KRILINXI-043` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
