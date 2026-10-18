---
id: SPEC-KRILINXI-026
name: Estadísticas como tablero con gráficos
slug: estadisticas-tablero
status: in-progress
owner: krilinxito
created: 2026-10-17
scope:
  - frontend/src/features/estadisticas/**
  - frontend/src/index.css
  - frontend/src/test/tema.test.ts
  - frontend/src/test/arquitectura.test.ts
  - frontend/src/test/estadisticasDePrueba.ts
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-024
tests: []
---

## Descripción

Quinta spec de la ola estética. `/estadisticas` hoy es una sucesión de tablas y números (58 clases de paleta cruda, la feature con más). El admin la abre para entender cómo va el negocio de un vistazo, y una tabla no se lee de un vistazo. Esta spec la convierte en un **tablero (dashboard)**: arriba, una fila de indicadores con los números que importan; debajo, **gráficos** para cada métrica de la API; y debajo de cada gráfico, la tabla de siempre como respaldo.

Cada dato va en la forma que su pregunta pide (guía de visualización de datos): los indicadores como **tarjetas de número** (no un gráfico de una barra); los ingresos por sucursal como **barras horizontales apiladas por método de pago** (parte del todo, cuatro métodos: con rótulos directos además de la leyenda); el volumen por día como **columnas** a lo largo del período (tendencia en el tiempo, una sola serie); los saldos y la ropa sin recoger **por antigüedad** como barras horizontales de un solo tono, más oscuro cuanto más viejo; la productividad como **barras horizontales por persona**. Nada de tortas ni de dos ejes.

Los gráficos se dibujan en SVG dentro del proyecto (`features/estadisticas/components/graficos/`), sin librería: no suman peso ni dependencias, abren sin internet y no necesitan permisos nuevos en la política de seguridad (SPEC-KRILINXI-020: nada de `style={…}`; los tamaños se dan con atributos del SVG). Los colores de las series son tokens nuevos del tema (`--color-serie-1` a `--color-serie-4` y una rampa de un tono para la antigüedad), validados para daltonismo y con contraste suficiente contra la superficie. El admin usa la app en una PC o una tablet, así que **ningún dato depende de pasar el mouse**: los valores se rotulan directamente y, con el dedo o el teclado, cada barra muestra su detalle. Lo demás no cambia: los mismos pedidos a la API (`usePanel`, `usePedidoOnline`), el mismo filtro, "Las estadísticas necesitan conexión" sin internet y ningún número inventado.

## Criterios de aceptación

- [ ] Arriba del tablero hay una fila de indicadores, cada uno una tarjeta con su nombre y su número en tamaño grande: ingresos del período (en Bs), saldo pendiente (en Bs y cuántas boletas), ropa sin recoger (cuántas boletas) y boletas recibidas en el período; los montos se muestran tal como los manda el servidor, sin sumarlos en el frontend.
- [ ] Los ingresos se muestran como barras horizontales, una por sucursal, apiladas por método de pago con un color por método en orden fijo; hay leyenda, y cada tramo con monto se rotula con su valor; un método sin ingresos no ocupa lugar.
- [ ] El volumen se muestra como columnas, una por día del período (también los días en cero), con el eje de fechas legible (no un rótulo por día si no entran) y el total del período escrito arriba del gráfico.
- [ ] Los saldos pendientes y la ropa sin recoger se muestran por antigüedad ("Hasta 7 días", "De 8 a 30 días", "Más de 30 días") como barras horizontales de un solo tono, más oscuro cuanto más antiguo, con la cantidad (y el monto, en los saldos) rotulados en cada barra.
- [ ] La productividad se muestra como barras horizontales por persona y sucursal, ordenadas de mayor a menor por boletas recibidas, con el nombre y el número rotulados.
- [ ] Ningún dato se ve solo pasando el mouse: cada barra y columna se puede enfocar con el teclado o tocar, y al hacerlo muestra su detalle en palabras; cada gráfico tiene un nombre accesible y, para el lector de pantalla, su tabla de datos con los mismos números.
- [ ] Debajo de cada gráfico sigue la tabla (o lista) de detalle de hoy —las boletas con saldo, la ropa sin recoger, las personas, los clientes atendidos paginados— con los mismos textos.
- [ ] Un período sin datos muestra "No hay datos en este período" en lugar de un gráfico vacío; sin conexión, la pantalla sigue diciendo "Las estadísticas necesitan conexión" y no dibuja ningún gráfico ni número.
- [ ] Los colores de las series y de la rampa de antigüedad son tokens de `index.css`; `test/tema.test.ts` comprueba que cada uno llegue a 3:1 contra la superficie, y la paleta de series pasa el validador de daltonismo de la guía de visualización (diferencia mínima entre vecinas), cuyo resultado queda anotado en la bitácora.
- [ ] Los gráficos son SVG del proyecto, sin librerías nuevas en `package.json` y sin `style={…}` (lo vigila el test de arquitectura); los valores de cada barra se calculan en funciones puras con su propio test (escala, ancho de cada tramo, días sin datos).
- [ ] La regla de la paleta cruda de `test/arquitectura.test.ts` cubre también `features/estadisticas/`, y la regla de que las estadísticas no salen de la base local (SPEC-KRILINXI-015) sigue pasando.
- [ ] Toda la suite existente pasa; los tests que buscaban un número o un texto que ahora también aparece en un gráfico lo buscan dentro de su sección.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-026', () => { ... })

Así un `grep SPEC-KRILINXI-026` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
