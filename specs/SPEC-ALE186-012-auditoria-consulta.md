---
id: SPEC-ALE186-012
name: Consulta de la auditoría para el admin
slug: auditoria-consulta
status: draft
owner: ale186
created: 2026-10-06
scope:
  - backend/src/models/auditoria.model.ts
  - backend/src/controllers/auditoria.controller.ts
  - backend/src/routes/auditoria.routes.ts
  - backend/src/routes/index.ts
  - backend/src/controllers/estadisticas.controller.ts
  - backend/src/utils/**
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

Desde SPEC-ALE186-010 cada escritura deja su fila en `auditoria`, y desde SPEC-ALE186-011 también las sucursales, pero nadie puede leerla: la tabla no se sincroniza a ningún dispositivo (CLAUDE.md, sección 7) y no hay endpoint. Esta spec agrega `GET /api/auditoria`, solo para ADMIN, que es el contrato de la futura pantalla "Quién hizo qué" del admin. Como el dashboard (sección 8), se lee online y filtra en Postgres. Sigue las convenciones de `/api/estadisticas` (SPEC-ALE186-008): `desde` y `hasta` son días de la hora de Bolivia, por defecto los últimos 30, y las fechas salen como texto en hora de Bolivia. La lectura del período, que hoy vive dentro de `estadisticas.controller.ts`, se mueve a un sitio compartido para que los dos la usen sin copiarla. La tabla `auditoria` no tiene `sucursal_id`: el filtro por sucursal significa "lo que hizo el personal asignado a esa sucursal" y sale de `usuarios.sucursal_id` de quien hizo la acción, así que las acciones de un ADMIN no aparecen con ese filtro. Es una consulta de solo lectura: no escribe nada, ni siquiera en la auditoría.

## Criterios de aceptación

- [ ] El sistema responde 200 a `GET /api/auditoria` de un ADMIN con `{ desde, hasta, pagina, por_pagina, total, registros }`, donde cada registro trae id, fecha (texto `YYYY-MM-DD HH:MM:SS` en hora de Bolivia), accion, tabla_afectada, registro_id, valores_anteriores y el usuario que lo hizo (id, nombre_completo, username).
- [ ] El sistema responde 403 con el formato de error uniforme a un EMPLEADO, y 401 sin token.
- [ ] El sistema ordena los registros del más nuevo al más viejo y, sin `desde` ni `hasta`, devuelve los de los últimos 30 días contando hoy en Bolivia, con la misma lectura del período que `/api/estadisticas` (una sola función compartida, no una copia).
- [ ] El sistema cuenta una acción hecha a las 21:00 de Bolivia en ese día y no en el siguiente, aunque Postgres la guarde en UTC (comprobado contra Postgres real).
- [ ] El sistema filtra por `usuario_id`, `accion`, `tabla` y `registro_id` cuando vienen, y responde 400 si `accion` no es una de las del ENUM, si `tabla` no es una de las tablas auditadas, o si un id no es un UUID.
- [ ] El sistema filtra por `sucursal_id` devolviendo solo lo que hizo el personal asignado hoy a esa sucursal, y no las acciones de un ADMIN.
- [ ] El sistema pagina con `pagina` (desde 1) y `por_pagina` (por defecto 50, máximo 200), responde 400 si alguno no es un entero válido, y `total` cuenta todos los registros que cumplen los filtros, no solo los de la página.
- [ ] El sistema nunca devuelve un hash de contraseña: una edición de contraseña aparece con `valores_anteriores: { contrasena_cambiada: true }`, tal como la guardó SPEC-ALE186-010.
- [ ] El sistema no escribe nada al consultar: después de un `GET` la tabla `auditoria` tiene las mismas filas que antes (comprobado contra Postgres real).
- [ ] Los tests de model comprueban que todos los filtros van como parámetros y que la consulta del total usa los mismos filtros que la de los registros.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-012', () => { ... })

Así un `grep SPEC-ALE186-012` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
