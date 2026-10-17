---
id: SPEC-KRILINXI-020
name: Política de seguridad del contenido (CSP) para la PWA
slug: csp-frontend
status: finished
owner: krilinxito
created: 2026-10-17
scope:
  - frontend/index.html
  - frontend/vite.config.ts
  - frontend/src/pwa/**
  - frontend/src/lib/env.ts
  - frontend/src/lib/env.test.ts
  - frontend/src/lib/api.test.ts
  - frontend/src/test/**
  - frontend/src/features/estadisticas/components/SeccionVolumen.tsx
  - frontend/src/features/estadisticas/components/PantallaEstadisticas.test.tsx
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-019
tests:
  - frontend/src/features/estadisticas/components/PantallaEstadisticas.test.tsx
  - frontend/src/lib/api.test.ts
  - frontend/src/pwa/build.test.ts
  - frontend/src/pwa/csp.test.ts
  - frontend/src/test/arquitectura.test.ts
---

## Descripción

La sesión vive en `localStorage` (SPEC-KRILINXI-003), así que un XSS en el frontend podría leer el token y usarlo desde otro lado; CLAUDE.md §13 ("Avisos para el frontend") pide revisarlo con una Content-Security-Policy. Hoy la app no declara ninguna.

Esta spec agrega una CSP al build de producción que permita solo lo que la app usa: sus propios archivos, los WASM y workers de PowerSync, y conectarse a la API y al servicio de PowerSync de `.env`. Es delicada porque una política mal armada no rompe un test: rompe la app en la tablet, y offline no hay cómo enterarse. Por eso se prueba sobre el build real y con la app abierta sin internet, como la PWA de SPEC-KRILINXI-011. Depende de SPEC-KRILINXI-019 para trabajar sobre una suite estable.

## Criterios de aceptación

- [ ] El sistema sirve el build de producción con una Content-Security-Policy que solo permite scripts, estilos, workers y WASM del propio origen
- [ ] El sistema permite conectarse solo al origen de la API y al del servicio de PowerSync configurados en el entorno, y a nada más
- [ ] El sistema no permite scripts en línea ni eval, salvo la excepción que exija el WASM de PowerSync, nombrada y justificada en la bitácora
- [ ] El sistema sigue abriendo sin internet en cualquier pantalla después de una primera visita, con la CSP puesta (lo comprueba el test del build de SPEC-KRILINXI-011 o uno nuevo sobre el build real)
- [ ] El sistema no aplica la CSP en `npm run dev`, para no romper la recarga en caliente de Vite
- [ ] Un test falla si el build sale sin CSP o si la política permite conexiones a cualquier origen
- [ ] CLAUDE.md saca la CSP de los pendientes y dice qué hacer si se agrega un servicio externo nuevo (hay que sumarlo a la política)

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-020', () => { ... })

Así un `grep SPEC-KRILINXI-020` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
