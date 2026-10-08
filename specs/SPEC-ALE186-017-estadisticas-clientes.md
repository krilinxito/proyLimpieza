---
id: SPEC-ALE186-017
name: Atenciones de cada cliente por sucursal
slug: estadisticas-clientes
status: in-progress
owner: ale186
created: 2026-10-08
scope:
  - backend/src/models/estadisticas.model.ts
  - backend/src/controllers/estadisticas.controller.ts
  - backend/src/routes/estadisticas.routes.ts
  - backend/src/utils/**
  - backend/tests/**
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

Un cliente no pertenece a ninguna sucursal: es de todo el sistema y puede dejar ropa en cualquiera (CLAUDE.md §7). Pero el admin quiere ver dónde se lo atiende: cuántas veces en cada sucursal, cuánto gastó en cada una y cuándo fue su última visita. Esta spec agrega `GET /api/estadisticas/clientes`, solo ADMIN, con las mismas convenciones que las demás estadísticas (SPEC-ALE186-008 y -013): el período se lee con `leerPeriodo` de `utils/periodo.ts`, los días son de la hora de Bolivia, Postgres cuenta y suma, y los montos salen como texto. Las reglas: una atención es una orden no anulada que entró en el período (por su `fecha_entrada`), y pertenece a la sucursal de la orden, que no cambia nunca (la regla del registro, SPEC-ALE186-012). "Cuánto gastó" es lo que pagó de verdad: la suma de los pagos de esas órdenes, no su precio, para que una deuda sin cobrar no infle el número. Con años de historia puede haber miles de clientes, así que la lista va paginada como la auditoría, ordenada de quien más vino a quien menos. Este documento es el contrato del panel de clientes de la pantalla de estadísticas.

## Criterios de aceptación

- [ ] El sistema responde 200 a `GET /api/estadisticas/clientes` de un ADMIN con `{ desde, hasta, pagina, porPagina, total, clientes }`, donde cada cliente trae `cliente` (id, nombre, telefono), sus totales (`ordenes`, `gastado` como texto `"125.50"`, `ultimaVisita` como `YYYY-MM-DD HH:MM:SS` en hora de Bolivia) y `porSucursal`, una entrada por cada sucursal donde fue atendido con esos mismos tres datos y la sucursal (id, nombre).
- [ ] El sistema cuenta como atención cada orden no anulada cuya `fecha_entrada` cae en el período en hora de Bolivia: una orden de las 21:00 cuenta en ese día y no en el siguiente, y una anulada no cuenta (comprobado contra Postgres real).
- [ ] El sistema atribuye cada atención a la sucursal de su orden: un cliente que dejó ropa en dos sucursales sale con dos entradas en `porSucursal`, y sus totales son la suma de las dos (comprobado contra Postgres real).
- [ ] El sistema calcula `gastado` como la suma en Postgres de los pagos de esas órdenes, con los centavos exactos, y da `"0.00"` a una orden sin pagos: no usa el precio de la orden (comprobado contra Postgres real).
- [ ] El sistema filtra por `sucursal_id` contando solo las órdenes de esa sucursal, y por `cliente_id` devolviendo solo ese cliente; responde 400 con el formato de error uniforme si alguno no es un UUID o si el período no es válido, con la misma lectura del período que las demás estadísticas.
- [ ] El sistema ordena los clientes por cantidad de órdenes de mayor a menor (y por nombre cuando empatan), pagina con `pagina` y `por_pagina` (por defecto 50, máximo 200), responde 400 si no son enteros válidos, y `total` cuenta todos los clientes con atenciones, aunque la página pedida esté vacía.
- [ ] El sistema no incluye a clientes sin atenciones en el período.
- [ ] El sistema responde 403 a un EMPLEADO y 401 sin token.
- [ ] Los tests de model comprueban que todo el SQL va parametrizado, que el día se calcula con `horaDelNegocio`, y que la consulta del total usa los mismos filtros que la de la página.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-017', () => { ... })

Así un `grep SPEC-ALE186-017` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
