---
id: SPEC-ALE186-021
name: Los filtros por día de Bolivia usan los índices de fecha
slug: consultas-por-fecha
status: approved
owner: ale186
created: 2026-10-10
scope:
  - backend/src/utils/periodo.ts
  - backend/src/models/estadisticas.model.ts
  - backend/src/models/auditoria.model.ts
  - backend/tests/**
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

La revisión del backend del 2026-10-09 encontró que todos los filtros por período (`desde`/`hasta`, días de Bolivia) de las estadísticas y de la auditoría tienen la forma `horaDelNegocio(columna)::date BETWEEN $desde AND $hasta`: aplican una función sobre la columna en cada fila, así que Postgres no puede usar los índices de fecha que ya existen (`idx_pagos_fecha`, `idx_ordenes_fecha_entrada`, `idx_auditoria_fecha`, `idx_entregas_fecha`) y recorre la tabla entera (comprobado con `EXPLAIN`). Con pocos datos no se nota; con años de órdenes y una auditoría que crece con cada escritura y cada login, cada consulta del dashboard se vuelve más lenta. Esta spec da vuelta la comparación: convierte UNA vez los límites del período —el inicio del día `desde` y el inicio del día siguiente a `hasta`, en la hora de Bolivia— al reloj en que se guardan las columnas, y compara la columna tal cual (`col >= inicio AND col < fin`). Un helper en `utils/periodo.ts` arma ese fragmento, para que no se repita en cada model. Es un cambio interno: ninguna respuesta cambia, ni en los bordes del día. Las expresiones de día que van en el SELECT o el GROUP BY (los `dias` de antigüedad, la agrupación por día del volumen, las horas formateadas) se quedan como están, porque no estorban al índice. En la productividad, donde el filtro está sobre una unión de órdenes, cobros y entregas, el filtro tiene que llegar a cada parte de la unión para que cada una use su índice.

## Criterios de aceptación

- [ ] El sistema filtra por período en `/api/estadisticas/ingresos`, `/saldos`, `/sin-recoger`, `/volumen`, `/productividad`, `/clientes` y en `GET /api/auditoria` comparando la columna de fecha sin aplicarle ninguna función, contra límites calculados una sola vez a partir de `desde`, `hasta` y la zona del negocio, con un helper compartido de `utils/periodo.ts`.
- [ ] El sistema incluye en el período un registro de las 23:59:59 de Bolivia del día `hasta` y excluye uno de las 00:00:00 de Bolivia del día siguiente, y lo mismo en el borde de `desde` (comprobado contra Postgres real con registros a las 00:00 UTC, que en Bolivia son el día anterior).
- [ ] El sistema devuelve exactamente las mismas respuestas que antes de esta spec en todos los endpoints afectados: los tests existentes de SPEC-ALE186-008, -012, -013 y -017 contra la base real pasan sin cambios.
- [ ] El plan de Postgres (`EXPLAIN`) de la consulta de ingresos y de la de auditoría con un período filtra por el índice de la columna de fecha y no hace un recorrido secuencial de la tabla, comprobado contra Postgres real con la tabla con datos suficientes y `enable_seqscan` desactivado para la prueba si hace falta para que el planificador lo elija.
- [ ] El sistema aplica el filtro de período de la productividad dentro de cada parte de la unión (órdenes, cobros, entregas), no sobre el resultado unido.
- [ ] Ningún filtro de período de los models sigue usando la forma `horaDelNegocio(...)::date BETWEEN`, comprobado por un test unitario sobre el SQL que arma cada model.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-021', () => { ... })

Así un `grep SPEC-ALE186-021` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
