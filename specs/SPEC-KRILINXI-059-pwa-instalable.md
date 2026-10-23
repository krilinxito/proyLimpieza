---
id: SPEC-KRILINXI-059
name: PWA mejor instalable en el celular
slug: pwa-instalable
status: finished
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/vite.config.ts
  - frontend/index.html
  - frontend/public/**
  - frontend/src/pwa/**
  - frontend/src/components/marco/**
priority: medium
depends_on: []
tests:
  - frontend\src\components\AvisoInstalar.test.tsx
  - frontend\src\pwa\build.test.ts
  - frontend\src\pwa\csp.test.ts
  - frontend\src\pwa\iconos.test.ts
  - frontend\src\pwa\instalacion.test.ts
  - frontend\src\test\arquitectura.test.ts
---

## Descripción

La app ya se instala como PWA, pero hoy es poco evidente: faltan íconos de varios tamaños y maskable, un nombre corto claro y un botón visible "Instalar en este celular" cuando el navegador lo permite. Se decidió mejorar la PWA y no armar un APK ni una app de iPhone. Debe seguir abriendo sin internet y la política de seguridad del contenido (CSP) no debe aflojarse.

## Criterios de aceptación

- [ ] El manifest trae nombre y nombre corto, íconos de 192 y 512 px (también maskable), colores de tema y de fondo iguales a la marca, display standalone y start_url correctos.
- [ ] Un botón "Instalar en este celular" aparece solo cuando el navegador dispara beforeinstallprompt, y desaparece al instalar; en iPhone se muestra una ayuda de dos pasos en palabras.
- [ ] La app instalada abre sin internet en cualquier pantalla (el test de build de SPEC-KRILINXI-011 sigue en verde) y el service worker no cachea la API ni PowerSync.
- [ ] La CSP no se afloja: no aparece ningún origen nuevo en csp.ts.
- [ ] Queda escrito en la bitácora cómo probarlo a mano en un celular Android y qué hacer si el navegador no ofrece instalar.
- [ ] Tests con el id de esta spec y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-059', () => { ... })

Así un `grep SPEC-KRILINXI-059` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
