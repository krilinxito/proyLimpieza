---
id: SPEC-ALE186-014
name: Una sucursal cerrada no recibe ropa nueva
slug: ordenes-sucursal-cerrada
status: finished
owner: ale186
created: 2026-10-08
scope:
  - backend/src/controllers/ordenes.controller.ts
  - backend/src/models/ordenes.model.ts
  - backend/src/models/auditoria.model.ts
  - backend/src/models/sucursales.model.ts
  - backend/src/utils/ApiError.ts
  - backend/src/utils/validacion.ts
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests:
  - backend\tests\db\ordenesSucursalCerrada.db.test.ts
  - backend\tests\http\ordenes.test.ts
  - backend\tests\unit\ordenes.model.test.ts
---

## Descripción

Cierra la deuda que dejó SPEC-ALE186-011 en CLAUDE.md §13: un EMPLEADO asignado a una sucursal cerrada todavía puede registrar ropa, porque su sucursal sale del token y `POST /api/ordenes` no mira `activa` para él. La regla que se decidió no es "rechazar todo": una tablet sin internet puede haber cargado ropa ANTES del cierre y subirla después, y eso es trabajo real con clientes esperando. Por eso se acepta la orden cuya `fecha_entrada` (la que fijó la tablet, que es la oficial) es anterior al cierre, y se rechaza la posterior. Como `sucursales` no guarda la fecha de cierre y agregar una columna exige `down -v`, el momento del cierre sale de la auditoría (SPEC-ALE186-010): es la fila EDITAR de esa sucursal cuyo `valores_anteriores` dice `activa: true`. Un rechazo responde 409, que la tablet ya aparta en "para corregir" (SPEC-KRILINXI-007), así que nada se pierde en silencio. Además, como red de seguridad contra relojes de tablet mal puestos, se rechaza toda `fecha_entrada` que esté en el futuro respecto de la hora del servidor, con un margen de unos minutos. Esta spec no toca el frontend: la corrección del reloj en la tablet (desfase contra la hora del servidor) es de otra spec y de otro dev.

## Criterios de aceptación

- [ ] El sistema acepta con 201 la orden de un EMPLEADO de una sucursal cerrada cuando su `fecha_entrada` es anterior al momento del cierre, aunque llegue al servidor después (comprobado contra Postgres real).
- [ ] El sistema rechaza con 409 `SUCURSAL_CERRADA`, con un mensaje en español que dice qué hacer, la orden de un EMPLEADO de una sucursal cerrada cuya `fecha_entrada` es igual o posterior al cierre, o que no trae `fecha_entrada`, y no guarda nada ni anota auditoría.
- [ ] El sistema toma el momento del cierre de la auditoría: la fila EDITAR más reciente de esa sucursal con `valores_anteriores.activa = true`. Si la sucursal se cerró, se reabrió y se volvió a cerrar, cuenta el último cierre.
- [ ] El sistema vuelve a aceptar cualquier orden de esa sucursal cuando se la reabre con `activa: true`.
- [ ] El sistema responde 200 al reintento de una orden que ya estaba guardada (mismo id y mismos datos) aunque la sucursal se haya cerrado después: un reintento no es una orden nueva.
- [ ] El sistema decide aceptar o rechazar en la misma sentencia que inserta la orden, no con una consulta previa, para que un cierre simultáneo no deje pasar una orden posterior.
- [ ] El sistema rechaza con 400 `FECHA_FUTURA` una `fecha_entrada` posterior a la hora del servidor más 5 minutos de margen, para cualquier rol, con un mensaje que pide revisar la hora de la tablet.
- [ ] El sistema acepta una `fecha_entrada` hasta 5 minutos en el futuro, para no rechazar tablets con una diferencia de reloj mínima.
- [ ] Los tests de model comprueban que la condición del cierre y la de la fecha futura van como parámetros dentro del INSERT.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-014', () => { ... })

Así un `grep SPEC-ALE186-014` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
