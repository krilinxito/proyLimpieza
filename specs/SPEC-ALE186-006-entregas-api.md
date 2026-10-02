---
id: SPEC-ALE186-006
name: Registro de entregas
slug: entregas-api
status: in-progress
owner: ale186
created: 2026-10-02
scope:
  - backend/src/models/entregas.model.ts
  - backend/src/controllers/entregas.controller.ts
  - backend/src/routes/entregas.routes.ts
  - backend/src/routes/index.ts
  - backend/src/services/**
  - backend/src/utils/validacion.ts
  - backend/src/utils/ApiError.ts
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-ALE186-005
tests: []
---

## Descripción

Recibe los retiros de ropa que sube la app desde la cola de PowerSync (CLAUDE.md sección 6) y cierra el flujo del negocio: al registrarse la entrega, la orden pasa a ENTREGADO. Copia el patrón de pagos (SPEC-ALE186-005): id del dispositivo, reintento idempotente, quien entrega sale de la sesión y `sucursal_id` se copia de la orden en la misma sentencia que inserta, nunca del cuerpo.

Decisión del negocio: **la ropa se retira en la misma sucursal donde se dejó.** Por eso un EMPLEADO solo registra entregas de órdenes de su sucursal (que además son las únicas que su dispositivo tiene), y la entrega queda siempre con la sucursal de la orden. Un ADMIN puede registrarlas en cualquiera. Esta spec corrige CLAUDE.md sección 7, que todavía dice que un cliente puede "recoger en otra"; los mismos comentarios en `context/lavanderia_schema.sql` y `docker/powersync/sync-rules.yaml` no se tocan aquí, porque están atados a la spec abierta SPEC-KRILINXI-004 (PR #7) y su test de schema.

Decisiones a propósito, para revisar al aprobar:
- **ENTREGADO se pone en código, no por trigger.** La inserción de la entrega y el cambio de estado de la orden ocurren en una sola operación atómica (una sentencia o una transacción): o pasan las dos o ninguna. CLAUDE.md sección 6 pedía un trigger, pero el proyecto no tiene migraciones y agregarlo obliga a recrear las bases de todos; esta spec actualiza las secciones 6 y 13 para reflejarlo.
- **Se acepta la entrega desde RECIBIDO, EN_PROCESO o LISTO.** Si el cliente se llevó la ropa y nadie la había marcado lista, rechazarlo al sincronizar perdería el registro de algo que ya pasó. Solo se rechazan las órdenes ANULADAS y las que ya tienen entrega.
- **Una entrega no se edita ni se borra**, igual que un pago.
- **El PAGO_FINAL no va aquí**: se registra aparte por POST /api/pagos.

Quedan FUERA: las lecturas (las entregas bajan por el bucket `sucursal`), el cobro (SPEC-ALE186-005) y la auditoría de ENTREGAR (spec `auditoria-backend`).

## Criterios de aceptación

- [ ] El sistema registra la entrega y responde 201 con sus datos cuando recibe POST /api/entregas de un EMPLEADO o un ADMIN con un `id` UUID, `orden_id` y `tipo_retiro`, y opcionalmente `precio_final`, `retirado_por_nombre`, `retirado_por_carnet` y `fecha_entrega`.
- [ ] El sistema guarda la entrega con el `id` que mandó el dispositivo, y responde 400 VALIDACION cuando el `id` falta o no es un UUID.
- [ ] El sistema responde 2xx con la entrega ya existente, sin crear una segunda fila ni modificar la guardada, cuando recibe un POST con un `id` que ya existe (el reintento de una subida).
- [ ] El sistema toma `usuario_entrega_id` de la sesión y nunca del cuerpo.
- [ ] El sistema guarda como `sucursal_id` de la entrega la de la orden, para cualquier rol, e ignora el `sucursal_id` que venga en el cuerpo.
- [ ] El sistema responde 400 VALIDACION cuando `orden_id` falta, no es un UUID o no corresponde a una orden existente, y también cuando quien entrega es un EMPLEADO y la orden es de otra sucursal; un ADMIN puede registrar entregas de cualquier sucursal.
- [ ] El sistema deja la orden en estado ENTREGADO al registrar la entrega, en la misma operación atómica: si la entrega no se guarda, la orden no cambia de estado, y si la orden no cambia, la entrega no se guarda.
- [ ] El sistema acepta la entrega cuando la orden está en RECIBIDO, EN_PROCESO o LISTO.
- [ ] El sistema responde 409 ORDEN_ANULADA, con un mensaje que dice qué hacer, cuando la orden está ANULADA.
- [ ] El sistema responde 409 ORDEN_YA_ENTREGADA, con un mensaje que nombra la boleta, cuando la orden ya tiene una entrega registrada con otro `id`.
- [ ] El sistema responde 400 VALIDACION cuando `tipo_retiro` no es CON_BOLETA ni SIN_BOLETA, validando contra `utils/dominio.ts`.
- [ ] El sistema responde 400 VALIDACION cuando `tipo_retiro` es SIN_BOLETA y falta `retirado_por_nombre` o `retirado_por_carnet`, o alguno queda vacío después de quitar los espacios, con un mensaje que pide los dos datos de quien retira.
- [ ] El sistema responde 400 VALIDACION cuando `retirado_por_nombre` supera 150 caracteres o `retirado_por_carnet` supera 30.
- [ ] El sistema usa el `precio_final` que manda el dispositivo cuando viene, validado con el helper de dinero (centavos enteros, cero o mayor, dentro del máximo de la columna), y el `precio_total` de la orden cuando no viene; responde 400 VALIDACION si viene y no es un monto válido o es negativo.
- [ ] El sistema usa la `fecha_entrega` que manda el dispositivo cuando viene, y la hora del servidor cuando no viene; responde 400 VALIDACION si viene y no es una fecha ISO 8601 con zona válida.
- [ ] El sistema no expone PATCH ni DELETE sobre /api/entregas.
- [ ] El sistema responde 401 NO_AUTENTICADO en POST /api/entregas cuando la petición no trae un token válido.
- [ ] CLAUDE.md deja de decir que un cliente puede recoger en otra sucursal, y sus secciones 6 y 13 reflejan que el paso a ENTREGADO se hace en código y no por trigger.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-006', () => { ... })

Así un `grep SPEC-ALE186-006` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
