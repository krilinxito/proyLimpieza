---
id: SPEC-KRILINXI-065
name: Estadísticas en una sola columna, con gráficos que se agrandan
slug: estadisticas-una-columna
status: finished
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/src/features/estadisticas/**
  - frontend/src/components/ModalConfirmacion.tsx
  - frontend/src/components/iconos.tsx
  - frontend/src/test/arquitectura.test.ts
  - frontend/DESIGN.md
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-063
tests:
  - frontend\src\features\estadisticas\components\PantallaEstadisticas.test.tsx
  - frontend\src\test\arquitectura.test.ts
---

## Descripción

El tablero de /estadisticas reparte sus tarjetas en dos columnas desde 1024 px, y la de ropa recibida ocupa la fila entera: el orden de lectura salta y cada gráfico queda chico. Se pasa a una sola columna, una tarjeta debajo de otra, siempre con el mismo ancho. Cada tarjeta con gráfico gana un botón "Agrandar" que abre el gráfico en una vista grande dentro de un diálogo (no ocupa toda la pantalla), con más interacción que la tarjeta: apagar y prender series, ver el desglose del día o del dato elegido, acercar un rango de días y ver la tabla completa. La vista grande usa los mismos datos que la tarjeta: no pide nada nuevo a la API, así que abre al instante. Se cierra con una X, con Escape o tocando afuera, y devuelve el foco al botón que la abrió. Depende de la SPEC-KRILINXI-063 porque toca los mismos archivos de estadísticas (los gráficos con Recharts, sus paletas y sus tests).

## Criterios de aceptación

- [ ] El tablero muestra todas sus tarjetas en una sola columna en cualquier ancho de pantalla: no queda ninguna regla de dos columnas (`lg:grid-cols-2`) ni tarjeta que ocupe una fila distinta (`entera`); un test lo comprueba y los de arquitectura vigilan que no vuelva.
- [ ] Cada tarjeta con gráfico tiene un botón "Agrandar", con ícono y nombre accesible que dice cuál gráfico (por ejemplo "Agrandar: Cobrado por día"); al activarlo se abre un diálogo (`role="dialog"` con el nombre del gráfico) con ese gráfico en tamaño grande, sin ocupar toda la pantalla.
- [ ] El diálogo se cierra con el botón de cerrar, con la tecla Escape y tocando fuera; al cerrarse, el foco vuelve al botón "Agrandar" que lo abrió, y mientras está abierto el foco no sale de él.
- [ ] La vista grande usa los mismos datos que la tarjeta y no hace ningún pedido a la API; un test lo comprueba contando los pedidos antes y después de abrirla.
- [ ] En la caja día a día por forma de pago, la leyenda de la vista grande permite apagar y prender cada serie (efectivo, QR, tarjeta) con el teclado y con el dedo; una serie apagada deja de dibujarse y la leyenda dice en palabras cuál está apagada, sin depender solo del color.
- [ ] Al elegir un día o un dato en la vista grande, un panel junto al gráfico lista su desglose completo en palabras (por forma de pago, boletas anuladas, etc.) y esa información también está en una región `aria-live`.
- [ ] En la vista grande de los gráficos por día se puede elegir un rango "desde" y "hasta" dentro de los días ya cargados para acercarlo, y hay un botón para volver a ver todos; unas fechas al revés piden revisarlas en palabras y no cambian el gráfico.
- [ ] La vista grande tiene un botón "Ver la tabla" que muestra a la vista los mismos números que lee el lector de pantalla, con las mismas cifras que el gráfico.
- [ ] La vista grande funciona en el tema claro y en el oscuro, sin colores nuevos fuera de `index.css`, en una pantalla angosta (celular) sin salirse del ancho, y sin jerga en pantalla.
- [ ] Los números siguen sumándose en Postgres: el frontend no suma dinero (salvo la excepción ya declarada), y el DESIGN.md, el CLAUDE.md y los tests de arquitectura reflejan el cambio.
- [ ] Tests con el id de esta spec y la suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-065', () => { ... })

Así un `grep SPEC-KRILINXI-065` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
