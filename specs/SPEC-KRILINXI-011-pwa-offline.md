---
id: SPEC-KRILINXI-011
name: La app abre sin internet (PWA)
slug: pwa-offline
status: in-progress
owner: krilinxito
created: 2026-10-16
scope:
  - frontend/vite.config.ts
  - frontend/index.html
  - frontend/public/**
  - frontend/src/main.tsx
  - frontend/src/pwa/**
  - frontend/package.json
  - package-lock.json
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

CLAUDE.md §4 dice que el frontend está empaquetado como PWA, pero no hay service worker ni manifest: si la tablet recarga sin internet, la app no abre aunque la base local tenga todo. Esta spec agrega vite-plugin-pwa con el precache de la app (incluidos los WASM y workers de PowerSync), el manifest para instalarla en la tablet y el fallback de rutas, sin cachear nunca la API ni PowerSync.

## Criterios de aceptación

- [ ] `npm run build` del frontend genera un service worker y un manifest con nombre "Lavandería", start_url "/", display standalone e íconos de 192 y 512 px.
- [ ] El precache incluye el HTML, JS, CSS y los archivos .wasm y workers de @powersync/web, de modo que después de una primera visita con conexión la app abre sin internet.
- [ ] Sin conexión, abrir cualquier ruta de la app (p. ej. /ropa) responde con index.html.
- [ ] Ninguna petición a la API (VITE_API_URL) ni a PowerSync (VITE_POWERSYNC_URL) pasa por la caché del service worker.
- [ ] Una versión nueva se aplica al recargar o volver a abrir la app, nunca recargando la pantalla por su cuenta, y no borra la sesión ni la base local.
- [ ] En `npm run dev` y en los tests el service worker no se registra.
- [ ] CLAUDE.md queda alineado con el código: la PWA real (§4) y los nombres actuales de §5 (lib/api, hooks/useConexion).

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-011', () => { ... })

Así un `grep SPEC-KRILINXI-011` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
