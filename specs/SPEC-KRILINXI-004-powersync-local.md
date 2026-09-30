---
id: SPEC-KRILINXI-004
name: Base local sincronizada con PowerSync
slug: powersync-local
status: in-progress
owner: krilinxito
created: 2026-09-30
scope:
  - frontend/src/lib/powersync/**
  - frontend/src/lib/env.ts
  - frontend/src/lib/env.test.ts
  - frontend/src/features/auth/SesionProvider.tsx
  - frontend/src/test/**
  - frontend/package.json
  - frontend/vite.config.ts
  - package-lock.json
  - docker/powersync/sync-rules.yaml
priority: high
depends_on: []
tests: []
---

## Descripción

Pone en pie el camino de BAJADA de la arquitectura offline-first (CLAUDE.md §6): Postgres → PowerSync Service → SQLite en el navegador. Después de esta spec, las pantallas pueden leer clientes, órdenes, entregas y pagos de la base local, con o sin internet, en vez de pedírselos a la API.

Incluye: el SDK web de PowerSync (`@powersync/web`) y los ajustes de Vite que necesita para sus workers y su WASM; el schema local, que declara exactamente lo que bajan las sync rules (`usuarios` sin `password_hash`); `lib/env` leyendo `VITE_POWERSYNC_URL`; el connector con `fetchCredentials`, que entrega el `tokenPowerSync` que ya guarda SPEC-KRILINXI-003; y el ciclo de vida atado a la sesión: la base se abre al entrar y se borra al salir o cuando el servidor rechaza la sesión, como pide CLAUDE.md §6.

También una capa de acceso en `lib/powersync/` —la única que importa `@powersync/*`— y un doble para los tests. El SDK web no corre en jsdom, así que el doble ejecuta **SQL real** sobre un SQLite en Node con el mismo schema: las consultas de saldo y de ropa sin recoger que vienen después son SQL, y un doble en memoria no las probaría.

Y la deuda de CLAUDE.md §13 que es de este mismo tema: el `AND activo = true` que falta en el bucket `sucursal` de `docker/powersync/sync-rules.yaml`. Es infraestructura compartida: avisarle a ale186 antes del PR.

Queda FUERA a propósito, para `cola-subida`: subir los cambios. En esta spec `uploadData` no sube nada y no da ninguna transacción por terminada, así que lo que se escriba local se conserva en la cola hasta que exista quien la procese. Tampoco hay pantallas: la primera que lee de aquí es `clientes-mostrador`.

## Criterios de aceptación

- [ ] El schema local declara las tablas clientes, sucursales, usuarios, ordenes, entregas y pagos con las mismas columnas que bajan las sync rules, y un test falla si docker/powersync/sync-rules.yaml o context/lavanderia_schema.sql cambian sin que cambie el schema local.
- [ ] La tabla local usuarios no tiene columna password_hash, y un test lo comprueba.
- [ ] La URL del servicio se lee de VITE_POWERSYNC_URL en lib/env, y la aplicación falla al arrancar con un mensaje claro en español si esa variable falta.
- [ ] El sistema abre la base local y se conecta a PowerSync cuando hay una sesión guardada, entregando el tokenPowerSync de esa sesión en fetchCredentials.
- [ ] El sistema no se conecta a PowerSync cuando no hay sesión, y fetchCredentials no entrega ningún token en ese caso.
- [ ] El sistema abre la base local y responde consultas con lo ya sincronizado aunque no haya conexión, sin esperar a que termine una sincronización.
- [ ] El sistema desconecta PowerSync y borra la base local cuando la persona sale confirmando, y cuando la API rechaza la sesión con 401.
- [ ] Los cambios escritos en la base local quedan en la cola de subida: en esta spec uploadData no llama a la API ni da ninguna transacción por terminada, y un test comprueba que la cola conserva lo escrito.
- [ ] La capa de lib/powersync es el único código que importa @powersync/*, y un test de arquitectura lo comprueba.
- [ ] Existe un doble de la base local para los tests que ejecuta SQL real sobre el mismo schema, con un comentario de cabecera que explica cómo usarlo.
- [ ] El bucket sucursal de las sync rules solo entrega datos a usuarios con activo = true.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-004', () => { ... })

Así un `grep SPEC-KRILINXI-004` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
