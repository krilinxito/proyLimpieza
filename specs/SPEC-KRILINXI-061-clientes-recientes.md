---
id: SPEC-KRILINXI-061
name: 'Clientes: los últimos 20 y sus boletas'
slug: clientes-recientes
status: finished
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/src/features/clientes/**
  - frontend/src/features/mostrador/**
  - frontend/src/features/historial/**
  - frontend/src/pages/rutas.tsx
priority: medium
depends_on: []
tests:
  - frontend\src\features\clientes\components\ClientesRecientes.test.tsx
  - frontend\src\test\arquitectura.test.ts
---

## Descripción

La pantalla Clientes hoy espera a que se busque. Se cambia para que, sin buscar nada, muestre los últimos 20 clientes atendidos y luego pagine en orden de su última boleta (el más reciente primero). Además, desde Clientes hay una página para ver todas las boletas de un cliente. Todo sale de la base local, también sin internet, y paginado según CLAUDE.md §9.

## Criterios de aceptación

- [ ] Sin texto en el buscador, /clientes lista 20 clientes ordenados por la fecha de su última boleta, del más reciente al más viejo, y pagina el resto con la barra de páginas de siempre.
- [ ] Un cliente sin ninguna boleta queda al final, ordenado por su alta; el orden es estable y lo calcula una sola consulta en features/clientes/api.
- [ ] Desde la tarjeta de cada cliente hay un enlace "Ver sus boletas" que abre una página con todas sus boletas de la sucursal de trabajo, paginada, con el estado, el saldo y su fecha, y cada una lleva al Mostrador.
- [ ] El buscador vivo (SPEC-KRILINXI-032) sigue funcionando y, al escribir, reemplaza la lista de recientes.
- [ ] Todo funciona sin internet y sin pedirle nada a la API.
- [ ] Tests con el id de esta spec, sin jerga, y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-061', () => { ... })

Así un `grep SPEC-KRILINXI-061` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
