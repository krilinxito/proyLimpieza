---
id: SPEC-KRILINXI-062
spec: specs/SPEC-KRILINXI-062-auditoria-por-cliente.md
explica: []
---

# SPEC-KRILINXI-062 — Auditoría: acciones que involucran a un cliente

## Qué se construyó

En ¿Quién hizo qué? el admin puede elegir un cliente y ver todo lo que pasó con él: su alta, sus ediciones y lo que se hizo con su ropa, sus cobros y sus entregas. Cada línea dice de qué cliente es.

## Cómo funciona, paso a paso

Un caso: el admin elige a Rosa Quispe.

1. En "Buscar con más detalle", `ElegirCliente` (`features/auditoria/components/FiltroAuditoria.tsx`) usa el buscador vivo sobre la base local (`useClientes().buscarVivo`): los clientes bajan enteros a la tablet del admin (CLAUDE.md §7). Al elegir, el filtro guarda `{ id, nombre }`.
2. `parametrosAuditoria` (`filtro.ts`) manda `cliente_id` a la API.
3. `getAuditoria` (`backend/src/controllers/auditoria.controller.ts`) lo valida con `leerId` (si no es UUID, 400) y se lo pasa al model.
4. `consultar` (`backend/src/models/auditoria.model.ts`) arma `ids_del_cliente`: el id del cliente más los de sus órdenes, pagos y entregas. Cada subconsulta entra por un índice que ya existía (`idx_ordenes_cliente`, `idx_pagos_orden`, el único de `entregas.orden_id`), y la auditoría se cruza con ese conjunto por `registro_id`, que tiene índice desde SPEC-ALE186-020. La misma cláusula filtra la página y el total, y deja intactos los demás filtros, la paginación y la sucursal de cada acción.
5. De vuelta, `sobreQue` (`describir.ts`) dice "de Rosa Quispe" para ropa, cobros y entregas: el nombre sale del filtro, porque el admin no tiene esos registros en su tablet.

## Dónde encaja en la arquitectura

El filtrado vive en Postgres, no en el navegador (CLAUDE.md §8): traer toda la auditoría para filtrar en memoria no escala. El controller solo valida; el SQL está en el model. El buscador de clientes es de la base local (§6).

## Decisiones y por qué

- **Un CTE de ids y `IN`** en vez de varias `OR` con subconsultas: con el filtro en `NULL` el conjunto ni se consulta, y con un cliente el planificador cruza por el índice de `registro_id`.
- **No se mira `tabla_afectada`** al cruzar: los ids son UUID, únicos entre tablas.
- **La respuesta no cambió de forma.** Poner el cliente en cada registro (para nombrarlo sin filtro) habría agregado un campo y un cruce por fila; eso queda para la spec `auditoria-resumen` que ya está anotada como deuda (CLAUDE.md §13).
- **Los parámetros de la consulta**: el cliente es `$10`, y el límite y el salto de la página pasaron a `$11` y `$12`.
- No se probó el uso de índices con un `EXPLAIN` en los tests: con tablas chicas Postgres elige un barrido secuencial y el test sería inestable. Lo que sí se prueba es la forma del SQL (que cruce por `registro_id` con el CTE) y el resultado contra la base real.

## Los tests

Backend: model con dobles (parámetros y forma del SQL), http (400 y paso de filtro) y `test:db` con un cliente con orden, pago y entrega contra otro cliente que no debe aparecer, combinado con otros filtros y páginas. Los helpers `crearPago` y `crearEntrega` de `baseReal.ts` ahora devuelven el id, para poder anotarles una fila de auditoría con `anotarAuditoria`. Frontend: `PantallaAuditoria.test.tsx` y `describir.test.ts`, con `elegirEnBuscador`.

## Si mañana tenés que tocar esto

Un registro nuevo que dependa de un cliente (otra tabla) tiene que sumar su subconsulta a `ids_del_cliente`.
