---
id: SPEC-KRILINXI-015
name: 'Panel de estadísticas: ingresos, saldos y ropa sin recoger'
slug: estadisticas-panel
status: finished
owner: krilinxito
created: 2026-10-16
scope:
  - frontend/src/features/estadisticas/**
  - frontend/src/pages/rutas.tsx
  - frontend/src/lib/api.ts
  - frontend/src/lib/api.test.ts
  - frontend/src/test/**
  - CLAUDE.md
priority: high
depends_on: []
tests:
  - frontend/src/features/estadisticas/api/estadisticasApi.test.ts
  - frontend/src/features/estadisticas/components/PantallaEstadisticas.test.tsx
  - frontend/src/features/estadisticas/periodo.test.ts
  - frontend/src/test/apiFalsa.ts
  - frontend/src/test/arquitectura.test.ts
  - frontend/src/test/estadisticasDePrueba.ts
---

## Descripción

`/estadisticas` es hoy un `EnConstruccion`. El backend ya expone `/api/estadisticas/ingresos`, `/saldos` y `/sin-recoger` (SPEC-ALE186-008, que fija la forma de cada respuesta), solo para ADMIN.

Esta spec arma la pantalla y, sobre todo, **fija el patrón online del admin** que copiarán las estadísticas de volumen, el personal y la auditoría: es la única excepción a 'todo se lee de SQLite local' (CLAUDE.md §8). Lee por `lib/api`, filtra por período (días de Bolivia) y sucursal, muestra los montos tal como llegan del servidor (texto, sin sumar en el front) y, sin conexión, dice 'Las estadísticas necesitan conexión' en vez de mostrar ceros.

## Criterios de aceptación

- [ ] El sistema muestra el panel de estadísticas en /estadisticas al ADMIN, en lugar del aviso de pantalla en construcción
- [ ] El sistema pide a la API los ingresos, los saldos pendientes y la ropa sin recoger con el período y la sucursal elegidos
- [ ] El sistema muestra por defecto los ingresos del día de hoy en Bolivia y, para saldos y ropa sin recoger, todo lo pendiente hasta hoy, de todas las sucursales; al elegir fechas, las tres secciones usan esas (decidido al implementar: saldos y sin recoger filtran por la fecha de entrada de la ropa, y con "hoy" no se vería nada de lo que lleva días esperando)
- [ ] El sistema muestra los ingresos por sucursal y por forma de pago, con los totales tal como llegan de la API, sin sumarlos en el front
- [ ] El sistema muestra los saldos pendientes y la ropa sin recoger con su antigüedad en días
- [ ] El sistema muestra 'Las estadísticas necesitan conexión' y ningún número cuando no hay internet, y vuelve a cargar al recuperar la conexión
- [ ] El sistema muestra un mensaje que dice qué hacer, sin códigos, cuando la API responde un error
- [ ] El sistema muestra un estado vacío en palabras ('No hubo cobros en este período') cuando la API devuelve listas vacías
- [ ] El sistema no lee estas métricas de la base local ni de PowerSync (lo vigila un test)
- [ ] El sistema no muestra palabras del sistema (sinJerga) en el panel

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-015', () => { ... })

Así un `grep SPEC-KRILINXI-015` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
