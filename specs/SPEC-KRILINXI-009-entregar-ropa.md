---
id: SPEC-KRILINXI-009
name: 'Entregar la ropa: con o sin boleta, y el pago final'
slug: entregar-ropa
status: draft
owner: krilinxito
created: 2026-10-03
scope:
  - frontend/src/features/entregas/**
  - frontend/src/features/pagos/**
  - frontend/src/features/ordenes/**
  - frontend/src/pages/rutas.tsx
  - frontend/src/test/**
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-008
tests: []
---

## Descripción

El segundo momento del negocio (CLAUDE.md §3): el cliente vuelve a la misma sucursal y se lleva su ropa. `/entregar` (hoy un hueco) pasa a ser la pantalla de entrega, solo para EMPLEADO, y reusa la búsqueda, el detalle y el estado calculado de SPEC-KRILINXI-008.

Se escribe en la base local y sube por la cola: la entrega como `POST /api/entregas` (SPEC-ALE186-006) y el pago final, después, como `POST /api/pagos`. **El frontend no toca el estado de la orden**: el servidor la pasa a ENTREGADO en la misma sentencia que inserta la entrega, y el `PATCH` a ENTREGADO está prohibido (responde 409). En la tablet, la orden figura Entregado desde el momento en que existe su entrega, gracias al estado calculado de la 008.

Reglas que se repiten del backend, como cortesía para que el empleado se entere al momento:
- Sin boleta, nombre (hasta 150) y carnet (hasta 30) de quien retira son obligatorios.
- El precio final puede diferir del precio total (recargo por almacenamiento, descuento), es cero o más, y si no se cambia se guarda igual al precio total.
- Una orden anulada o ya entregada no se entrega.

Decisión de negocio (krilinxito, 2026-10-03): **se puede entregar con saldo pendiente, pidiendo confirmación** que diga cuánto queda debiendo. Cubre al cliente de confianza sin que pase por descuido.

Queda FUERA: deshacer una entrega (no se puede: es irreversible, como en el backend) y entregar en otra sucursal (la ropa se retira donde se dejó).

## Criterios de aceptación

- [ ] El sistema encuentra la orden por número de boleta o por teléfono del cliente en la base local, y solo deja entregar órdenes abiertas de la sucursal del empleado que todavía no tengan entrega; para una anulada o ya entregada dice por qué no se puede.
- [ ] El sistema pregunta si el cliente trae la boleta y, si no la trae, no guarda sin nombre y carnet de quien retira, con hasta 150 y 30 caracteres respectivamente, mostrando un mensaje que dice qué falta.
- [ ] El precio final viene cargado con el precio total de la orden, se puede cambiar a cualquier monto de cero o más con hasta dos decimales, y el saldo mostrado se recalcula con ese precio usando calcularSaldo.
- [ ] El sistema registra opcionalmente un pago PAGO_FINAL con método (de METODOS_PAGO), mayor que cero y no mayor que el saldo con el precio final.
- [ ] Antes de guardar, el sistema pide confirmación con ModalConfirmacion ("¿Entregar la ropa de la boleta 001234? Esta acción no se puede deshacer."); si después del pago queda saldo, la confirmación dice cuánto queda debiendo el cliente en Bs.
- [ ] Al confirmar, el sistema guarda la entrega en la base local con id de crypto.randomUUID(), la sucursal de la orden, el usuario de la sesión, tipo_retiro, quien retira, precio_final como texto decimal y fecha_entrega en ISO 8601 con zona, y después el pago; la cola queda con un PUT de entregas seguido del PUT de pagos.
- [ ] El sistema nunca escribe en la columna estado de la orden al entregar, y un test comprueba que la cola no tiene ningún PATCH de ordenes.
- [ ] Después de entregar, la orden figura como Entregado en la lista y el detalle de SPEC-KRILINXI-008, y no se puede volver a entregar ni avanzar.
- [ ] Al terminar, el sistema muestra un resumen con la boleta, quién retiró, el precio final, lo cobrado y lo que queda debiendo, en Bs.
- [ ] /entregar solo la abre un EMPLEADO; un ADMIN ve el aviso de solo empleados.
- [ ] Todo funciona sin conexión y sin ninguna petición a la API, y sinJerga() no encuentra palabras del sistema en ningún paso.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-009', () => { ... })

Así un `grep SPEC-KRILINXI-009` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
