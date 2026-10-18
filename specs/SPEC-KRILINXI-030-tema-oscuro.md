---
id: SPEC-KRILINXI-030
name: Tema oscuro
slug: tema-oscuro
status: draft
owner: krilinxito
created: 2026-10-18
scope:
  - frontend/src/index.css
  - frontend/src/test/tema.test.ts
  - frontend/src/components/marco/**
  - frontend/src/pages/Marco.tsx
  - frontend/src/lib/tema*
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

Hoy la app tiene un solo tema, claro. Todo pinta con los tokens de `src/index.css` (`@theme`, SPEC-KRILINXI-022) y ninguna pantalla usa la paleta cruda, así que un tema oscuro es redefinir esos tokens, no tocar pantalla por pantalla.

La app sigue la preferencia de la tablet (`prefers-color-scheme`) y en la cabecera hay un botón para elegir a mano (claro u oscuro), que se recuerda en el dispositivo. La CSP no permite scripts en línea (SPEC-KRILINXI-020), así que el tema se aplica sin un `<script>` en `index.html`: la base sale de la media query de CSS, y la elección manual la aplica la app al arrancar. Los gráficos de estadísticas (`serie-*`, `antiguedad-*`) también tienen su versión oscura.

## Criterios de aceptación

- [ ] Sin elección manual, la app se ve oscura cuando la tablet está en modo oscuro y clara cuando no, sin recargar.
- [ ] La cabecera tiene un botón con texto ("Tema oscuro" / "Tema claro") que cambia el tema al momento; la elección se recuerda al recargar y al volver a abrir la app, también sin internet.
- [ ] Cada token de color tiene su valor oscuro, y `test/tema.test.ts` comprueba el contraste AA de cada par texto/fondo en los dos temas (también los colores de los gráficos y el anillo de foco).
- [ ] Ningún componente cambia: todos siguen pintando solo con los tokens del tema (la regla de arquitectura de SPEC-KRILINXI-027 sigue pasando).
- [ ] La app compilada no agrega scripts ni estilos en línea: la CSP de SPEC-KRILINXI-020 no cambia.
- [ ] Salir de la cuenta no borra la elección del tema: es de la tablet, no de la persona.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-030', () => { ... })

Así un `grep SPEC-KRILINXI-030` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
