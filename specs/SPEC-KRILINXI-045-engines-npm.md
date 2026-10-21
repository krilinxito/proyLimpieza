---
id: SPEC-KRILINXI-045
name: Versiones fijas de Node y npm para el monorepo
slug: engines-npm
status: finished
owner: krilinxito
created: 2026-10-21
scope:
  - package.json
  - .npmrc
  - .nvmrc
  - package-lock.json
  - CLAUDE.md
priority: low
depends_on: []
tests:
  - backend\tests\unit\versionesDelEntorno.test.ts
---

## Descripción

Cada máquina del equipo instala con una versión distinta de npm, y el package-lock.json cambia según quién corra `npm install` (por ejemplo, npm 11.19 borra 26 líneas `"peer": true` de los paquetes @esbuild/*). Esos cambios ensucian los PRs sin que el código haya cambiado. Se acuerda una sola versión: Node 24 (LTS activa) con el npm 11 que trae, declarada en `engines` de la raíz, con `engine-strict=true` en `.npmrc` para que `npm install` falle con un mensaje claro si la versión no coincide, y un `.nvmrc` con la versión de Node para quien use nvm. El lock se regenera una vez con esa versión, en un commit aparte, y CLAUDE.md (§4 y §13) documenta el acuerdo. No se tocan las dependencias: solo el campo `peer` y lo que npm 11 normalice del lock.

## Criterios de aceptación

- [ ] El package.json de la raíz declara engines.node como >=24 <25 y engines.npm como >=11 <12
- [ ] Un .npmrc en la raíz tiene engine-strict=true, y `npm install` con otra versión de Node o npm falla diciendo qué versión se necesita
- [ ] Un .nvmrc en la raíz indica la versión mayor de Node (24)
- [ ] El package-lock.json queda regenerado con npm 11: correr `npm install` otra vez con esa versión no produce ningún cambio en el lock
- [ ] El regenerado no cambia ninguna versión resuelta de dependencias (el diff del lock solo toca campos como `peer`)
- [ ] `npm test` y `npm run check` siguen igual de verdes en una máquina con Node 24 y npm 11
- [ ] CLAUDE.md explica la versión acordada, cómo instalarla y por qué el lock debe commitearse solo con esa versión

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-045', () => { ... })

Así un `grep SPEC-KRILINXI-045` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
