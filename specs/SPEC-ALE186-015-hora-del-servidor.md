---
id: SPEC-ALE186-015
name: La hora del servidor y la fecha de cada hecho
slug: hora-del-servidor
status: finished
owner: ale186
created: 2026-10-08
scope:
  - backend/src/controllers/auth.controller.ts
  - backend/src/models/auditoria.model.ts
  - backend/src/models/usuarios.model.ts
  - backend/src/utils/**
  - backend/tests/**
  - CLAUDE.md
priority: medium
depends_on: []
tests:
  - backend\tests\db\horaDelServidor.db.test.ts
  - backend\tests\http\auth.test.ts
  - backend\tests\http\usuarios.test.ts
  - backend\tests\unit\auditoria.model.test.ts
  - backend\tests\unit\reloj.model.test.ts
---

## Descripción

Las fechas oficiales de una orden, un pago o una entrega las pone la tablet, porque es la única que sabe cuándo pasaron estando sin internet. Pero el reloj de una tablet suele estar mal. SPEC-ALE186-014 dejó una red de seguridad en el servidor (rechaza fechas en el futuro) y anotó en CLAUDE.md §13 la corrección de fondo, que es del frontend: medir el desfase de la tablet contra la hora del servidor cada vez que hay conexión y aplicarlo al registrar. Esta spec hace la parte del backend de eso y nada del frontend. (1) `POST /api/auth/login` y `/renovar` agregan `ahora` a su respuesta: la hora del servidor, sacada del MISMO reloj con el que se valida la fecha futura (`now()` de Postgres), para que la tablet quede calibrada contra el reloj que después la juzga. El campo es nuevo y no cambia ninguno de los que ya existen, así que el frontend actual no se rompe. (2) La consulta de la auditoría (SPEC-ALE186-012) suma a cada registro la fecha del hecho, sacada del registro tocado igual que su sucursal: así el admin ve, para una orden cargada sin internet, cuándo entró la ropa y cuándo llegó al servidor.

## Criterios de aceptación

- [ ] El sistema incluye `ahora` en la respuesta 200 de `POST /api/auth/login`, como texto ISO 8601 en UTC (`2026-10-08T14:05:03.123Z`), y conserva sin cambios `token`, `tokenPowerSync` y `usuario`.
- [ ] El sistema incluye `ahora` con el mismo formato en la respuesta 200 de `POST /api/auth/renovar`, sin cambiar los demás campos.
- [ ] El sistema toma `ahora` de `now()` de Postgres, el mismo reloj con el que SPEC-ALE186-014 decide si una `fecha_entrada` está en el futuro, y no del reloj del proceso de Node (comprobado contra Postgres real: `ahora` queda a menos de un segundo de `now()`).
- [ ] El sistema no incluye `ahora` en las respuestas de error del login ni de la renovación: el formato de error uniforme no cambia.
- [ ] El sistema agrega a cada registro de `GET /api/auditoria` el campo `fechaDelHecho`, texto `YYYY-MM-DD HH:MM:SS` en hora de Bolivia: la `fecha_entrada` de la orden en su alta, la `fecha_pago` del pago y la `fecha_entrega` de la entrega; `null` para el resto (ediciones, clientes, usuarios, sucursales y login).
- [ ] El sistema muestra, para una orden cargada sin internet a las 18:00 y subida a las 20:00 (hora de Bolivia), `fechaDelHecho` 18:00 y `fecha` 20:00 en su registro CREAR (comprobado contra Postgres real).
- [ ] Los tests de model comprueban que `fechaDelHecho` sale del registro tocado con un CASE sobre la tabla, igual que la sucursal, y que no agrega parámetros que no se usan.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-015', () => { ... })

Así un `grep SPEC-ALE186-015` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
