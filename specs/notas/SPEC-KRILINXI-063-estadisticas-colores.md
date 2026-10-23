---
id: SPEC-KRILINXI-063
spec: specs/SPEC-KRILINXI-063-estadisticas-colores.md
explica: []
---

# SPEC-KRILINXI-063 — Estadísticas con más color y gráficos interactivos

## Qué se construyó

El tablero de `/estadisticas` tiene un color propio por tarjeta y gráficos de tiempo más vistosos: la ropa recibida por día (columnas) y la caja día a día (líneas) se dibujan con Recharts y se recorren con el teclado o con el dedo. Lo que se debe tiene su propia rampa de rosa, distinta de la ropa sin recoger.

## La decisión que pedía la spec (criterio 1)

Antes de escribir código se acordó con la persona a cargo. Se le presentaron tres caminos y **eligió adoptar Recharts** (contra mi recomendación de mejorar los SVG propios, que era la opción sin peso nuevo). Quedan escritos los números que se midieron, porque la decisión es suya y conviene poder revisarla:

| | antes | después | diferencia |
|---|---|---|---|
| `dist/assets/index-*.js` | 481,94 kB (145,65 kB comprimido) | 857,14 kB (254,31 kB comprimido) | +375 kB (+109 kB comprimido) |
| precache (`injectManifest`) | 37 entradas, 8269,90 KiB | 37 entradas, 8637,50 KiB | +367,6 KiB, sin archivos nuevos |

El tope del precache es de 5 MB **por archivo** (`vite.config.ts`); el mayor sigue siendo un WASM de PowerSync de 2,5 MB, así que el bundle de la app (0,84 MB) no está cerca. No se partió en trozos (`React.lazy` en `/estadisticas`): lo evitaría en la primera carga de un empleado, pero toca `pages/rutas.tsx`, fuera del alcance de la spec; queda como candidato.

Qué pesó contra las otras dos: ECharts (≈1 MB) dibuja en canvas, y su tabla para lector de pantalla y el foco con teclado habría que armarlos aparte. Mejorar los SVG propios era lo más liviano, pero la persona prefirió una librería con tooltip, animación y teclado ya hechos.

## Cómo funciona, paso a paso

Un caso: el admin abre la caja día a día y recorre los días con el teclado.

1. `SeccionTendencia` (`features/estadisticas/components/SeccionTendencia.tsx`) le pasa a `Grafico` los datos y un dibujo: `(elegir, seleccionado) => <Lineas … />`. `Grafico` (`graficos/Grafico.tsx`) tiene el detalle elegido y lo muestra en una región `aria-live`; es lo que ya hacía desde la 026.
2. `Lineas` (`graficos/Lineas.tsx`) arma una fila por día y una `<Line>` por serie dentro de un `LineChart` de Recharts. Cada línea pinta con `currentColor`, y el color sale de una clase del tema (`text-caja`, o `text-serie-1` por forma de pago).
3. Recharts pone el gráfico en el orden de tabulación (`svg role="application" tabindex=0`). Con las flechas pasa de un día a otro y le pide al `Tooltip` que se dibuje.
4. El contenido del tooltip es `DetalleFlotante` (`graficos/DetalleFlotante.tsx`): con un efecto escribe el texto del día en `elegir`, y además flota junto al punto (con `aria-hidden`, porque el lector ya lo oyó arriba). El mismo camino sirve para el mouse y para el toque.
5. La tabla `sr-only` con los mismos números sigue en `Grafico`, y los tests leen de ahí los valores.

## Dónde encaja en la arquitectura

La librería queda detrás de dos piezas (`Columnas` y `Lineas`) dentro de `graficos/`. El test de arquitectura que decía "los gráficos no traen librerías" ahora dice "los gráficos usan Recharts y nada más de afuera, y solo desde esa carpeta": una pantalla que importara `recharts` directo lo rompe. Los números siguen sumándose en Postgres: los gráficos solo dibujan lo que reciben, sin sumar dinero.

## Fundamentos

Nada nuevo que explicar a fondo: son los patrones ya escritos en la 026 (el `Grafico` con su tabla y su región en vivo) y en la 036 (la tabla oculta va en un contenedor, no en la `<table>`).

**Ya explicado antes:** el `Grafico` con su tabla y su región en vivo → SPEC-KRILINXI-026 (`specs/notas/SPEC-KRILINXI-026-estadisticas-tablero.md`); la tabla oculta en un contenedor → SPEC-KRILINXI-036.

## Decisiones y por qué

