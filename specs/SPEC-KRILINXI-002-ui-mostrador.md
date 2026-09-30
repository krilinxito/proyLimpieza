---
id: SPEC-KRILINXI-002
name: Componentes del mostrador y dominio compartido
slug: ui-mostrador
status: finished
owner: krilinxito
created: 2026-09-30
scope:
  - frontend/src/components/**
  - frontend/src/lib/money.ts
  - frontend/src/lib/money.test.ts
  - frontend/src/lib/dominio.ts
  - frontend/src/lib/dominio.test.ts
priority: high
depends_on: []
tests:
  - frontend/src/components/Boton.test.tsx
  - frontend/src/components/CampoTexto.test.tsx
  - frontend/src/components/ModalConfirmacion.test.tsx
  - frontend/src/components/sinDatos.test.ts
  - frontend/src/lib/dominio.test.ts
  - frontend/src/lib/money.test.ts
---

## Descripción

Los cimientos que van a copiar todas las pantallas del negocio, antes de que exista la primera. Son dos cosas.

**Los componentes del mostrador** (CLAUDE.md §9): un botón grande, un campo con etiqueta visible y un lugar fijo para su mensaje de error, y un modal de confirmación que dice con palabras qué va a pasar. Hoy `Pantalla` es deliberadamente pobre y cada pantalla inventaría los suyos; fijarlos ahora evita tener tres botones distintos cuando lleguen clientes, órdenes y entregas.

**El dominio compartido del cliente**: `lib/money`, que trabaja en centavos enteros igual que `backend/src/utils/money.ts` (CLAUDE.md §6: el dinero nunca se toca con floats), y `lib/dominio`, con los valores válidos de los ENUM de Postgres como constantes tipadas, porque en SQLite llegan como texto y alguien tiene que saber cuáles son válidos. En ambos lados de la frontera se valida por separado: esto es la cortesía del cliente, no la garantía.

Queda FUERA: el aviso de conexión (necesita la cola de PowerSync, va con su propia spec), cualquier pantalla del negocio, y el símbolo de moneda si nadie lo confirma — el formato se limita a separador decimal y miles.

## Criterios de aceptación

- [ ] El sistema convierte a centavos enteros un monto escrito por el empleado cuando usa coma o punto como separador decimal ("12,50" y "12.50" dan 1250), y lo rechaza con un error cuando tiene más de dos decimales, letras o está vacío.
- [ ] El sistema suma montos en centavos sin error de punto flotante: sumar 10 y 20 centavos da exactamente 30.
- [ ] El sistema formatea centavos como texto para la pantalla con dos decimales y coma decimal (1250 se muestra "12,50" y 123456 se muestra "1.234,56").
- [ ] El sistema expone como constantes tipadas los valores válidos de estado de orden, tipo de retiro, tipo de pago, método de pago y rol, iguales a los ENUM de context/lavanderia_schema.sql, y un test falla si alguno de los dos cambia sin el otro.
- [ ] El sistema ofrece una función que dice si un texto cualquiera (el que llega de SQLite) es un valor válido de cada tipo, estrechando el tipo en TypeScript sin usar any ni casts.
- [ ] El sistema asocia a cada valor de estado, tipo y método un texto en el idioma del mostrador (EN_PROCESO se muestra "En proceso", no el código).
- [ ] El botón compartido se renderiza con texto grande y área de toque amplia, y mientras está ocupado se deshabilita para que un doble toque no dispare la acción dos veces.
- [ ] El campo compartido muestra su etiqueta siempre visible (no solo como placeholder) y, cuando recibe un error, lo muestra debajo y lo asocia al input para lectores de pantalla.
- [ ] El modal de confirmación muestra el mensaje que recibe diciendo qué va a pasar, ejecuta la acción solo cuando se toca el botón de confirmar, y no ejecuta nada cuando se cancela o se cierra.
- [ ] Ningún componente compartido llama a axios ni consulta datos: reciben todo por props.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-002', () => { ... })

Así un `grep SPEC-KRILINXI-002` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
