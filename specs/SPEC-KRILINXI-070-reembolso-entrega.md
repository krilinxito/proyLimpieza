---
id: SPEC-KRILINXI-070
name: Entregar sin cobrar (reembolso)
slug: reembolso-entrega
status: draft
owner: krilinxito
created: 2026-10-30
scope:
  - backend/migraciones/008_reembolso_entrega.sql
  - backend/src/models/entregas.model.ts
  - backend/src/controllers/entregas.controller.ts
  - backend/src/models/ordenes.model.ts
  - backend/tests/**
  - docker/powersync/sync-rules.yaml
  - frontend/src/lib/powersync/**
  - frontend/src/features/entregas/**
  - frontend/src/features/ordenes/estado.ts
  - frontend/src/features/ordenes/retiro.ts
  - frontend/src/features/auditoria/describir.ts
priority: high
depends_on:
  - SPEC-KRILINXI-067
  - SPEC-KRILINXI-069
tests: []
---

## Descripción

Hoy la ropa solo sale con la boleta pagada por completo (SPEC-KRILINXI-056). Si el cliente se enoja o hay un problema y no paga, no hay cómo entregar sin cobrar. Esta spec agrega 'Entregar sin cobrar': la ropa sale, la boleta pasa a REEMBOLSADO (en rojo), con un motivo obligatorio y la persona que lo hizo. La entrega reembolsada guarda como precio_final lo ya cobrado, así el saldo queda en 0 sin tocar vw_saldos, y lo que no se cobró se ve comparando con el precio_total. Devolver dinero ya cobrado (un pago de vuelta) queda en una spec aparte, reembolso-devolucion, porque cambia el modelo de pagos. Reserva la migración 008. Pregunta abierta para la aprobación: si un EMPLEADO puede hacerlo solo o necesita al ADMIN; el borrador deja que cualquiera lo registre y que quede marcado para el admin.

## Criterios de aceptación

- [ ] La migración 008 agrega a entregas la columna motivo_reembolso (TEXT, NULL) y una restricción que no deja un motivo vacío; una entrega con motivo_reembolso es una entrega reembolsada.
- [ ] POST /api/entregas acepta un reembolso (motivo_reembolso presente): responde 400 si el motivo falta, está en blanco o pasa de 300 caracteres, y no exige saldo cero (no responde SALDO_PENDIENTE).
- [ ] La entrega reembolsada guarda precio_final igual a lo ya cobrado de la orden y deja la orden en REEMBOLSADO, todo en la misma sentencia que inserta la entrega; un rechazo no escribe nada y un reintento con el mismo id no duplica ni cambia nada.
- [ ] Quien registró el reembolso sale siempre de la sesión (usuario_entrega_id), nunca del cuerpo, y la fila de auditoría (conAuditoria) lo marca como reembolso con su motivo.
- [ ] Una orden anulada, ya entregada o ya reembolsada rechaza el reembolso con 409, como rechaza una entrega.
- [ ] En la boleta con saldo pendiente hay un botón secundario 'Entregar sin cobrar' (la acción principal a la vista sigue siendo una sola); pide el motivo y una confirmación que dice cuánto no se va a cobrar y que no se puede deshacer.
- [ ] El reembolso se escribe en la base local de la tablet en una sola transacción, y sin sincronizar la boleta ya figura REEMBOLSADO (estadoEfectivo mira motivo_reembolso); el schema local y las sync rules bajan la columna nueva.
- [ ] Una boleta REEMBOLSADA se ve con la insignia roja, el detalle muestra el motivo, quién lo hizo y cuándo, y el historial del admin la puede filtrar por 'Reembolsada'; GET /api/ordenes trae el reembolso de cada boleta.
- [ ] ¿Quién hizo qué? describe la acción en palabras ('Entregó sin cobrar') con su motivo.
- [ ] Los ingresos y los saldos de las estadísticas no cuentan lo no cobrado, y un test contra la base real comprueba que un reembolso deja el saldo en 0 y no suma ningún ingreso.
- [ ] Tests de backend y frontend con el id de esta spec, CLAUDE.md actualizado y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-070', () => { ... })

Así un `grep SPEC-KRILINXI-070` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
