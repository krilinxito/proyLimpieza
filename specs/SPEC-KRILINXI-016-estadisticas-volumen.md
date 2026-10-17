---
id: SPEC-KRILINXI-016
name: Estadísticas de volumen, productividad y clientes
slug: estadisticas-volumen
status: in-progress
owner: krilinxito
created: 2026-10-16
scope:
  - frontend/src/features/estadisticas/**
  - frontend/src/test/**
priority: medium
depends_on:
  - SPEC-KRILINXI-015
tests: []
---

## Descripción

Completa el panel de SPEC-KRILINXI-015 con las métricas que el backend ya expone: `/api/estadisticas/volumen` y `/productividad` (SPEC-ALE186-013) y `/clientes` (SPEC-ALE186-017, paginada).

Usa el mismo patrón online, los mismos filtros de período y sucursal y el mismo aviso sin conexión. No agrega rutas: son secciones del mismo `/estadisticas`.

## Criterios de aceptación

- [ ] El sistema muestra el volumen de órdenes por día del período elegido, incluidos los días en 0 tal como llegan de la API
- [ ] El sistema muestra la productividad por persona y por sucursal, con una fila por cada sucursal cuando una persona trabajó en más de una
- [ ] El sistema muestra las atenciones de cada cliente por sucursal, con cuánto pagó y su última visita
- [ ] El sistema pagina la lista de clientes con 'Ver más' o con anterior y siguiente, pidiendo a la API la página que corresponde
- [ ] El sistema vuelve a pedir las tres métricas cuando cambian el período o la sucursal, con los mismos filtros que el resto del panel
- [ ] El sistema muestra 'Las estadísticas necesitan conexión' en estas secciones cuando no hay internet, igual que el resto del panel
- [ ] El sistema no muestra palabras del sistema (sinJerga) en las secciones nuevas

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-016', () => { ... })

Así un `grep SPEC-KRILINXI-016` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
