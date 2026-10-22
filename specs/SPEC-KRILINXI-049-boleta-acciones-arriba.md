---
id: SPEC-KRILINXI-049
name: Acciones de la boleta justo debajo de lo que falta pagar
slug: boleta-acciones-arriba
status: finished
owner: krilinxito
created: 2026-10-22
scope:
  - frontend/src/features/ordenes/components/DetalleOrden.tsx
  - frontend/src/features/ordenes/components/DetalleOrden.test.tsx
  - frontend/src/features/entregas/components/AccionEntregar.tsx
  - frontend/src/features/mostrador/components/PantallaMostrador.test.tsx
priority: medium
depends_on:
  - SPEC-KRILINXI-047
tests:
  - frontend\src\features\mostrador\components\PantallaMostrador.test.tsx
---

## Descripción

En el detalle de una boleta, DetalleOrden apila tres tarjetas (La ropa, Cuentas, Pagos) antes del grupo 'Qué hacer con esta ropa'. En una tablet las acciones pueden quedar fuera de la pantalla, y la fila llega a cinco botones (próximo avance, otro avance, Cobrar, Entregar y Anular), por encima de las cuatro opciones que una persona sostiene a la vez. La crítica de diseño lo marcó como problema de jerarquía: lo que se viene a hacer está al final, y lo irreversible (Anular) comparte fila con lo cotidiano.

Esta spec reordena sin cambiar qué se puede hacer ni cuándo: el grupo de acciones sube justo debajo de 'Falta pagar' (dentro o inmediatamente después de la tarjeta Cuentas), y Anular sale de la fila y queda aparte, al final de la boleta, con su confirmación de siempre. La regla de SPEC-KRILINXI-037 (una sola acción principal a la vista) y los íconos de SPEC-KRILINXI-038 se mantienen.

## Criterios de aceptación

- [ ] En el detalle de una boleta abierta, el grupo 'Qué hacer con esta ropa' aparece en el DOM antes que las tarjetas de Pagos y justo después de 'Falta pagar'.
- [ ] La fila de acciones tiene como mucho cuatro botones (próximo avance, otro avance si lo hay, Cobrar si hay saldo, y Entregar cuando corresponde): Anular ya no está en ella.
- [ ] Anular queda en su propio lugar, al final del detalle y separado de la fila, con el botón de variante peligro e ícono, y sigue abriendo el ModalConfirmacion '¿Anular la boleta …? Esta acción no se puede deshacer.'.
- [ ] Una boleta ENTREGADA o ANULADA sigue sin mostrar ninguna acción (solo el aviso), y una con saldo cero no muestra Cobrar.
- [ ] Sigue habiendo una sola acción principal a la vista, la misma que antes (el próximo avance o, si no queda, entregar), comprobado con accionesPrincipales() de test/jerarquia.
- [ ] Cobrar y Entregar abren su formulario en el mismo lugar que antes y ocupan la fila entera, sin romper el layout en pantalla angosta (conAnchoDePantalla).
- [ ] La suite completa sigue en verde y no cambia ningún texto que hoy lean los tests de entregar y cobrar, salvo el orden.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-049', () => { ... })

Así un `grep SPEC-KRILINXI-049` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
