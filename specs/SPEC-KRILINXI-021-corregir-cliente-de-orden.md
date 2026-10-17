---
id: SPEC-KRILINXI-021
name: Corregir la ropa de un cliente que ya existía
slug: corregir-cliente-de-orden
status: draft
owner: krilinxito
created: 2026-10-17
scope:
  - frontend/src/features/pendientes/**
  - frontend/src/features/clientes/**
  - frontend/src/test/**
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-019
tests: []
---

## Descripción

El caso que SPEC-KRILINXI-013 dejó abierto (CLAUDE.md §13, "Corregir lo que el servidor rechazó: lo que queda"). Dos tablets dan de alta al mismo cliente sin internet; cuando suben, el servidor acepta una y rechaza la otra con TELEFONO_DUPLICADO, y la ropa registrada para ese cliente también vuelve rechazada ("Ese cliente no está registrado"). Hoy la única salida es descartar todo y volver a registrar.

Esta spec deja resolverlo desde `/para-corregir`: para el cliente rechazado ofrece "Es el mismo cliente", que usa el cliente que ya existe con ese teléfono, y vuelve a mandar su ropa (y lo que dependa de ella) apuntando a ese cliente. Todo en la base local, sin internet, con el patrón de la 013 (mismo id de la orden, escritura y limpieza de `para_corregir` en una sola transacción).

## Criterios de aceptación

- [ ] El sistema muestra "Es el mismo cliente" en un cliente rechazado por teléfono repetido cuando la tablet ya tiene al cliente con ese teléfono, con su nombre para que el empleado lo compare
- [ ] El sistema, al confirmar, descarta el cliente rechazado y vuelve a escribir cada orden rechazada que le apuntaba con el cliente que ya existe, conservando el id de cada orden
- [ ] El sistema vuelve a encolar los cobros rechazados de esas órdenes tal cual, después de sus órdenes, para que suban en ese orden
- [ ] El sistema hace todo eso en una sola transacción de la base local, también sin internet: o queda todo corregido y fuera de la lista, o no cambia nada
- [ ] El sistema muestra la orden con el cliente correcto en "Ropa en el local" apenas se corrige
- [ ] El sistema no ofrece "Es el mismo cliente" si la tablet no conoce a ningún cliente con ese teléfono, y entonces deja corregir el teléfono como hasta ahora
- [ ] El sistema no muestra palabras del sistema (sinJerga) en los pasos nuevos

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-021', () => { ... })

Así un `grep SPEC-KRILINXI-021` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
