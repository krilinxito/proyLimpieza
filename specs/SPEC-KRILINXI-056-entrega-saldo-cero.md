---
id: SPEC-KRILINXI-056
name: Entregar solo con la boleta pagada por completo
slug: entrega-saldo-cero
status: in-progress
owner: krilinxito
created: 2026-10-23
scope:
  - backend/src/**
  - backend/tests/**
  - frontend/src/features/entregas/**
  - frontend/src/features/mostrador/**
  - frontend/src/features/pagos/**
priority: medium
depends_on:
  - SPEC-KRILINXI-055
tests: []
---

## Descripción

Hoy se puede entregar la ropa con saldo pendiente y queda una deuda. El negocio quiere que se cancele todo antes de entregar. El formulario de entrega obliga a cobrar lo que falta (pago final por el saldo completo) y el servidor rechaza una entrega cuyo saldo sea mayor que cero, porque lo que valida el cliente es cortesía y lo que valida el servidor es la garantía (CLAUDE.md §6). El recargo al entregar se cobra en el mismo acto. Riesgo conocido: una entrega cargada sin internet con saldo puede ser rechazada al subir y pasar a Para corregir.

## Criterios de aceptación

- [ ] POST /api/entregas responde 409 con un código propio y un mensaje en palabras cuando, tras sumar el pago final que viene en el mismo pedido, el saldo de la orden sería mayor que cero; la entrega y el paso a ENTREGADO no se escriben.
- [ ] Esa comprobación va dentro de la misma sentencia que escribe, sin condición de carrera con un pago concurrente, y hay un test contra la base real (test:db).
- [ ] El formulario de entrega ya no ofrece entregar con saldo pendiente: el pago final es por el saldo completo y el botón se habilita solo cuando queda en cero.
- [ ] Con la boleta ya pagada el formulario sigue sin pedir montos (SPEC-KRILINXI-046), y se puede cargar un precio final mayor si se cobra la diferencia en el mismo acto.
- [ ] La confirmación ya no habla de deuda ("cuánto queda debiendo") porque no puede quedar.
- [ ] Una entrega rechazada por esta regla al subir desde la cola aparece en Para corregir con el mensaje del servidor, y se puede corregir desde ahí.
- [ ] CLAUDE.md (§2 y §3) refleja la regla, y la suite completa sigue en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-056', () => { ... })

Así un `grep SPEC-KRILINXI-056` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
