---
id: SPEC-KRILINXI-063
name: Estadísticas con más color y gráficos interactivos
slug: estadisticas-colores
status: draft
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/src/features/estadisticas/**
  - frontend/src/index.css
  - frontend/src/test/tema.test.ts
  - frontend/src/test/arquitectura.test.ts
  - frontend/src/pwa/csp.ts
  - frontend/DESIGN.md
  - frontend/package.json
priority: medium
depends_on:
  - SPEC-KRILINXI-055
tests: []
---

## Descripción

Las tarjetas de estadísticas usan pocos colores y gráficos SVG propios, sin librería. Se quiere un tablero más vistoso e interactivo. La spec empieza decidiendo con la persona si se adopta una librería de gráficos (por ejemplo Recharts o ECharts) o se mejoran los SVG propios, midiendo peso para el precache de la PWA, compatibilidad con la CSP (sin style en línea ni eval), uso sin internet y accesibilidad (tabla equivalente y teclado). Si se adopta una librería, se cambia el test de arquitectura que hoy vigila la ausencia de librerías. Los colores nuevos van en el tema en claro y oscuro, validados para daltonismo.

## Criterios de aceptación

- [ ] Antes de implementar se acuerda con la persona la librería o la mejora de los SVG, y la decisión queda en la bitácora con el peso que suma al build.
- [ ] Cada tarjeta del tablero usa una paleta propia y distinguible, definida solo en index.css en los dos temas, con su par de contraste en tema.test.ts y validada para daltonismo con todas sus parejas.
- [ ] Los gráficos responden al toque y al foco con teclado (detalle del dato, resaltado), sin depender del mouse, y conservan su tabla equivalente para lector de pantalla.
- [ ] La app compilada sigue abriendo sin internet, el precache incluye lo nuevo dentro del tope del build, y la CSP no se afloja salvo que la decisión lo justifique y quede escrito.
- [ ] Si se adopta una librería, el test de arquitectura que vigilaba los gráficos propios se actualiza con el motivo, y el DESIGN.md y design.json describen el sistema nuevo.
- [ ] Los números siguen sumándose en Postgres: el frontend no suma dinero (salvo la excepción ya declarada), y la suite completa queda en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-063', () => { ... })

Así un `grep SPEC-KRILINXI-063` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
