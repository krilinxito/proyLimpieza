---
id: SPEC-001
name: Scaffolding del frontend
slug: frontend-scaffold
status: in-progress
owner: krilinxito
created: 2026-09-07
scope:
  - frontend/**
  - package.json
priority: high
depends_on: []
tests: []
---

## Descripción

Poner en pie el proyecto de frontend para que se puedan empezar a construir pantallas: Vite + React + TypeScript, Tailwind para los estilos, axios para hablar con la API, y Vitest + React Testing Library como único runner de tests. Deja creada la estructura de carpetas que declara CLAUDE.md §5 y el registro de rutas con las pantallas previstas ya montadas, para que las specs siguientes solo rellenen archivos propios en vez de volver a tocar los mismos.

Dos decisiones que esta spec cierra a propósito. **No instala el SDK web de PowerSync ni el plugin PWA de Vite**: una dependencia que no se configura hasta dentro de varias specs es peso muerto que se desactualiza sola, así que cada una entra con la spec que la usa, en la versión de ese momento. Y el `package.json` de la raíz —necesario porque CLAUDE.md §11 pide `npm test` desde la raíz— se crea aquí declarando **únicamente** el workspace `frontend`; el dev del backend añadirá el suyo cuando arranque. Es un conflicto de una línea en el peor caso, y evita declarar un workspace cuyo directorio todavía no tiene `package.json`.

## Criterios de aceptación

- [ ] npm install desde la raíz instala el workspace frontend sin errores
- [ ] npm test desde la raíz corre Vitest y pasa al menos un test que renderiza un componente con React Testing Library
- [ ] npm run dev levanta Vite y sirve la aplicación en el puerto 5173
- [ ] npx tsc --noEmit pasa sin errores con strict activado, y no hay ningún uso de any en el código
- [ ] Un componente con clases utilitarias de Tailwind se renderiza con esos estilos aplicados
- [ ] La URL de la API se lee de VITE_API_URL en un único módulo tipado, y la aplicación falla al arrancar con un mensaje claro en español si esa variable falta
- [ ] Existen las carpetas features/, components/, lib/, hooks/ y pages/ bajo frontend/src/
- [ ] El router monta las rutas previstas, y una ruta desconocida muestra una pantalla de página no encontrada escrita en español

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-001', () => { ... })

Así un `grep SPEC-001` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
