---
id: SPEC-KRILINXI-065
spec: specs/SPEC-KRILINXI-065-estadisticas-una-columna.md
explica:
  - los mismos hijos dibujados en dos lugares (vista grande por contexto)
---

# SPEC-KRILINXI-065 — Estadísticas en una sola columna, con gráficos que se agrandan

## Qué se construyó

El tablero de `/estadisticas` ya no reparte sus tarjetas en dos columnas: van una debajo de otra, siempre del mismo ancho. Cada tarjeta con gráfico tiene un
botón "Agrandar" que lo abre en un diálogo grande, con más para hacer: ver el desglose de un día o un dato, ver la tabla, acercar a unos días y apagar o prender
formas de pago. Lo que ve la vista grande es exactamente lo de la tarjeta: no pide nada nuevo al servidor.

## Cómo funciona, paso a paso

Se sigue "¿Cómo vino la caja día a día?" (la tarjeta `Cobrado por día`), de tocar "Agrandar" a cerrar.

1. `SeccionTendencia` pide sus datos una vez (`useIngresosPorDia`) y arma su tarjeta con `<SeccionPanel … ampliable={conDatos}>` (`SeccionTendencia.tsx`).
   `ampliable` es `false` mientras carga, si falla o si no hay nada cobrado: agrandar nada no sirve.
2. `SeccionPanel` (`SeccionPanel.tsx:54`) dibuja el botón "Agrandar" cuyo nombre accesible dice cuál gráfico ("Agrandar: Cobrado por día": la palabra visible más un
   `sr-only` con el nombre). Es un `<button>` propio y no `Boton`, porque al cerrar hay que devolverle el foco y `Boton` no entrega su elemento.
3. Al tocarlo, `grande` pasa a `true` (`:35`) y el panel dibuja **dos veces los mismos `children`**: en la tarjeta (`:70`) y dentro de `VistaGrande` (`:73`).
4. `VistaGrande` (`VistaGrande.tsx:84`) envuelve esos hijos en `GrandeContext.Provider value`: dentro de él, `useGrande()` devuelve `true` (`graficos/grande.ts`).
   El diálogo es modal como el cajón del menú: el foco entra a "Cerrar", Tab no se escapa, Escape y tocar fuera lo cierran, y `SeccionPanel` devuelve el foco al botón.
5. Cada pieza que sabe hacer algo más en grande lo pregunta con `useGrande()`:
   - `Grafico` (`Grafico.tsx:50`) cambia el `aria-live` de debajo por un panel "Detalle" junto al dibujo, con el **desglose** del dato elegido (`desglose`, `:55`), y
     suma "Ver la tabla": la misma `<table>` pasa de `sr-only` a visible (`:89`), no se dibuja una copia.
   - `Lineas` y `Columnas` miden 360 en vez de 192 de alto.
   - `Detalle` (las listas "Ver el detalle") no se dibuja: `Detalle.tsx:14`.
   - `Tendencia` (`SeccionTendencia.tsx:73`) recorta los días con el rango elegido y, con "Por forma de pago", la leyenda se vuelve botones que apagan una serie.
6. Elegir un día lo escribe en el panel: `DetalleFlotante` llama a `elegir(detalle)` con el texto del día, y `Grafico` lo busca en `desglose` para sacar las cuatro líneas
   ("Total", "Efectivo", "Pago con QR", "Tarjeta"), también las que están en cero.
7. El rango "Desde / Hasta" vive en `useRangoDeDias`: guarda lo **elegido** (puede estar al revés mientras se escribe) y lo **aplicado**, que solo cambia si `desde ≤ hasta`
   (`useRangoDeDias.ts:31`). Con las fechas al revés la pantalla lo dice en palabras y el gráfico se queda como estaba.
8. "Cerrar": `SeccionPanel` baja `grande` y el diálogo desaparece, junto con sus estados (rango, series apagadas): la tarjeta nunca los vio.

