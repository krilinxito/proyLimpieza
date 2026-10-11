---
id: SPEC-ALE186-025
name: El token de PowerSync dura menos de 24 horas
slug: token-powersync-corto
status: in-progress
owner: ale186
created: 2026-10-11
scope:
  - backend/src/utils/jwt.ts
  - backend/src/config.ts
  - .env.example
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

SPEC-ALE186-024 encontró, probando con el PowerSync de este repo, que PowerSync 1.25 rechaza con 401 `PSYNC_S2104` todo token que dure más de 24 horas, y que ese límite está fijo en su código (`token_max_expiration: '1d'`), sin opción en `powersync.yaml`. `emitirCredenciales` (`backend/src/utils/jwt.ts`) firma el token de la API y el de PowerSync con las mismas opciones, así que el de PowerSync hereda los 3 días de `JWT_EXPIRES_IN`: con la configuración actual ninguna tablet baja datos de un PowerSync real. Esta spec separa los plazos. El token de la API sigue en `JWT_EXPIRES_IN` (3 días): es el que se usa al volver la conexión para subir la cola y para pedir tokens nuevos sin contraseña (`POST /api/auth/renovar`), y es el presupuesto de trabajo sin internet de CLAUDE.md §6. El de PowerSync pasa a una variable propia, `PS_JWT_EXPIRES_IN`, por defecto 12 horas, que nunca puede superar 24 horas: si la config pide más, el backend no arranca y dice por qué. Sin internet ningún token se usa, así que un token de PowerSync vencido no afecta el trabajo offline; al volver la conexión, el frontend pide un par nuevo a `/renovar` con el token de la API. Esa parte es del frontend y no se implementa acá: esta spec deja escritos en CLAUDE.md, en los avisos para el frontend, los pasos exactos que tiene que hacer krilinxito. No cambia el `.env` de nadie.

## Criterios de aceptación

- [ ] El sistema firma el token de PowerSync con el plazo de `PS_JWT_EXPIRES_IN` (por defecto 12 horas) y el token de la API con el de `JWT_EXPIRES_IN` (por defecto 3 días), de modo que con la configuración por defecto el de PowerSync vence en 12 horas y el de la API en 3 días (comprobado leyendo `exp - iat` de los dos tokens).
- [ ] El sistema rechaza al arrancar un `PS_JWT_EXPIRES_IN` mayor a 24 horas o que no sea un plazo válido, con un mensaje que dice que PowerSync no acepta tokens de más de 24 horas (comprobado con entornos de mentira).
- [ ] `POST /api/auth/login` y `POST /api/auth/renovar` devuelven el token de PowerSync con el plazo nuevo y el de la API con el de siempre, y `/renovar` sigue funcionando solo con el token de la API, sin contraseña.
- [ ] PowerSync acepta el token de PowerSync que emite el backend con la configuración por defecto: una cuenta activa recibe su bucket `global` (comprobado a mano contra el PowerSync local, sin acortar el token a mano como se hizo en SPEC-ALE186-024); el resultado queda en la bitácora.
- [ ] `.env.example` documenta `PS_JWT_EXPIRES_IN`, y CLAUDE.md quita de la deuda "PowerSync rechaza los tokens de 3 días", explica en la sección 6 por qué hay dos plazos, y deja en los avisos para el frontend los pasos que tiene que hacer krilinxito: que `fetchCredentials` pida un par nuevo a `POST /api/auth/renovar` cuando el token de PowerSync vence, que eso no cierre la sesión, que guarde el par nuevo, y que solo pida la contraseña si `/renovar` responde 401.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-025', () => { ... })

Así un `grep SPEC-ALE186-025` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
