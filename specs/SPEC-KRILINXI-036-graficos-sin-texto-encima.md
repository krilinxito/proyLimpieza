---
id: SPEC-KRILINXI-036
name: El texto de los gráficos no se pisa
slug: graficos-sin-texto-encima
status: finished
owner: krilinxito
created: 2026-10-19
scope:
  - frontend/src/features/estadisticas/components/graficos/**
  - frontend/src/test/arquitectura.test.ts
priority: high
depends_on: []
tests:
  - frontend/src/features/estadisticas/components/Graficos.test.tsx
  - frontend/src/features/estadisticas/components/PantallaEstadisticas.test.tsx
  - frontend/src/test/arquitectura.test.ts
---

## Descripción

En Estadísticas, el nombre de cada gráfico ("Falta cobrar según los días", "Cobrado por sucursal…") aparece encima de la leyenda y de los rótulos, superpuesto. La causa: cada gráfico lleva una tabla con los mismos números solo para el lector de pantalla (`Grafico.tsx`, SPEC-KRILINXI-026), oculta con `sr-only` puesto en la `<table>`; Chrome dibuja el `<caption>` fuera de la caja recortada de la tabla, así que se ve. jsdom no pinta, por eso ningún test lo vio. Además, las barras muestran una costura vertical donde no hay ningún cambio de valor.

## Criterios de aceptación

- [ ] Ningún texto de la tabla para el lector de pantalla se ve en pantalla: el `sr-only` va en un contenedor alrededor de la tabla, no en la `<table>`.
- [ ] El lector de pantalla sigue encontrando la tabla con su nombre y sus números (los tests de SPEC-KRILINXI-026 que leen los valores de la tabla siguen pasando).
- [ ] Un test de arquitectura falla si algún componente pone `sr-only` directamente en una `<table>`.
- [ ] Las barras de un solo valor se dibujan de una pieza, sin costura; las apiladas solo muestran el corte entre un tramo y otro.
- [ ] Revisado a mano en Chrome (como pide CLAUDE.md §4 para lo que jsdom no pinta), en tema claro y oscuro: Cobrado, Falta cobrar, Ropa sin recoger y Ropa recibida sin textos encimados.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-036', () => { ... })

Así un `grep SPEC-KRILINXI-036` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
