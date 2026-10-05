---
id: SPEC-ALE186-009
name: Alta, edición y baja de empleados
slug: usuarios-admin
status: finished
owner: ale186
created: 2026-10-05
scope:
  - backend/src/models/usuarios.model.ts
  - backend/src/controllers/usuarios.controller.ts
  - backend/src/routes/usuarios.routes.ts
  - backend/src/routes/index.ts
  - backend/src/utils/validacion.ts
  - backend/src/utils/ApiError.ts
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests:
  - backend\tests\db\usuarios.db.test.ts
  - backend\tests\http\usuarios.test.ts
  - backend\tests\unit\usuarios.model.test.ts
  - backend\tests\unit\validacion.test.ts
---

## Descripción

Hoy la única cuenta que existe es la del admin que crea la semilla (SPEC-ALE186-002): no hay forma de dar de alta a quien atiende una sucursal sin tocar la base a mano. Esta spec agrega `POST /api/usuarios` y `PATCH /api/usuarios/:id`, solo para ADMIN, para crear empleados, corregir sus datos, cambiarles la contraseña y darlos de baja (`activo = false`). Sigue el patrón de escritura de SPEC-ALE186-003: el id lo manda el cliente y el reintento con el mismo id y los mismos datos es idempotente. No se borra a nadie: dar de baja es la única salida, para que órdenes, pagos y la auditoría futura sigan apuntando a alguien. La tabla `usuarios` ya baja a los dispositivos por el bucket `global` sin `password_hash`, así que un empleado nuevo aparece en las tablets sin cambiar las sync rules. Este documento es también el contrato de la futura pantalla de usuarios del admin.

## Criterios de aceptación

- [ ] El sistema crea un EMPLEADO con `POST /api/usuarios` (id, nombre_completo, username, password, sucursal_id, telefono opcional) cuando lo pide un ADMIN, guarda la contraseña hasheada con el mismo algoritmo que el login, anota `creado_por` con el admin de la sesión y responde 201 sin `password_hash` en el cuerpo.
- [ ] El sistema responde 403 con el formato de error uniforme cuando un EMPLEADO llama a `POST` o `PATCH /api/usuarios`, y 401 sin token.
- [ ] El sistema rechaza con 400 un alta de EMPLEADO sin `sucursal_id`, un `rol` que no sea uno de los del ENUM, y una contraseña más corta que el mínimo que fije la spec.
- [ ] El sistema responde 404 cuando `sucursal_id` no corresponde a una sucursal existente.
- [ ] El sistema responde 409 con un mensaje en español que dice qué hacer cuando el `username` ya está usado por otra cuenta.
- [ ] El sistema responde 200 sin crear una segunda fila cuando se reintenta un `POST` con el mismo id y los mismos datos, y 409 cuando el id ya existe con datos distintos.
- [ ] El sistema actualiza con `PATCH /api/usuarios/:id` solo los campos enviados (nombre_completo, telefono, sucursal_id, password, activo) y responde 404 si el usuario no existe.
- [ ] El sistema rechaza con 400 un `PATCH` que deje a un EMPLEADO sin sucursal o le asigne sucursal a un ADMIN.
- [ ] El sistema rechaza con 409 que un ADMIN se dé de baja a sí mismo, para que nunca quede el sistema sin nadie que pueda entrar a administrarlo.
- [ ] El sistema rechaza el login y la renovación de un usuario después de darlo de baja con `PATCH … activo: false` (comprobado de punta a punta en la suite HTTP).
- [ ] Los tests de model comprueban que todo el SQL de usuarios va parametrizado y que ninguna función devuelve `password_hash` salvo `buscarPorUsername`, que lo usa el login.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-009', () => { ... })

Así un `grep SPEC-ALE186-009` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
