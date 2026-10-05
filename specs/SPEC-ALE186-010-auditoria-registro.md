---
id: SPEC-ALE186-010
name: Registro de auditoría en cada escritura
slug: auditoria-registro
status: in-progress
owner: ale186
created: 2026-10-05
scope:
  - backend/src/models/**
  - backend/src/controllers/**
  - backend/src/utils/dominio.ts
  - backend/src/db/seed.ts
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

La tabla `auditoria` y el ENUM `accion_auditoria` existen en el schema desde el principio, pero ninguna escritura los usa: hoy no queda registro de quién creó, editó, cobró, entregó o anuló algo. Esta spec hace que cada escritura del backend deje su fila de auditoría y fija el mecanismo, que CLAUDE.md dejó abierto. La fila se inserta en la MISMA sentencia que la escritura (un CTE `WITH … INSERT INTO auditoria`, como ya hace `entregas.model.ts`), sin triggers ni migraciones (CLAUDE.md, sección 6): si una de las dos falla, no queda ninguna. Quién hizo la acción sale siempre de la sesión, nunca del cuerpo. Una auditoría que se pierde no se puede reconstruir después, y por eso va antes que el resto de las estadísticas. La consulta (`GET /api/auditoria`) queda FUERA: va en su propia spec (`auditoria-consulta`). Tampoco se sincroniza a ningún dispositivo (CLAUDE.md, sección 7).

## Criterios de aceptación

- [ ] El sistema inserta una fila CREAR en `auditoria` (usuario de la sesión, tabla_afectada, registro_id) cuando se da de alta un cliente, una orden o un usuario, en la misma sentencia que el alta.
- [ ] El sistema inserta una fila COBRAR al registrar un pago y una fila ENTREGAR al registrar una entrega, en la misma sentencia que la escritura.
- [ ] El sistema inserta una fila EDITAR con `valores_anteriores` (las columnas que cambiaron, con su valor de antes) cuando se edita un cliente, una orden (incluidos el avance de estado y la anulación) o un usuario.
- [ ] El sistema nunca guarda `password_hash` en `valores_anteriores`: un cambio de contraseña queda anotado como EDITAR con la marca de que la contraseña cambió, sin el valor.
- [ ] El sistema no inserta una segunda fila de auditoría cuando un reintento idempotente (mismo id, mismos datos) responde 200 sin escribir, ni cuando un PATCH sin cambios reales no escribe.
- [ ] El sistema no deja la escritura sin su auditoría ni la auditoría sin su escritura: si una falla, no queda ninguna (comprobado contra Postgres real en `npm run test:db`).
- [ ] El sistema inserta una fila LOGIN cuando un login es exitoso, y no registra los logins fallidos ni las renovaciones.
- [ ] El sistema toma el `usuario_id` de la auditoría de la sesión aunque el cuerpo de la petición traiga otro.
- [ ] La semilla del primer admin no escribe en `auditoria`, porque no hay sesión de quien atribuirlo.
- [ ] Los tests de model comprueban que el SQL de auditoría va parametrizado y que la acción es siempre una de las del ENUM, tomada de las constantes de `utils/dominio.ts`.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-010', () => { ... })

Así un `grep SPEC-ALE186-010` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
