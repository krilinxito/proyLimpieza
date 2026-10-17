---
id: SPEC-KRILINXI-014
name: Editar los datos de un cliente
slug: editar-cliente
status: in-progress
owner: krilinxito
created: 2026-10-16
scope:
  - frontend/src/features/clientes/**
  - frontend/src/test/**
priority: medium
depends_on: []
tests: []
---

## Descripción

El backend acepta `PATCH /api/clientes/:id` (SPEC-ALE186-003) y el conector ya lo manda (SPEC-KRILINXI-007), pero ninguna pantalla lo usa: si el empleado se equivoca al dar de alta un nombre o un teléfono, no hay cómo arreglarlo.

Esta spec agrega 'Cambiar datos' en la tarjeta del cliente de `/clientes`. La edición se escribe en la base local y sube por la cola, como el alta. El teléfono se normaliza con la misma regla que el backend y se valida contra los clientes locales para no repetir uno ajeno.

## Criterios de aceptación

- [ ] El sistema muestra un botón 'Cambiar datos' en la tarjeta de un cliente encontrado en /clientes
- [ ] El sistema abre un formulario con el nombre y el teléfono actuales del cliente cuando se elige 'Cambiar datos'
- [ ] El sistema guarda el cambio en la base local y lo encola como PATCH con solo los campos que cambiaron, también sin internet
- [ ] El sistema muestra los datos nuevos en la tarjeta apenas se guarda, sin esperar al servidor
- [ ] El sistema no guarda ni encola nada cuando el empleado guarda sin haber cambiado ningún dato
- [ ] El sistema rechaza en el dispositivo un teléfono que ya tiene otro cliente, con un mensaje que dice de quién es y qué hacer
- [ ] El sistema normaliza el teléfono editado con la misma regla que el alta antes de guardarlo y de compararlo
- [ ] El sistema no muestra palabras del sistema (sinJerga) en el formulario de edición

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-014', () => { ... })

Así un `grep SPEC-KRILINXI-014` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
