---
id: SPEC-ALE186-008
name: 'Estadísticas de cobros: ingresos, saldos y ropa sin recoger'
slug: estadisticas-cobros
status: in-progress
owner: ale186
created: 2026-10-05
scope:
  - backend/src/models/estadisticas.model.ts
  - backend/src/controllers/estadisticas.controller.ts
  - backend/src/routes/estadisticas.routes.ts
  - backend/src/routes/index.ts
  - backend/src/utils/validacion.ts
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-ALE186-007
tests: []
---

## Descripción

Las tres primeras métricas del dashboard del admin (CLAUDE.md sección 8): cuánto se cobró, cuánto se debe y qué ropa sigue sin recoger. Es la única parte del sistema que se lee de la API y no de la base local: agrega en Postgres con `SUM` y `GROUP BY`, y reutiliza `vw_saldos` y `vw_pendientes_recoger` en vez de reescribir esas cuentas. Solo para ADMIN, verificado con `requireRol('ADMIN')`.

Este documento es también **el contrato de la pantalla `/estadisticas`** del frontend: con la spec aprobada se puede armar contra un doble sin esperar al código. Por eso la forma de cada respuesta va fijada abajo, campo por campo.

**Parámetros comunes** (query string, todos opcionales): `desde` y `hasta` como fecha `YYYY-MM-DD`, ambos incluidos; si faltan, son los últimos 30 días contando hoy. `sucursal_id` limita a una sucursal; sin él, son las tres.

**Respuestas.** Todos los montos van como texto decimal con dos decimales (`"125.50"`), sumados en Postgres, nunca como número de JavaScript. Cada respuesta repite `desde` y `hasta` ya resueltos, para que la pantalla diga qué período está mostrando.
- `GET /api/estadisticas/ingresos` → `{ desde, hasta, total, porSucursal: [{ sucursalId, sucursal, total, porMetodo: { EFECTIVO, QR, TARJETA, TRANSFERENCIA } }] }`. Suma los pagos con `fecha_pago` en el período. Los cuatro métodos aparecen siempre, en `"0.00"` si no hubo cobros con ese método.
- `GET /api/estadisticas/saldos` → `{ desde, hasta, total, cantidad, porAntiguedad: [{ tramo, cantidad, total }], ordenes: [{ ordenId, numeroBoleta, cliente, sucursalId, estado, montoACobrar, totalPagado, saldoPendiente, fechaEntrada, dias }] }`. Las órdenes con `saldo_pendiente > 0`, no anuladas, con `fecha_entrada` en el período; de la más antigua a la más nueva.
- `GET /api/estadisticas/sin-recoger` → `{ desde, hasta, cantidad, porAntiguedad: [{ tramo, cantidad }], ordenes: [{ ordenId, numeroBoleta, cliente, telefono, descripcion, sucursal, fechaEntrada, fechaEstimadaSalida, precioTotal, dias }] }`. Las órdenes de `vw_pendientes_recoger` con `fecha_entrada` en el período; de la más antigua a la más nueva.
- `tramo` es siempre uno de `HASTA_7_DIAS`, `DE_8_A_30_DIAS` o `MAS_DE_30_DIAS`, y los tres aparecen siempre, en ese orden, aunque tengan cantidad 0. `dias` son los días enteros desde `fecha_entrada` hasta hoy.

Decisiones a propósito, para revisar al aprobar:
- **Las fechas se interpretan en la hora de Bolivia (`America/La_Paz`).** El servidor guarda las horas en UTC, cuatro horas por delante: sin convertir, un cobro de las 21:00 de un lunes contaría como del martes, y el total del día no coincidiría con la caja. La zona va en una constante del model.
- **La antigüedad va en tramos fijos, no en días sueltos.** "Más de un mes" se entiende de un vistazo en un panel; un histograma de días, no. La lista de órdenes trae igual los `dias` exactos.
- **No se modifican las vistas.** `vw_pendientes_recoger` no tiene `sucursal_id` (solo el nombre) y `vw_saldos` no tiene fecha: las consultas las cruzan con `ordenes` por id. Cambiar una vista obligaría a todos a recrear su base con `down -v`.
- **Sin paginación.** Con tres sucursales, la ropa sin recoger o con deuda es del orden de cientos de filas; si crece, se agrega después sin romper el contrato.

Los totales se prueban contra Postgres real (`npm run test:db`, SPEC-ALE186-007): con dobles del pool, un test de agregación solo comprobaría que el SQL contiene `SUM`. Quedan FUERA: volumen de órdenes y productividad (spec `estadisticas-volumen`) y la pantalla del frontend.

## Criterios de aceptación

- [ ] El sistema responde 401 NO_AUTENTICADO en los tres endpoints sin un token válido, y 403 SIN_PERMISO cuando quien pide es un EMPLEADO.
- [ ] El sistema usa los últimos 30 días contando hoy (en hora de Bolivia) cuando faltan `desde` y `hasta`, y devuelve en cada respuesta el `desde` y el `hasta` que usó.
- [ ] El sistema responde 400 VALIDACION, con un mensaje que dice qué corregir, cuando `desde` o `hasta` no son una fecha `YYYY-MM-DD` válida, cuando `desde` es posterior a `hasta`, o cuando `sucursal_id` no es un UUID.
- [ ] El sistema interpreta `desde` y `hasta` como días completos en la hora de Bolivia: un pago registrado a las 21:00 del 6 de octubre en Bolivia (01:00 del 7 en UTC) cuenta en el 6 y no en el 7.
- [ ] GET /api/estadisticas/ingresos devuelve la suma de los pagos del período por sucursal y por método de pago, con los cuatro métodos siempre presentes, y un `total` igual a la suma de las sucursales.
- [ ] GET /api/estadisticas/ingresos con `sucursal_id` devuelve solo esa sucursal, y sin él devuelve todas las que tuvieron cobros en el período.
- [ ] Todos los montos de las respuestas van como texto decimal con dos decimales, calculados en Postgres, y un test contra la base real comprueba que sumas como 0.10 + 0.20 dan exactamente "0.30".
- [ ] GET /api/estadisticas/saldos devuelve las órdenes no anuladas con saldo pendiente mayor que cero y `fecha_entrada` en el período, usando `vw_saldos` (precio_final si hay entrega, precio_total si no), de la más antigua a la más nueva, con su `total` y `cantidad`.
- [ ] GET /api/estadisticas/sin-recoger devuelve las órdenes de `vw_pendientes_recoger` (sin entrega y no anuladas) con `fecha_entrada` en el período, filtrables por `sucursal_id`, de la más antigua a la más nueva.
- [ ] Las respuestas de saldos y sin-recoger traen `porAntiguedad` con los tramos HASTA_7_DIAS, DE_8_A_30_DIAS y MAS_DE_30_DIAS, siempre los tres y en ese orden, y cada orden trae sus `dias` desde `fecha_entrada`.
- [ ] Las agregaciones se prueban contra Postgres real con la suite `npm run test:db`, usando `tests/helpers/baseReal.ts`, y los controllers con dobles en `npm test`.
- [ ] La spec no modifica `context/lavanderia_schema.sql` ni las vistas, y CLAUDE.md queda al día con los endpoints de estadísticas y la zona horaria del negocio.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-008', () => { ... })

Así un `grep SPEC-ALE186-008` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
