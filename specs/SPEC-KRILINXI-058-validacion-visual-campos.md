---
id: SPEC-KRILINXI-058
name: Indicador visual de campo correcto en Registrar ropa
slug: validacion-visual-campos
status: draft
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/src/components/CampoTexto.tsx
  - frontend/src/components/README.md
  - frontend/src/features/clientes/**
  - frontend/src/features/ordenes/**
priority: medium
depends_on:
  - SPEC-KRILINXI-057
tests: []
---

## Descripción

Al llenar los datos del cliente y de la boleta la persona no sabe si lo que escribió está bien hasta que intenta guardar. Se agrega un indicador visual de campo correcto (un ícono de visto con texto, nunca solo color) que aparece cuando el valor cumple su regla: por ejemplo el largo del carnet, el teléfono con su formato y el número de boleta. Las reglas son las que ya existen (validarCliente y la validación de la orden); esta spec no inventa reglas nuevas, solo las muestra mientras se escribe. Un campo vacío o que todavía no es válido no muestra error hasta que se sale del campo o se intenta guardar.

## Criterios de aceptación

- [ ] CampoTexto acepta un estado "correcto" y lo muestra con un ícono de visto y un texto accesible ("Correcto"), sin depender del color.
- [ ] El carnet, el teléfono, el nombre y el número de boleta muestran el indicador solo cuando cumplen la regla que ya aplica su validación, y lo quitan si dejan de cumplirla.
- [ ] El indicador usa colores del tema (éxito) en claro y oscuro, con su par de contraste medido en tema.test.ts si se agrega un color.
- [ ] No aparece ningún mensaje de error antes de que la persona salga del campo o intente guardar.
- [ ] Las reglas de validación no se duplican: el indicador y el guardado llaman a la misma función.
- [ ] Tests con el id de esta spec en el describe, sin jerga en pantalla, y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-058', () => { ... })

Así un `grep SPEC-KRILINXI-058` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