- **La política de seguridad no se aflojó (criterio 4).** El `CLAUDE.md` decía "nada de `style={…}`, el navegador lo ignora". Recharts escribe estilos, así que había que comprobarlo de verdad, no creerlo: se armó una página de prueba con los mismos componentes, se compiló con el plugin de CSP del proyecto (`style-src 'self'`) y se abrió en Edge. Resultado: **cero violaciones**, y los estilos que pone Recharts a su contenedor sí se aplican (alto 192 px, `position: relative`), porque React y Recharts los asignan con JavaScript (`element.style`), que la política deja pasar; lo que bloquea es un `style="…"` escrito en el HTML. Esa prueba pasó por el navegador y no por los tests: **jsdom no aplica la CSP**, y por eso `CLAUDE.md` §4 pide la prueba a mano antes de un release.
- **El test de "ningún estilo en línea" se acotó, no se borró.** Ahora acepta solo lo que cuelga de `.recharts-responsive-container`; cualquier `style` que escriba el proyecto sigue fallando.
- **Colores: clase del tema + `currentColor`** y no un `fill="var(--…)"`: no escribe ningún color en el componente y sigue al tema claro y oscuro. Se vio en Edge que funciona. (Antes de esa prueba, en una página sin las clases generadas, las columnas salían negras: el escáner de Tailwind no veía `text-ropa`. En la app, que escanea todo `src/`, no pasa, pero es una trampa si alguien arma una página de prueba aparte.)
- **Las barras horizontales no pasaron a Recharts.** Cada fila lleva el nombre, el monto y, en las apiladas, el desglose por forma de pago: texto que en un gráfico de librería habría que reconstruir. Ganaron la paleta nueva y el resaltado de la barra elegida (las demás se apagan).
- **El resaltado** es opacidad (`fillOpacity`, o `opacity-60` en las filas), no un segundo color: un segundo color por tarjeta habría que validarlo contra el daltonismo y contra cada tema.
- **Sin animación para quien la pidió quitar** (`prefers-reduced-motion`) ni en los tests (`animar()`): una columna creciendo haría depender cada test del reloj.

## Cómo se eligieron los colores (criterio 2)

El método es el de la guía de visualización: se calcula con su validador, no a ojo.

- **Matices de tarjeta** (caja `#0e94ba`, ropa `#b37903`, personas `#ca549d`, clientes `#928a07`): se buscó por fuerza bruta la combinación de matices que mejor separa a los **vecinos del tablero** (caja–deuda, ropa–sin recoger, ropa–personas, sin recoger–personas, personas–clientes, sin recoger–clientes). La peor pareja separa **11,9** (ΔE en OKLab ×100, protanopía y deuteranopía simuladas, modelo de Machado) y **más de 21** con visión normal. Todos llegan a 3:1 contra la superficie, en claro y en oscuro (`tema.test.ts`).
- **Rampa de deuda** (`#e06876`, `#b93c50`, `#7b2432` en claro; `#cd5766`, `#e9878f`, `#feb9bd` en oscuro): pasa la prueba de rampa ordinal del validador (`--ordinal`, luminosidad monótona, pasos visibles, extremo claro con contraste) en los dos temas, y en `tema.test.ts` resalta de a un paso.
- **Lo que no se pudo cumplir como está escrito:** la spec pide "todas sus parejas" **dentro de cada paleta**. Las paletas de más de una serie (formas de pago, ya validadas en la 055) y las rampas cumplen. Pero **los cuatro matices de las tarjetas, todos contra todos, no pasan** (el validador da ΔE 0,6 entre el ámbar y el oliva con deuteranopía): son tarjetas distintas, que no comparten gráfico, y el propio validador documenta que con más de tres series no hay paleta que pase en todas las parejas. Por eso se midieron los vecinos y no todos contra todos. Cada tarjeta, además, rotula sus datos en texto y tiene su tabla.
- Los matices valen igual en claro y en oscuro (como ya hacían las series): todos llegan a 3:1 contra las dos superficies.

## Los tests

Se reescribieron los de la sección de volumen y de la tendencia (`PantallaEstadisticas.test.tsx`), porque ya no hay un botón por columna: ahora se lee de la tabla `sr-only`, se cuenta lo que dibuja Recharts (`.recharts-bar-rectangle path`, `circle.recharts-line-dot`) y el teclado se prueba con las flechas sobre el `svg role="application"` (jsdom no mide anchos, así que el mouse no se puede simular). Se agregaron los de colores en `tema.test.ts` y los de arquitectura. Lo que **no** se prueba en jsdom: tocar con el dedo, el tooltip flotante en su lugar, la animación y la política de seguridad; esos se miraron a mano en Edge.

## Si mañana tenés que tocar esto

- Para otro gráfico del tiempo, copiá `Columnas` y su patrón: `ResponsiveContainer` con `initialDimension` (así se dibuja también en los tests), eje sin `style`, el detalle por `DetalleFlotante`.
- Un color nuevo de tarjeta va en los dos bloques de `index.css`, en `tema.test.ts`, en `DESIGN.md` y en su `design.json`, **y** se vuelve a correr el validador contra los vecinos.
- Antes de un release: la prueba a mano de `CLAUDE.md` §4 (`npm run build && npx vite preview`) mirando que no haya errores de Content Security Policy con las estadísticas abiertas.
