---
id: SPEC-ALE186-011
name: Alta, edición y cierre de sucursales
slug: sucursales-admin
status: finished
owner: ale186
created: 2026-10-06
scope:
  - backend/src/models/sucursales.model.ts
  - backend/src/controllers/sucursales.controller.ts
  - backend/src/routes/sucursales.routes.ts
  - backend/src/routes/index.ts
  - backend/src/models/auditoria.model.ts
  - backend/src/utils/validacion.ts
  - backend/src/utils/ApiError.ts
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests:
  - backend\tests\db\sucursales.db.test.ts
  - backend\tests\http\sucursales.test.ts
  - backend\tests\unit\auditoria.model.test.ts
  - backend\tests\unit\sucursales.model.test.ts
---

## Descripción

El negocio tiene 3 sucursales, pero la única que existe es la que crea la semilla (SPEC-ALE186-002). No hay forma de crear las otras dos sin insertar a mano en la base, y sin ellas no se puede dar de alta a su personal: `POST /api/usuarios` exige una sucursal existente y activa (SPEC-ALE186-009). Esta spec agrega `POST /api/sucursales` y `PATCH /api/sucursales/:id`, solo para ADMIN, para crear una sucursal, corregir sus datos y cerrarla (`activa = false`). Sigue el patrón de escritura de clientes y usuarios: el id lo manda el cliente y el reintento con el mismo id y los mismos datos es idempotente. No se borra ninguna sucursal: órdenes, pagos y entregas apuntan a ella. Todas las escrituras pasan por `conAuditoria` (SPEC-ALE186-010), con la tabla `sucursales` sumada a las auditadas. `sucursales` ya baja a todos los dispositivos por el bucket `global`, así que una sucursal nueva aparece en las tablets sin tocar las sync rules. El schema no tiene `UNIQUE` sobre el nombre y el proyecto no tiene migraciones, así que la unicidad del nombre se comprueba en la aplicación; para una operación que solo hace el admin y muy de vez en cuando, se acepta la carrera teórica. Queda FUERA el listado: las sucursales ya están en la base local de cada dispositivo. Este documento es también el contrato de la futura pantalla de sucursales del admin.

## Criterios de aceptación

- [ ] El sistema crea una sucursal con `POST /api/sucursales` (id, nombre, direccion y telefono opcionales) cuando lo pide un ADMIN, y responde 201 con la sucursal activa.
- [ ] El sistema responde 403 con el formato de error uniforme cuando un EMPLEADO llama a `POST` o `PATCH /api/sucursales`, y 401 sin token.
- [ ] El sistema rechaza con 400 un alta o edición con el nombre vacío o de más de 100 caracteres, una dirección de más de 200, un teléfono de más de 30, o un `activa` que no sea booleano.
- [ ] El sistema responde 409 con un mensaje en español que dice qué hacer cuando el nombre ya lo usa otra sucursal, sin distinguir mayúsculas ni espacios de los extremos.
- [ ] El sistema responde 200 sin crear una segunda fila cuando se reintenta un `POST` con el mismo id y los mismos datos, y 409 cuando el id ya existe con datos distintos.
- [ ] El sistema actualiza con `PATCH /api/sucursales/:id` solo los campos enviados (nombre, direccion, telefono, activa) y responde 404 si la sucursal no existe.
- [ ] El sistema rechaza con 409 cerrar (`activa: false`) una sucursal que todavía tiene órdenes en RECIBIDO, EN_PROCESO o LISTO, con un mensaje que dice cuántas quedan, porque los clientes vuelven a retirar la ropa a esa misma sucursal.
- [ ] El sistema deja de aceptar una sucursal cerrada como `sucursal_id` al dar de alta o mover a un empleado (comprobado de punta a punta en la suite HTTP), y la vuelve a aceptar si se reabre con `activa: true`.
- [ ] El sistema anota en `auditoria` un CREAR al dar de alta y un EDITAR con los valores de antes al editar o cerrar, a nombre del admin de la sesión, en la misma sentencia que la escritura (comprobado contra Postgres real).
- [ ] Los tests de model comprueban que todo el SQL de sucursales va parametrizado, y la lista `ESCRITURAS` de `auditoria.model.test.ts` incluye las dos escrituras nuevas.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-011', () => { ... })

Así un `grep SPEC-ALE186-011` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
