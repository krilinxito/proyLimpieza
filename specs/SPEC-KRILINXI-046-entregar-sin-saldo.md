---
id: SPEC-KRILINXI-046
name: Entregar una boleta ya pagada sin pedir montos
slug: entregar-sin-saldo
status: in-progress
owner: krilinxito
created: 2026-10-21
scope:
  - frontend/src/features/entregas/**
  - frontend/src/features/mostrador/components/EntregarEnMostrador.test.tsx
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

Al entregar una boleta que ya está totalmente pagada, el formulario de entrega (SPEC-KRILINXI-009) sigue pidiendo "Precio final" y "Cuánto paga ahora" (y, si se escribe un pago, "¿Cómo paga?"), aunque el mismo formulario ya diga "No falta pagar nada." Es confuso: da a entender que hay que escribir un monto cuando no hay nada que cobrar.

Esta spec hace que, si lo pagado ya cubre el precio de la boleta, el formulario no muestre ningún campo de dinero: en su lugar dice en palabras "Ya está todo pagado", y entregar es solo elegir si el cliente trae la boleta (y, si no la trae, nombre y carnet de quien retira) y tocar Entregar. La entrega se guarda con el precio de la boleta como precio final y sin pago final. Si falta pagar algo, aunque sea poco, el formulario es el de siempre.

Consecuencia aceptada: en una boleta ya pagada no se puede cargar un recargo al entregar (por ejemplo, por almacenamiento), porque el precio final deja de ser editable. Un recargo se tendría que cobrar de otra forma, antes de que quede pagada.

## Criterios de aceptación

- [ ] Si lo pagado de la boleta cubre su precio (saldo cero), el formulario de entrega no muestra los campos "Precio final" ni "Cuánto paga ahora", ni la pregunta "¿Cómo paga?".
- [ ] En su lugar muestra un aviso de éxito que dice "Ya está todo pagado", en palabras del mostrador y sin jerga del sistema.
- [ ] Se puede entregar sin escribir ningún monto: alcanza con elegir si el cliente trae la boleta (y, si no la trae, nombre y carnet de quien retira) y tocar Entregar.
- [ ] La entrega de una boleta ya pagada se guarda con el precio de la boleta como precio final y sin ningún pago final: no se encola ningún pago nuevo.
- [ ] La confirmación de entregar una boleta ya pagada no menciona deuda: no dice que el cliente queda debiendo nada.
- [ ] Una boleta pagada en partes (un adelanto y otro pago) cuya suma cubre el precio cuenta como pagada; una boleta de precio cero también.
- [ ] Si falta pagar algo, aunque sea un centavo, el formulario es el de siempre: "Precio final", la línea que dice cuánto falta pagar, "Cuánto paga ahora" y "¿Cómo paga?" al escribir un pago.
- [ ] Los tests de entrega con saldo pendiente (SPEC-KRILINXI-009) siguen pasando sin cambios, y hay tests nuevos para la boleta ya pagada: el formulario sin campos de dinero, el aviso, la entrega sin pago y la confirmación sin deuda.
- [ ] Sigue habiendo una sola acción principal a la vista en el formulario (Entregar), como en SPEC-KRILINXI-037.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-046', () => { ... })

Así un `grep SPEC-KRILINXI-046` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
