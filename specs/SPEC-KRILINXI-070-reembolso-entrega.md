---
id: SPEC-KRILINXI-070
name: Entregar sin cobrar (reembolso)
slug: reembolso-entrega
status: finished
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
  - backend/src/models/auditoria.model.ts
priority: high
depends_on:
  - SPEC-KRILINXI-067
  - SPEC-KRILINXI-069
tests:
  - backend\tests\db\entregas.db.test.ts
  - backend\tests\db\reembolso.db.test.ts
  - backend\tests\http\entregas.test.ts
  - backend\tests\unit\entregas.model.test.ts
  - backend\tests\unit\ordenesHistorial.model.test.ts
  - frontend\src\features\auditoria\components\PantallaAuditoria.test.tsx
  - frontend\src\features\auditoria\describir.test.ts
  - frontend\src\features\entregas\api\entregasLocal.test.ts
  - frontend\src\features\historial\components\PantallaHistorial.test.tsx
  - frontend\src\features\mostrador\components\EntregarEnMostrador.test.tsx
  - frontend\src\features\mostrador\components\PantallaMostrador.test.tsx
  - frontend\src\features\ordenes\estado.test.ts
  - frontend\src\features\pendientes\api\corregirLocal.test.ts
  - frontend\src\lib\powersync\schema.test.ts
---

## Descripción

Hoy la ropa solo sale con la boleta pagada por completo (SPEC-KRILINXI-056). Si el cliente se enoja o hay un problema y no paga, no hay cómo entregar sin cobrar. Esta spec agrega 'Entregar sin cobrar': la ropa sale, la boleta pasa a REEMBOLSADO (en rojo), con un motivo obligatorio y la persona que lo hizo. La entrega reembolsada guarda como precio_final lo ya cobrado, así el saldo queda en 0 sin tocar vw_saldos, y lo que no se cobró se ve comparando con el precio_total. Devolver dinero ya cobrado (un pago de vuelta) queda en una spec aparte, reembolso-devolucion, porque cambia el modelo de pagos. Reserva la migración 008 (cualquier migración de otra spec va con el 009 o más). **Decidido:** cualquiera (EMPLEADO o ADMIN) lo registra solo, sin pedir permiso, y la auditoría lo deja marcado para que el admin lo revise (`auditoria.revision = 'reembolso'`, el filtro «Solo lo que hay que revisar» de SPEC-KRILINXI-018). **Decidido:** un reembolso no admite cargos al entregar; guarda como precio_final lo ya cobrado y solo en ese caso se salta la comprobación de precio de SPEC-KRILINXI-068.

## Criterios de aceptación

- [ ] La migración 008 agrega a entregas la columna motivo_reembolso (TEXT, NULL) y una restricción que no deja un motivo vacío; una entrega con motivo_reembolso es una entrega reembolsada.
- [ ] POST /api/entregas acepta un reembolso (motivo_reembolso presente): responde 400 si el motivo falta, está en blanco o pasa de 300 caracteres, y no exige saldo cero (no responde SALDO_PENDIENTE).
- [ ] La entrega reembolsada guarda precio_final igual a lo ya cobrado de la orden y deja la orden en REEMBOLSADO, todo en la misma sentencia que inserta la entrega; un rechazo no escribe nada y un reintento con el mismo id no duplica ni cambia nada.
- [ ] Quien registró el reembolso sale siempre de la sesión (usuario_entrega_id), nunca del cuerpo, y la fila de auditoría (conAuditoria) lo marca como reembolso con su motivo y con `revision = 'reembolso'` (nuevo valor de `Revision`), así el ADMIN lo ve con `GET /api/auditoria?revisar=true`; lo puede registrar un EMPLEADO de la sucursal de la orden o un ADMIN, sin aprobación previa.
- [ ] Un reembolso no admite cargos: si el cuerpo trae renglones de cargo junto con `motivo_reembolso`, responde 400 sin escribir nada. La comprobación de SPEC-KRILINXI-068 (409 si `precio_final` no es `precio_total` + cargos) se salta únicamente cuando viene `motivo_reembolso`; la entrega común la sigue aplicando igual, y un test lo comprueba.
- [ ] Una orden anulada, ya entregada o ya reembolsada rechaza el reembolso con 409, como rechaza una entrega.
- [ ] En la boleta con saldo pendiente hay un botón secundario 'Entregar sin cobrar' (la acción principal a la vista sigue siendo una sola); pide el motivo y una confirmación que dice cuánto no se va a cobrar y que no se puede deshacer.
- [ ] El reembolso se escribe en la base local de la tablet en una sola transacción, y sin sincronizar la boleta ya figura REEMBOLSADO (estadoEfectivo mira motivo_reembolso); el schema local y las sync rules bajan la columna nueva.
- [ ] Una boleta REEMBOLSADA se ve con la insignia roja, el detalle muestra el motivo, quién lo hizo y cuándo, y el historial del admin la puede filtrar por 'Reembolsada'; GET /api/ordenes trae el reembolso de cada boleta.
- [ ] ¿Quién hizo qué? describe la acción en palabras ('Entregó sin cobrar') con su motivo, y `TEXTO_REVISION` (`features/auditoria/describir.ts`) dice en palabras por qué está marcada: 'Para revisar: se entregó la ropa sin cobrar.'
- [ ] Los ingresos y los saldos de las estadísticas no cuentan lo no cobrado, y un test contra la base real comprueba que un reembolso deja el saldo en 0 y no suma ningún ingreso.
- [ ] Tests de backend y frontend con el id de esta spec, CLAUDE.md actualizado y suite completa en verde.

## Notas

- **Coordinación con SPEC-KRILINXI-071 (ale186):** las dos tocan `ordenes.model.ts` y `backend/tests/**`, y la 071 deja al admin editar boletas REEMBOLSADAS, que solo existen cuando esta spec está hecha. Esta va primero; la 071 debería ramificar de un `dev` que ya la tenga (y, al mover una boleta de sucursal, cuidar cualquier columna nueva que esta spec agregue a `entregas`). Avisar a Ale antes de mergear.
- **Aviso de SPEC-KRILINXI-068 (2026-10-30):** el precio final ya no se escribe libre: el servidor lo calcula como `precio_total` + los renglones de cargo (`orden_items` con `momento = 'ENTREGA'`) y rechaza con 409 una entrega cuyo `precio_final` no coincida. El reembolso es la excepción a ese cálculo (guarda como `precio_final` lo ya cobrado), así que esta spec tiene que decir si una entrega sin cobrar admite cargos y cómo se salta esa comprobación sin abrirla para las entregas comunes. Además, desde la 068 ya no se puede entregar por menos del total: rebajar el precio solo es posible con un reembolso.

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-070', () => { ... })

Así un `grep SPEC-KRILINXI-070` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
