---
id: SPEC-ALE186-005
name: Registro de cobros
slug: pagos-api
status: draft
owner: ale186
created: 2026-10-02
scope:
  - backend/src/models/pagos.model.ts
  - backend/src/controllers/pagos.controller.ts
  - backend/src/routes/pagos.routes.ts
  - backend/src/routes/index.ts
  - backend/src/utils/validacion.ts
  - backend/src/utils/ApiError.ts
  - backend/tests/**
priority: high
depends_on:
  - SPEC-ALE186-004
tests: []
---

## Descripción

Recibe los cobros que sube la app desde la cola de PowerSync (CLAUDE.md sección 6): el ADELANTO que se cobra al recibir la ropa y el PAGO_FINAL al entregarla. Copia el patrón de escritura de SPEC-ALE186-003 y 004: el id lo genera el dispositivo y un reintento de la misma subida no duplica ni falla. Junto con la spec de entregas, es el contrato que necesita `cola-subida` (frontend) para implementar `uploadData`.

Quien cobra sale siempre de la sesión. La sucursal del pago no viene del cuerpo ni de la sesión: se copia de la orden, porque `pagos.sucursal_id` existe solo para que las sync rules puedan filtrar sin JOIN (CLAUDE.md sección 7) y el backend es responsable de mantenerla igual a la de la orden. Un EMPLEADO solo cobra órdenes de su sucursal; un ADMIN, de cualquiera. `fecha_pago` se acepta del dispositivo por el mismo motivo que `fecha_entrada` en órdenes: un cobro hecho sin internet sube horas o días después.

Decisiones a propósito, para revisar al aprobar: un pago no se edita ni se borra (un cobro mal cargado se corrige con otro registro, no reescribiendo el que ya está); no se rechaza un pago que deja el saldo negativo, porque el dinero ya cambió de manos en el mostrador y rechazarlo al sincronizar perdería el registro; y un PAGO_FINAL no exige que la entrega ya exista, porque offline los dos se crean juntos y no hay que depender del orden en que suban.

Quedan FUERA: las lecturas (los pagos de la sucursal bajan por el bucket `sucursal` y el saldo se calcula en el cliente), las entregas (spec `entregas-api`) y la auditoría de COBRAR (spec `auditoria-backend`).

## Criterios de aceptación

- [ ] El sistema crea el pago y responde 201 con sus datos cuando recibe POST /api/pagos de un EMPLEADO o un ADMIN con un `id` UUID, `orden_id`, `monto`, `tipo` y `metodo`, y opcionalmente `fecha_pago`.
- [ ] El sistema guarda el pago con el `id` que mandó el dispositivo, y responde 400 VALIDACION cuando el `id` falta o no es un UUID.
- [ ] El sistema responde 2xx con el pago ya existente, sin crear una segunda fila ni modificar la guardada, cuando recibe un POST con un `id` que ya existe (el reintento de una subida).
- [ ] El sistema toma `usuario_id` de la sesión y nunca del cuerpo.
- [ ] El sistema guarda como `sucursal_id` del pago la de la orden, para cualquier rol, e ignora el `sucursal_id` que venga en el cuerpo.
- [ ] El sistema responde 400 VALIDACION cuando `orden_id` falta, no es un UUID o no corresponde a una orden existente, y también cuando quien cobra es un EMPLEADO y la orden es de otra sucursal; un ADMIN puede cobrar órdenes de cualquier sucursal.
- [ ] El sistema valida `monto` con el helper de dinero (centavos enteros, nunca float) y responde 400 VALIDACION cuando falta, no es un monto válido, es cero o es negativo.
- [ ] El sistema responde 400 VALIDACION cuando `tipo` no es ADELANTO ni PAGO_FINAL, o cuando `metodo` no es uno de EFECTIVO, QR, TARJETA o TRANSFERENCIA, validando contra `utils/dominio.ts`.
- [ ] El sistema usa la `fecha_pago` que manda el dispositivo cuando viene, y la hora del servidor cuando no viene; responde 400 VALIDACION si viene y no es una fecha ISO 8601 con zona válida.
- [ ] El sistema responde 409 ORDEN_ANULADA, con un mensaje que dice qué hacer, cuando la orden está ANULADA, y acepta pagos a órdenes en cualquier otro estado, incluida ENTREGADO.
- [ ] El sistema acepta un pago aunque la suma de pagos de la orden supere su precio, y acepta un PAGO_FINAL aunque la orden todavía no tenga entrega.
- [ ] El sistema no expone PATCH ni DELETE sobre /api/pagos.
- [ ] El sistema responde 401 NO_AUTENTICADO en POST /api/pagos cuando la petición no trae un token válido.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-005', () => { ... })

Así un `grep SPEC-ALE186-005` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
