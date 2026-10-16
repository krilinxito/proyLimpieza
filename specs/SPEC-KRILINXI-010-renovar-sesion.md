---
id: SPEC-KRILINXI-010
name: Renovar la sesión sin pedir la contraseña
slug: renovar-sesion
status: draft
owner: krilinxito
created: 2026-10-16
scope:
  - frontend/src/lib/powersync/**
  - frontend/src/features/auth/**
  - frontend/src/lib/api.ts
  - frontend/src/lib/api.test.ts
  - frontend/src/test/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

Desde SPEC-ALE186-025 el tokenPowerSync dura 12 h, y hoy `fetchCredentials` (frontend/src/lib/powersync/conector.ts) lo devuelve tal cual aunque esté vencido: pasadas 12 h de cada sesión la tablet deja de bajar datos hasta un login nuevo. Esta spec implementa los 4 pasos de CLAUDE.md §13 (Avisos para el frontend): renovar con POST /api/auth/renovar usando el token de la API, guardar el par nuevo, no cerrar la sesión por un tokenPowerSync vencido y pedir la contraseña solo ante un 401. Cierra además la deuda de §13 sobre salir con cambios sin subir: el aviso de salida lo dice.

## Criterios de aceptación

- [ ] fetchCredentials devuelve el tokenPowerSync guardado sin llamar a la API cuando su `exp` está a más de 2 minutos.
- [ ] fetchCredentials llama a POST /api/auth/renovar con el token de la API cuando el tokenPowerSync está vencido, vence en menos de 2 minutos o su `exp` no se puede leer, y devuelve el tokenPowerSync nuevo.
- [ ] Una renovación exitosa guarda en la sesión (localStorage) el token, el tokenPowerSync y el usuario nuevos, sin cerrar ni reabrir la base local.
- [ ] Si /renovar falla sin conexión o con 5xx, la sesión sigue abierta y la base local intacta; PowerSync vuelve a pedir credenciales más tarde.
- [ ] Si /renovar responde 401, la sesión se cierra como rechazada (la base no se borra si hay cambios sin subir) y la app vuelve a /ingresar.
- [ ] Varias llamadas simultáneas a fetchCredentials con el token por vencer producen una sola llamada a /renovar.
- [ ] Al confirmar Salir con N registros sin subir, el aviso dice en palabras del negocio que esos N registros se van a perder; con 0, el aviso es el de hoy.
- [ ] CLAUDE.md deja de listar la renovación del token como pendiente del frontend (§2 y §13).

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-010', () => { ... })

Así un `grep SPEC-KRILINXI-010` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
