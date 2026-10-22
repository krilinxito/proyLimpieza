---
id: SPEC-KRILINXI-048
name: Registrar ropa más corto y sin pérdida de lo escrito
slug: registrar-ropa-corto
status: in-progress
owner: krilinxito
created: 2026-10-22
scope:
  - frontend/src/features/ordenes/components/FormularioRopa.tsx
  - frontend/src/features/ordenes/components/ElegirMetodo.tsx
  - frontend/src/features/mostrador/components/PantallaMostrador.tsx
  - frontend/src/features/mostrador/components/RegistrarEnMostrador.tsx
  - frontend/src/features/ordenes/components/atajosDeFecha.ts
  - frontend/src/features/ordenes/components/FormularioRopa.test.tsx
priority: high
depends_on:
  - SPEC-KRILINXI-047
tests: []
---

## Descripción

La crítica de diseño (/impeccable critique, sobre el código) marcó Registrar ropa como el punto más débil del mostrador: es la tarea que más se repite en el día, y FormularioRopa junta el cliente, cuatro campos de la ropa y el bloque del adelanto en un solo scroll, con un único Guardar al final. Son entre 6 y 8 campos a la vista, contra el 'pocos campos por pantalla' de CLAUDE.md §9. Además la fecha usa el selector nativo del navegador, incómodo en una tablet para quien tiene poca práctica, y 'Volver al mostrador sin guardar' descarta lo escrito sin preguntar.

Esta spec acorta el formulario sin cambiar lo que se guarda: el adelanto (importe y forma de pago) aparece solo cuando se elige 'Deja adelanto', la fecha estimada ofrece atajos ('Mañana', 'En 3 días', 'En una semana') antes del selector, y salir con algo escrito pide confirmación diciendo qué se pierde. No cambia el modelo de datos, la validación (sigue en api/ordenesLocal) ni la transacción de alta + orden + adelanto de SPEC-KRILINXI-034.

## Criterios de aceptación

- [ ] El formulario de Registrar ropa no muestra el campo de importe ni la forma de pago del adelanto hasta que la persona elige 'Deja adelanto'; al elegirlo aparecen, y al volver a 'No deja adelanto' se ocultan y no se guarda ningún pago.
- [ ] Guardar sin adelanto sigue creando solo el cliente (si es nuevo) y la orden, y guardar con adelanto sigue creando también el pago, todo en la misma transacción de SPEC-KRILINXI-034.
- [ ] 'Para cuándo estará lista' ofrece los atajos 'Mañana', 'En 3 días' y 'En una semana' como botones, calculados con el día de Bolivia (lib/diaDelNegocio), y tocar uno llena la fecha; el selector de fecha sigue disponible para otra fecha.
- [ ] Los atajos de fecha son un solo módulo puro con su test: dado el día de hoy devuelve las tres fechas, también al cruzar fin de mes y de año.
- [ ] Si hay algo escrito en el formulario (boleta, ropa, precio, fecha o adelanto, o un cliente elegido a mano), tocar 'Volver al mostrador sin guardar' abre un ModalConfirmacion que dice que se pierde lo escrito; confirmar vuelve, cancelar deja el formulario como estaba.
- [ ] Si el formulario está vacío, 'Volver al mostrador sin guardar' vuelve directo, sin confirmación.
- [ ] Hay una sola acción principal a la vista en el formulario (Guardar), el texto del adelanto y de los atajos no usa jerga del sistema (lo comprueba sinJerga), y los botones nuevos usan los componentes de components/ con el tema.
- [ ] La suite completa sigue en verde y el DESIGN.md no necesita cambios (no hay colores nuevos).

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-048', () => { ... })

Así un `grep SPEC-KRILINXI-048` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
