---
id: SPEC-ALE186-003
name: Alta y edición de clientes
slug: clientes-api
status: finished
owner: ale186
created: 2026-09-28
scope:
  - backend/src/models/clientes.model.ts
  - backend/src/controllers/clientes.controller.ts
  - backend/src/routes/clientes.routes.ts
  - backend/src/routes/index.ts
  - backend/src/utils/validacion.ts
  - backend/src/utils/ApiError.ts
  - backend/tests/**
priority: high
depends_on:
  - SPEC-ALE186-002
tests:
  - backend\tests\http\clientes.test.ts
  - backend\tests\unit\clientes.model.test.ts
  - backend\tests\unit\validacion.test.ts
---

## Descripción

Recibe las altas y ediciones de clientes que sube la app desde la cola de PowerSync (CLAUDE.md sección 6). Es la primera spec que escribe datos del negocio, y por eso fija el patrón de escritura que van a copiar órdenes, pagos y entregas: el id lo genera el dispositivo con `crypto.randomUUID()` y el backend lo respeta, y la misma escritura puede llegar dos veces —si se corta la conexión a mitad de la subida, PowerSync reintenta—, así que un reintento no puede duplicar ni fallar.

Quedan FUERA a propósito: las búsquedas (un `GET` por teléfono rompería el modo offline: los clientes se sincronizan enteros al dispositivo en el bucket `global` y se buscan en SQLite local) y el borrado (un cliente tiene órdenes que lo referencian, y el histórico no se pierde).

El teléfono se normaliza a solo dígitos antes de guardarlo y de comprobar su unicidad. Es una decisión de contrato con el frontend: la búsqueda local del mostrador tiene que normalizar igual, o un cliente guardado como `70123456` no aparecería al buscar `7012-3456`.

## Criterios de aceptación

- [ ] El sistema crea el cliente y responde 201 con sus datos cuando recibe POST /api/clientes con token válido y un `id` UUID, `nombre` y `telefono`.
- [ ] El sistema guarda el cliente con el `id` que mandó el dispositivo, y responde 400 VALIDACION cuando el `id` falta o no es un UUID.
- [ ] El sistema responde 2xx con el cliente ya existente, sin crear una segunda fila ni modificar la guardada, cuando recibe un POST con un `id` que ya existe (el reintento de una subida).
- [ ] El sistema responde 409 con el código TELEFONO_DUPLICADO cuando el teléfono ya pertenece a otro cliente, con un mensaje que dice a nombre de quién está registrado y qué hacer.
- [ ] El sistema guarda el teléfono solo con dígitos, quitando espacios, guiones y paréntesis, y comprueba la unicidad sobre ese valor normalizado; si no queda ningún dígito responde 400 VALIDACION.
- [ ] El sistema toma `sucursal_registro_id` de la sesión del usuario y nunca del cuerpo de la petición, y lo deja en NULL cuando quien registra es un ADMIN.
- [ ] El sistema responde 400 VALIDACION con un mensaje en el idioma del mostrador cuando `nombre` o `telefono` faltan o quedan vacíos después de quitar los espacios.
- [ ] El sistema actualiza nombre, teléfono o carnet y responde 200 con el cliente cuando recibe PATCH /api/clientes/:id, y responde 404 cuando ese cliente no existe.
- [ ] El sistema responde 409 TELEFONO_DUPLICADO cuando un PATCH intenta poner un teléfono que pertenece a otro cliente, y no aplica ningún campo del cuerpo que no sea nombre, teléfono o carnet.
- [ ] El sistema responde 401 NO_AUTENTICADO en los dos endpoints cuando la petición no trae un token válido.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-003', () => { ... })

Así un `grep SPEC-ALE186-003` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
