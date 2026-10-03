---
id: SPEC-KRILINXI-005
name: Buscar y dar de alta clientes en el mostrador
slug: clientes-mostrador
status: in-progress
owner: krilinxito
created: 2026-10-03
scope:
  - frontend/src/features/clientes/**
  - frontend/src/pages/rutas.tsx
  - context/lavanderia_schema.sql
  - docker/powersync/sync-rules.yaml
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

La primera pantalla del negocio y la primera escritura local. El empleado escribe el teléfono del cliente, el sistema lo busca en la tabla `clientes` de SQLite (bucket `global`, CLAUDE.md §6-7) y, si no existe, lo da de alta ahí mismo: id con `crypto.randomUUID()`, escrito en la base local, sin esperar al servidor. La cola guarda el cambio; subirlo es de `cola-subida` (el backend ya lo acepta: `POST /api/clientes`, SPEC-ALE186-003).

Fija el patrón que copian las pantallas siguientes: un repositorio local en `features/clientes/api/` (el único que hace SQL), un hook en `features/clientes/hooks/` y componentes que solo usan el hook (CLAUDE.md §5). El teléfono se normaliza igual que en el backend (`normalizarTelefono`) antes de buscar y de guardar, o un mismo cliente con espacios en el número aparecería como nuevo.

Incluye la limpieza de documentación pendiente: los comentarios de `context/lavanderia_schema.sql` (tabla `clientes`) y `docker/powersync/sync-rules.yaml` (bucket `global`) que todavía dicen que la ropa se recoge en otra sucursal, y CLAUDE.md §2 (ya hay PowerSync) y §13 (las sync rules ya comprueban `activo`). Son infraestructura compartida: avisarle a ale186 antes del PR.

A decidir al aprobar: si `/clientes` se restringe a EMPLEADO. El ADMIN no tiene sucursal, y aunque los clientes son globales, el alta desde el mostrador registra `sucursal_registro_id` NULL.

Queda FUERA: editar clientes existentes (PATCH), subir la cola y mostrar rechazos del servidor (`cola-subida`), y crear la orden (`registrar-ropa`).

## Criterios de aceptación

- [ ] El sistema muestra el nombre, teléfono y carnet del cliente cuando el empleado escribe un teléfono que existe en la base local, sin hacer ninguna petición a la API.
- [ ] El sistema encuentra al cliente aunque el teléfono se escriba con espacios, guiones o prefijo distinto, normalizándolo con la misma regla que el backend.
- [ ] El sistema ofrece dar de alta al cliente, con el teléfono ya cargado, cuando el teléfono buscado no existe en la base local.
- [ ] El sistema guarda el cliente nuevo en la base local con un id generado por crypto.randomUUID(), y el cambio queda en la cola de subida con nombre, teléfono y carnet.
- [ ] El sistema no guarda y muestra un mensaje en español que dice qué hacer cuando falta el nombre o el teléfono; el carnet es opcional.
- [ ] El sistema no guarda y muestra el cliente existente cuando el teléfono del alta ya está registrado en la base local.
- [ ] El sistema guarda y encuentra clientes sin conexión, y un test lo comprueba sobre el doble de base local con SQL real.
- [ ] La ruta /clientes muestra la pantalla nueva en vez de EnConstruccion, con textos del negocio ("Buscar cliente", "Registrar cliente nuevo") y ninguna palabra técnica.
- [ ] Ningún componente de features/clientes consulta la base local directamente: lo hace a través de features/clientes/api o de un hook, y el test de arquitectura lo comprueba.
- [ ] Los comentarios de context/lavanderia_schema.sql y docker/powersync/sync-rules.yaml dicen que la ropa se retira en la misma sucursal donde se dejó, y CLAUDE.md §2 y §13 reflejan que PowerSync existe y que las sync rules ya comprueban activo.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-005', () => { ... })

Así un `grep SPEC-KRILINXI-005` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
