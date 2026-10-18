---
id: SPEC-KRILINXI-028
name: El ADMIN baja la ropa de la sucursal donde atiende
slug: sync-admin-atiende
status: finished
owner: krilinxito
created: 2026-10-18
scope:
  - docker/powersync/sync-rules.yaml
  - backend/tests/unit/syncRules.test.ts
  - CLAUDE.md
priority: high
depends_on: []
tests:
  - backend/tests/unit/syncRules.test.ts
---

## Descripción

A veces el dueño atiende el mostrador. El backend ya lo permite: órdenes, cobros, entregas y clientes aceptan a cualquier rol ("el admin también atiende", en las rutas), y el ADMIN indica la sucursal de la orden en el cuerpo. Lo que lo frena es la tablet: las sync rules no le bajan nada de ropa, porque el bucket `sucursal` sale de la sucursal de la cuenta y un ADMIN no tiene (CLAUDE.md §7). Sin esos datos, su tablet no puede validar una boleta, ni mostrar la ropa del local, ni cobrar o entregar sin internet.

Esta spec agrega un bucket para el ADMIN que atiende: la tablet dice en qué sucursal está atendiendo con un parámetro de cliente (`request.parameters() ->> 'sucursal_id'`), y el bucket le entrega las `ordenes`, `entregas` y `pagos` de esa sucursal, igual que a un empleado. El token de PowerSync no lleva el rol (su contenido va vacío), así que la consulta de parámetros comprueba en `usuarios` que quien lo pide sea un ADMIN activo. El parámetro lo controla la tablet, así que la autorización no puede depender de él: la da la condición `id = request.user_id()` sobre la fila del ADMIN. Con esa condición, PowerSync no considera la consulta peligrosa (se comprobó con su validador: sin ella, avisa "Potentially dangerous query"). Y es seguro porque un ADMIN ya puede ver todas las sucursales (por la API y el panel): el parámetro solo elige cuál baja. Un EMPLEADO no gana nada mandándolo: el bucket nuevo no existe para él. La parte de la tablet (elegir la sucursal, reconectar con el parámetro) es la spec de frontend que depende de esta.

## Criterios de aceptación

- [ ] Un bucket nuevo en `sync-rules.yaml` entrega `ordenes`, `entregas` y `pagos` de la sucursal que manda la tablet en el parámetro de cliente `sucursal_id`, solo si quien lo pide es un ADMIN activo (`rol = 'ADMIN' AND activo = true` en la misma consulta de parámetros).
- [ ] Un EMPLEADO que manda el parámetro con otra sucursal no recibe nada de ella: sigue recibiendo solo la de su cuenta, por el bucket `sucursal`.
- [ ] Un ADMIN sin el parámetro no baja ninguna orden, pago ni entrega: sigue sin descargar el histórico (CLAUDE.md §7).
- [ ] El bucket NO lleva `accept_potentially_dangerous_queries`: PowerSync no marca la consulta porque está atada a `request.user_id()`, y el flag solo apagaría la advertencia si alguien rompiera esa condición. Un comentario lo explica y un test vigila que el flag no aparezca y que la consulta siga atada a quien pide. (Corregido al implementar: el borrador pedía el flag.)
- [ ] El archivo pasa el validador de PowerSync 1.25 (`SqlSyncRules.validate`), y `syncRules.test.ts` comprueba las condiciones de la consulta del bucket nuevo (ADMIN, activo, parámetro `sucursal_id`).
- [ ] `CLAUDE.md` (§7 y "Avisos para el frontend") documenta el bucket, el nombre del parámetro y que después del pull hay que reiniciar PowerSync.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-028', () => { ... })

Así un `grep SPEC-KRILINXI-028` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