## Dónde encaja en la arquitectura

- Todo está dentro de `features/estadisticas/`: la vista grande no es una pieza compartida de `components/` porque depende de cómo se dibujan los gráficos de esta feature.
- **Ninguna pantalla consulta la API por su cuenta** (CLAUDE.md §5): los pedidos siguen en los hooks de cada sección (`useIngresosPorDia`, `useProductividad`…), arriba de los hijos.
  La vista grande no puede pedir nada porque está *debajo* de ellos. Dos tests lo cuidan: uno cuenta los pedidos antes y después de abrirla, y otro de arquitectura impide que
  `VistaGrande` importe la API o un hook de pedidos.
- Los números siguen sumándose en Postgres (§8): el rango solo **recorta** días que ya vinieron sumados, y el desglose de cada día lo manda el servidor. No hay ninguna suma nueva de dinero.
- Es una lectura mía, no una regla del repo: poner la vista grande en `SeccionPanel` y no en cada sección evita que un gráfico nuevo tenga que acordarse de ofrecerla; solo declara `ampliable`
  (un test de arquitectura lo exige para toda `Seccion…`).

## Fundamentos

**Los mismos hijos dibujados en dos lugares (vista grande por contexto).** Un componente de React puede recibir `children` y dibujarlos donde quiera, también **más de una vez**: cada lugar
monta su propia copia, con su propio estado interno, pero partiendo de los mismos datos (las variables del componente de arriba). Para que esa segunda copia se comporte distinto
—más alta, con más herramientas— no se le pasan props: se la envuelve en un **contexto** (`GrandeContext`) y cada pieza pregunta con un hook si está en grande. Sin este patrón habría
que escribir una vista grande por cada gráfico, con el riesgo de que dos copias del mismo dibujo se desincronicen, y cada gráfico nuevo tendría que acordarse de hacerla. Aquí:
`SeccionPanel.tsx:70` y `:73` (el mismo `{children}`), `graficos/grande.ts` (el contexto) y `Grafico.tsx:50` (quien lo lee).

**Ya explicado antes:** el contexto de React y su provider → SPEC-KRILINXI-003; el diálogo modal accesible (trampa de foco, Escape, devolver el foco) → SPEC-KRILINXI-023.

## Decisiones y por qué

- **El estado de cada copia es suyo.** El rango y las series apagadas viven dentro del diálogo y se pierden al cerrar; la tarjeta no cambia. Era lo que pedía la spec ("acercar nunca cambia la tarjeta").
  El "¿Cómo verlo?" (el total o por forma de pago), en cambio, sí es el mismo para las dos: su estado está en `SeccionTendencia`, por encima.
- **Dos grupos de botones de radio con el mismo `name` se anulan entre sí**, así que cada copia usa un `name` propio (`useId`). Un test lo comprueba.
- **`Boton` descarta un segundo toque mientras termina el primero** (CLAUDE.md §9: evita cobrar dos veces). En un test que alterna "Ver la tabla" / "Ocultar la tabla" hay que esperar a que
  vuelva a estar habilitado.
- **`lg:col-span-full` y no `lg:col-span-2` dentro de `Grafico`**: es el diseño interno del gráfico en grande, y el test de arquitectura prohíbe `lg:col-span-2` en el tablero para vigilar que
  ninguna tarjeta ocupe una fila distinta.

## Si mañana tienes que tocar esto

- jsdom no mide ni aplica CSS: los tests de ancho (360 px de alto, `max-w-4xl`, `lg:grid-cols-[…]`) comprueban clases y atributos, no cómo se ve. Que el diálogo se vea bien en un celular
  es una prueba a mano.
- Un gráfico nuevo con Recharts va en `graficos/`; para que tenga vista grande basta con ponerlo dentro de un `Grafico` y que su `Seccion…` declare `ampliable`.
- `desglose` es opcional: sin él, el panel de la vista grande dice solo el texto del dato.
