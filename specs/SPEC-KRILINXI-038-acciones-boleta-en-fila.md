---
id: SPEC-KRILINXI-038
name: Las acciones de la boleta en fila, con su símbolo
slug: acciones-boleta-en-fila
status: in-progress
owner: krilinxito
created: 2026-10-19
scope:
  - frontend/src/features/ordenes/components/DetalleOrden.tsx
  - frontend/src/features/entregas/components/AccionEntregar.tsx
  - frontend/src/features/mostrador/components/**
  - frontend/src/components/iconos.tsx
priority: medium
depends_on:
  - SPEC-KRILINXI-037
tests: []
---

## Descripción

En el detalle de una boleta, las acciones (Marcar como lista, Cobrar, Entregar la ropa, Anular) y los botones para volver son una columna de barras iguales, una debajo de otra. Pasan a una fila horizontal de botones compactos, cada uno con su ícono y su palabra, con los estilos de SPEC-KRILINXI-037: la acción que sigue resaltada, Cobrar y Entregar secundarias, Anular de peligro y apartada de las demás, y volver como navegación, fuera de la fila.

## Criterios de aceptación

- [ ] Las acciones de una boleta abierta van en una fila horizontal; en pantalla angosta pasan a dos columnas, nunca a una barra por renglón.
- [ ] Cada acción lleva un ícono que la representa y su palabra: avanzar (lavar / lista), cobrar, entregar y anular; los íconos que faltan se agregan a `components/iconos.tsx`, decorativos como todos.
- [ ] La acción que sigue según el estado (`avancesDesde`) es la principal; Cobrar y Entregar, secundarias; Anular, de peligro y separada de las demás.
- [ ] "Ver toda la ropa de…" y "Ver toda la ropa en el local" usan el estilo de navegación y van fuera de la fila de acciones.
- [ ] Cada botón sigue teniendo al menos 48px de alto para tocarlo con el dedo, y su nombre accesible es su palabra (los tests del Mostrador que los buscan por nombre siguen pasando).
- [ ] Una boleta cerrada sigue sin ofrecer acciones.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-038', () => { ... })

Así un `grep SPEC-KRILINXI-038` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
