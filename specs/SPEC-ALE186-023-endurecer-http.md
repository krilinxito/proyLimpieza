---
id: SPEC-ALE186-023
name: Endurecer la API HTTP antes de producción
slug: endurecer-http
status: finished
owner: ale186
created: 2026-10-11
scope:
  - backend/src/app.ts
  - backend/src/config.ts
  - backend/src/db/pool.ts
  - backend/src/middleware/errorHandler.ts
  - backend/package.json
  - package-lock.json
  - .env.example
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests:
  - backend\tests\db\seguridad.db.test.ts
  - backend\tests\http\seguridad.test.ts
  - backend\tests\unit\config.test.ts
  - backend\tests\unit\pool.test.ts
---

## Descripción

Cinco hallazgos de la revisión del backend del 2026-10-09 que viven en la capa HTTP y en la conexión a la base, y que conviene cerrar antes de producción. (1) `npm audit` marca una vulnerabilidad crítica en `proxy-addr` (dentro de Express): hoy no aplica porque no se usa `trust proxy`, pero aplicará detrás de un proxy; se arregla con `npm audit fix`. (2) `app.ts` usa `cors()` sin opciones, que acepta pedidos desde cualquier página web: pasa a aceptar solo los orígenes de una variable nueva, `CORS_ORIGENES` (lista separada por comas). Para no romper el `.env` de nadie después del pull, fuera de producción, si falta, vale `http://localhost:5173` (el del frontend); en producción es obligatoria y sin ella el servidor no arranca. Los pedidos sin cabecera `Origin` (curl, los tests, otro servidor) siguen funcionando: CORS es una protección del navegador. (3) Se agrega `helmet`, que pone las cabeceras de seguridad estándar y quita `X-Powered-By`. (4) El pool de Postgres no tiene tiempos límite: una consulta trabada ocupa una conexión para siempre. Se agregan `statement_timeout` (por defecto 10 s) y un tiempo límite para conectar (por defecto 5 s), configurables por `.env`. (5) El manejador de errores imprime el error entero, y un error de Postgres trae en `detail` los valores de la fila (por ejemplo `Key (telefono)=(71234567) already exists`): teléfonos y carnets terminan en los logs. Pasa a imprimir el mensaje, el código, la restricción y el stack, sin `detail` ni los parámetros. Se descartó de la revisión el 409 de teléfono duplicado: el nombre que revela ya está en la tablet de cualquier empleado, porque el bucket `global` sincroniza todos los clientes, y el endpoint exige sesión (lo de PowerSync va en su propia spec, `sync-global-activos`).

## Criterios de aceptación

- [ ] `npm audit --omit=dev` en el backend no reporta ninguna vulnerabilidad crítica ni alta.
- [ ] El sistema responde con `Access-Control-Allow-Origin` igual al origen del pedido cuando ese origen está en `CORS_ORIGENES`, y sin esa cabecera cuando no está; un pedido sin cabecera `Origin` se atiende normalmente (comprobado con supertest).
- [ ] El sistema toma `CORS_ORIGENES` como lista separada por comas, ignorando espacios; si falta, vale `http://localhost:5173` cuando `NODE_ENV` no es `production`, y con `NODE_ENV=production` la lectura de la config falla con un mensaje que dice qué variable agregar (comprobado con entornos de mentira).
- [ ] Las respuestas de la API llevan las cabeceras de `helmet` (por ejemplo `X-Content-Type-Options: nosniff`) y no llevan `X-Powered-By`.
- [ ] El sistema crea el pool con `statement_timeout` y tiempo límite de conexión leídos del `.env` (por defecto 10000 y 5000 ms), y Postgres cancela una consulta que supera el `statement_timeout` (comprobado contra Postgres real con `pg_sleep` y un límite bajo).
- [ ] Ante un error no controlado, el sistema registra el mensaje, el código, la restricción y el stack, pero no `detail`, `where` ni los parámetros de la consulta: un error de Postgres con un teléfono en `detail` no deja ese teléfono en el log; la respuesta sigue siendo el mismo 500 genérico.
- [ ] `.env.example` documenta `CORS_ORIGENES` y los dos tiempos límite, y CLAUDE.md actualiza el aviso para el frontend sobre CORS y quita de la revisión del backend lo que esta spec resolvió.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-023', () => { ... })

Así un `grep SPEC-ALE186-023` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
