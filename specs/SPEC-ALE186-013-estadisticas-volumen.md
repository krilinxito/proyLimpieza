---
id: SPEC-ALE186-013
name: Volumen de órdenes y productividad
slug: estadisticas-volumen
status: finished
owner: ale186
created: 2026-10-07
scope:
  - backend/src/models/estadisticas.model.ts
  - backend/src/controllers/estadisticas.controller.ts
  - backend/src/routes/estadisticas.routes.ts
  - backend/src/utils/periodo.ts
  - backend/tests/**
  - CLAUDE.md
priority: medium
depends_on: []
tests:
  - backend\tests\db\estadisticasVolumen.db.test.ts
  - backend\tests\http\estadisticas.test.ts
  - backend\tests\unit\estadisticas.model.test.ts
---

## Descripción

Cierra las cuatro métricas del dashboard del admin (CLAUDE.md, sección 8). SPEC-ALE186-008 hizo ingresos, saldos y ropa sin recoger, y dejó afuera el volumen de órdenes por día y la productividad por empleado. Esta spec agrega `GET /api/estadisticas/volumen` y `GET /api/estadisticas/productividad`, solo ADMIN, con las mismas convenciones que las otras tres: el período (`desde`, `hasta`, `sucursal_id`) se lee con `leerPeriodo` de `utils/periodo.ts` (SPEC-ALE186-012), los días son de la hora de Bolivia, Postgres cuenta y suma, y los montos salen como texto. La productividad atribuye cada acción a quien la hizo y a la sucursal del registro, no a la sucursal donde la persona trabaja hoy: es la regla que fijó SPEC-ALE186-012 para la auditoría, y la misma que ya siguen las estadísticas de cobros. Así, un empleado que cambió de sucursal aparece con sus números en cada sucursal donde trabajó. Este documento es el contrato de los dos paneles nuevos de la pantalla de estadísticas.

## Criterios de aceptación

- [ ] El sistema responde 200 a `GET /api/estadisticas/volumen` de un ADMIN con `{ desde, hasta, total, anuladas, porDia }`, donde `porDia` tiene una entrada por cada día del período, incluidos los días sin órdenes (con 0), y cada entrada trae `fecha` (`YYYY-MM-DD`), `ordenes` y `anuladas`.
- [ ] El sistema cuenta cada orden en el día de su `fecha_entrada` en hora de Bolivia: una orden de las 21:00 de Bolivia cuenta en ese día y no en el siguiente (comprobado contra Postgres real).
- [ ] El sistema cuenta en `ordenes` todas las órdenes que entraron en el día, incluidas las anuladas, y además informa cuántas de ellas están anuladas, sin descontarlas.
- [ ] El sistema responde 200 a `GET /api/estadisticas/productividad` de un ADMIN con `{ desde, hasta, porEmpleado }`, donde cada fila trae el usuario (id, nombre_completo), la sucursal (id, nombre), `ordenesRecibidas`, `cobros` (cantidad), `montoCobrado` (texto, `"125.50"`) y `entregas`, ordenadas por sucursal y por nombre.
- [ ] El sistema atribuye cada orden, cobro y entrega a quien la registró y a la sucursal del registro: después de mover a un empleado de la sucursal A a la B, sus números del período salen en dos filas, una por sucursal, y no todos en B (comprobado contra Postgres real).
- [ ] El sistema incluye en productividad solo a quienes hicieron al menos una de las tres cosas en el período, y suma `montoCobrado` en Postgres (comprobado contra Postgres real con montos con centavos).
- [ ] El sistema filtra las dos métricas por `sucursal_id` cuando viene, y responde 400 con el formato de error uniforme si el período o la sucursal no son válidos, usando la misma lectura del período que las demás estadísticas.
- [ ] El sistema responde 403 a un EMPLEADO y 401 sin token en los dos endpoints.
- [ ] Los tests de model comprueban que todo el SQL va parametrizado y que el día se calcula con `horaDelNegocio`, no con la fecha guardada en UTC.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-013', () => { ... })

Así un `grep SPEC-ALE186-013` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
