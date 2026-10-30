---
id: SPEC-KRILINXI-069
name: Al entregar, el pago arranca con lo que falta
slug: entrega-pago-automatico
status: draft
owner: krilinxito
created: 2026-10-30
scope:
  - frontend/src/features/entregas/**
  - frontend/src/features/pagos/**
priority: medium
depends_on: []
tests: []
---

## Descripción

Al entregar una boleta con saldo pendiente, el empleado tiene que escribir cuánto paga el cliente, que casi siempre es todo lo que falta. Para acelerar el mostrador, el campo 'Cuánto paga ahora' arranca ya con el saldo (o con el nuevo saldo, si cambia el precio final) y el empleado solo lo cambia cuando el cliente paga otra cosa. La regla de SPEC-KRILINXI-056 no cambia: no se entrega con saldo pendiente. Va antes de reembolso-entrega porque las dos tocan el mismo formulario.

## Criterios de aceptación

- [ ] En el formulario de entrega de una boleta con saldo pendiente, 'Cuánto paga ahora' aparece ya escrito con el saldo completo, calculado en centavos enteros con lib/money y el saldo de features/pagos/saldo.ts, y se puede cambiar.
- [ ] Si el empleado cambia 'Precio final' (un recargo), 'Cuánto paga ahora' sigue al nuevo saldo mientras no lo haya tocado; si ya escribió un monto propio, se respeta y no se pisa.
- [ ] '¿Cómo paga?' sigue siendo una elección explícita y no se preselecciona; 'Entregar' queda habilitado en cuanto el monto cubre lo que falta y se elige la forma de pago.
- [ ] Borrar el monto o escribir uno menor que el saldo no se corrige solo: el formulario lo acepta como escrito y 'Entregar' sigue apagado hasta que cubra lo que falta (SPEC-KRILINXI-056).
- [ ] Con la boleta ya pagada por completo el formulario sigue sin pedir ningún monto ni forma de pago (SPEC-KRILINXI-046).
- [ ] Tests de frontend con el id de esta spec y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-069', () => { ... })

Así un `grep SPEC-KRILINXI-069` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
