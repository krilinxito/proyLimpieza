---
id: SPEC-KRILINXI-035
name: Un Inicio que dice qué hay que hacer hoy
slug: inicio-hoy
status: draft
owner: krilinxito
created: 2026-10-18
scope:
  - frontend/src/pages/Inicio.tsx
  - frontend/src/pages/Inicio.test.tsx
  - frontend/src/features/mostrador/**
  - frontend/src/features/ordenes/api/**
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-033
tests: []
---

## Descripción

El Inicio repite el menú en tarjetas (`destinosDelMenu`) y no aporta nada que el menú no tenga. Pasa a ser "Hoy en la sucursal": listas cortas de lo que pide atención, cada una con su número, y cada fila lleva directo a esa boleta en el Mostrador.

Para quien atiende (EMPLEADO, o ADMIN atendiendo): la ropa LISTA esperando que la recojan, la ropa atrasada (pasó su fecha estimada de salida y no está lista), lo cobrado hoy (total y por forma de pago, sumado con `lib/money`) y los registros para corregir. Todo sale de la base local, también sin internet, y "hoy" es el día de Bolivia según `horaOficial()`. Para el ADMIN que no atiende: los cuatro indicadores del tablero de estadísticas (online, con el aviso "necesitan conexión" de siempre) y "Atender en una sucursal" (SPEC-KRILINXI-029). Las tarjetas que repetían el menú desaparecen; el menú sigue igual.

## Criterios de aceptación

- [ ] El Inicio de quien atiende muestra "Lista para recoger" con las órdenes en LISTO de la sucursal de trabajo, las más viejas primero, y su número.
- [ ] Muestra "Atrasada" con las órdenes RECIBIDO o EN_PROCESO cuya fecha estimada de salida ya pasó en el día de Bolivia.
- [ ] Muestra "Cobrado hoy": el total y el desglose por forma de pago de los pagos de hoy en la sucursal, sumados en centavos con `lib/money`.
- [ ] Si hay registros para corregir, lo dice y lleva a "Registros para corregir".
- [ ] Tocar una orden de cualquier lista abre esa boleta en el Mostrador.
- [ ] Una lista vacía lo dice en palabras ("No hay ropa atrasada"), nunca queda en blanco.
- [ ] Todo lo de quien atiende funciona sin internet; ninguna lectura va a la API.
- [ ] El Inicio del ADMIN que no atiende muestra los cuatro indicadores del tablero y "Atender en una sucursal"; sin internet, dice que los números necesitan conexión.
- [ ] El Inicio ya no repite las tareas del menú.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-035', () => { ... })

Así un `grep SPEC-KRILINXI-035` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
