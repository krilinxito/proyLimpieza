---
id: SPEC-KRILINXI-033
name: Una sola pantalla de mostrador
slug: mostrador-unificado
status: in-progress
owner: krilinxito
created: 2026-10-18
scope:
  - frontend/src/features/mostrador/**
  - frontend/src/features/ordenes/**
  - frontend/src/features/entregas/**
  - frontend/src/pages/rutas.tsx
  - frontend/src/pages/rutas.test.ts
  - frontend/src/test/arquitectura.test.ts
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-032
tests: []
---

## Descripción

Ropa en el local, Cobrar y Entregar ropa ya son casi la misma pantalla (`PantallaRopa`, con `accionesExtra` para entregar), pero el menú las muestra como tres tareas, y quien atiende tiene que elegir antes de saber qué necesita el cliente.

Esta spec las junta en una pantalla, **Mostrador** (/mostrador), con una sola entrada: el buscador vivo de SPEC-KRILINXI-032. Se elige un cliente o una boleta y aparece la ficha del cliente con su ropa de esta sucursal; cada boleta tiene a mano lo que se puede hacer según su estado: avanzar, cobrar, entregar o anular. Un solo camino (buscar, elegir, actuar), como pide CLAUDE.md §9. Sin buscar nada, muestra la ropa en el local, como hoy. /ropa, /cobrar y /entregar redirigen a /mostrador para no romper enlaces guardados. Registrar ropa se suma en la spec siguiente. La pantalla usa la sucursal de trabajo (`useSucursalDeTrabajo`, SPEC-KRILINXI-029), así que el ADMIN que atiende también la usa.

## Criterios de aceptación

- [ ] El menú y el Inicio muestran "Mostrador" en lugar de Ropa en el local, Cobrar y Entregar ropa; para el ADMIN, solo mientras atiende en una sucursal.
- [ ] /ropa, /cobrar y /entregar llevan a /mostrador.
- [ ] Sin buscar nada, la pantalla lista la ropa en el local de la sucursal de trabajo, como hoy Ropa en el local.
- [ ] Al elegir un cliente en el buscador se ve su ficha con su ropa de esta sucursal (las abiertas primero); al elegir una boleta se abre esa boleta dentro de la ficha de su cliente.
- [ ] Cada boleta muestra solo las acciones que su estado permite (avanzar, cobrar, entregar, anular), con las mismas reglas y confirmaciones de hoy (`estadoEfectivo`, avances del backend, entrega con o sin boleta, saldo pendiente).
- [ ] Después de cobrar o entregar, la ficha se actualiza sola y dice qué se hizo, sin volver al buscador.
- [ ] Todo funciona sin internet; ninguna lectura va a la API (lo vigilan los tests de arquitectura que ya existen).
- [ ] Los tests del recorrido de cobrar y entregar (SPEC-KRILINXI-008 y 009) se reescriben contra /mostrador y cubren lo mismo que hoy.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-033', () => { ... })

Así un `grep SPEC-KRILINXI-033` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
