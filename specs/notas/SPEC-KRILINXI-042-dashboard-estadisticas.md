---
id: SPEC-KRILINXI-042
spec: specs/SPEC-KRILINXI-042-dashboard-estadisticas.md
explica:
  - details y summary plegar sin javascript
  - una excepcion a una regla escrita donde se rompe
  - una grilla que cambia de columnas por ancho de pantalla
---

# SPEC-KRILINXI-042 — Estadísticas como dashboard

## Qué se construyó

La pantalla de Estadísticas pasó de una columna de secciones a un **dashboard**: arriba los cuatro
indicadores de siempre y, debajo, una grilla de siete tarjetas, cada una con un gráfico que contesta una
pregunta del dueño del negocio ("¿Cuánto se cobró en cada sucursal?", "¿Quiénes son los clientes que más
vienen?"). El detalle en listas (cada boleta, cada persona, cada cliente) sigue ahí, pero plegado en "Ver el
detalle". En el mostrador de una tablet se ve de un vistazo; en un celular, una tarjeta por fila.

## Cómo funciona, paso a paso

El recorrido de la pantalla cuando el admin la abre y llegan los datos:

1. **La pantalla pide el panel y decide qué dibujar.** `PantallaEstadisticas` usa `usePanel(filtro)` (sin cambios) y,
   con el panel listo, dibuja los indicadores y una grilla (`PantallaEstadisticas.tsx:75`):
   `grid grid-cols-1 gap-6 lg:grid-cols-2`. Sin prefijo es una columna; con `lg:` (1024px, el mismo corte de
   siempre) son dos. Sin internet, sigue diciendo "Las estadísticas necesitan conexión" y no dibuja ninguna tarjeta.
2. **Cada tarjeta es un `SeccionPanel`** (`components/SeccionPanel.tsx:18`): una `<section aria-label>` con un nombre
   corto y fijo ("Cobrado por sucursal"), la **pregunta** como `<h2>`, el período debajo ("De hoy") y el contenido.
   La `<section>` es `grid` para que la tarjeta se estire al alto de la de al lado (`:32`), y la de ropa recibida pasa
   `entera` y ocupa las dos columnas (`lg:col-span-2`): treinta días de columnas no entran en media pantalla.
3. **Siete preguntas, siete gráficos.** Cinco ya existían desde SPEC-KRILINXI-026 (ropa por día, falta cobrar y
   falta recoger por antigüedad, lo que hizo cada persona, cobrado por sucursal) y solo cambiaron su título y su
   tarjeta. Son **nuevos** el de forma de pago y el de clientes.
4. **El gráfico de forma de pago** (`SeccionFormasDePago.tsx`): pide las cuatro sumas a `totalesPorFormaDePago`
   (`totalesPorFormaDePago.ts:19`), las mide con `maximo` (`:37`) y dibuja una barra por forma, con el color que esa forma
   lleva en todo el panel (`COLOR_METODO`). Las cuatro aparecen siempre y en el mismo orden, también la que está en
   cero. El total general, arriba, sigue viniendo tal cual del servidor.
5. **El gráfico de clientes** (`SeccionClientes.tsx:55`): una barra por cliente con "Vino 3 veces". Dibuja los clientes de
   la **página que se está viendo** (así los manda el servidor: de quien más vino a quien menos). La barra de páginas
   va arriba del detalle (`:82`), no adentro: pasar de página cambia el gráfico, no solo la lista.
6. **"Ver el detalle"** (`Detalle.tsx:9`): un `<details>` cerrado por defecto con la lista de siempre adentro. El
   gráfico queda afuera, a la vista. Las tarjetas que se leen enteras en su gráfico (forma de pago, sucursal, ropa
   por día) no tienen detalle que plegar.

## Dónde encaja en la arquitectura

Es **solo frontend** y solo la capa de componentes de `features/estadisticas/`: los datos siguen llegando por
`usePanel` y `useClientesAtendidos` desde `estadisticasApi` (CLAUDE.md §5: un componente no llama a la API). No se
tocó el backend ni un solo endpoint.

Respeta lo que ya fijó la 026: gráficos **SVG del proyecto, sin librería**, con nombre, tabla `sr-only` en un
contenedor y nada que dependa del mouse; y la regla del tema: ningún color nuevo, solo `serie-1…4` y
`antiguedad-1…3`, que ya pasan el validador de daltonismo y el test de contraste en los dos temas. Por eso
`index.css` y `tema.test.ts` quedaron como estaban.

**Lo que no respeta, a propósito, está en "Decisiones": la suma por forma de pago en el frontend.**

## Fundamentos

**`<details>` y `<summary>`: plegar sin JavaScript.** El navegador trae un control de "mostrar y ocultar":
`<details>` es el contenedor y `<summary>` su rótulo (`Detalle.tsx:11`). Cerrado muestra solo el rótulo; con un
toque (o Enter, o Espacio) se abre. Se maneja con teclado y dedo, un lector de pantalla lo anuncia como plegado o
desplegado, y no hay estado de React que mantener ni que se pueda desincronizar. Sin él, habría un `useState` por
tarjeta, un `aria-expanded` a mano y un botón. En un test se comprueba con el atributo `open`
(`PantallaEstadisticas.test.tsx`, "plegado por defecto").

**Una grilla que cambia de columnas por ancho de pantalla.** `grid-cols-1` es una columna; `lg:grid-cols-2` son dos
desde 1024px. El prefijo `lg:` de Tailwind es "solo desde este ancho". Se escribe `grid-cols-1` explícito (y no se
deja el valor por defecto) porque una grilla sin columnas definidas deja que el contenido ensanche la columna, y un
gráfico más ancho que la pantalla del celular la haría desbordar. Con `grid-cols-1` la columna puede encogerse hasta
el ancho de la pantalla. Un hijo que ocupa las dos columnas usa `lg:col-span-2` (`SeccionPanel.tsx:32`).

**Una excepción a una regla, escrita donde se rompe.** CLAUDE.md §8 dice que el frontend no suma dinero, porque la
suma de verdad la hace Postgres sobre `NUMERIC`. Esta spec necesita el total por forma de pago, que la API no da, así
que lo suma el frontend. En vez de esconderlo, se hizo **chico, aislado y avisado**: una sola función en un
archivo propio (`totalesPorFormaDePago.ts`) con un comentario que dice que es la excepción, por qué y cuándo se
borra; en centavos enteros (→ SPEC-ALE186-001, "dinero en centavos enteros"), así que es exacta; un test que
la compara con el `total` que suma Postgres (si alguna vez no coincidieran, el test lo dice); y una línea en
CLAUDE.md §8. Una regla con una excepción que nadie ve deja de ser una regla; con una excepción visible y con fecha
de vencimiento, sigue siéndolo.

**Ya explicado antes:**

- **Alternativa accesible de un gráfico (nombre, tabla `sr-only`, sin mouse)** → SPEC-KRILINXI-026 (`specs/notas/SPEC-KRILINXI-026-estadisticas-tablero.md`)
- **Elegir la forma del gráfico según la pregunta** → SPEC-KRILINXI-026
- **SVG sin `viewBox` (porcentajes como atributos)** → SPEC-KRILINXI-026
- **Regiones de la página (landmarks)** → SPEC-KRILINXI-023 (`specs/notas/SPEC-KRILINXI-023-marco-app.md`)
- **Dinero en centavos enteros** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)

## Decisiones y por qué

- **Sumar por forma de pago en el frontend** (decisión tuya, con la regla de §8 en contra). `/ingresos` trae el desglose por
  forma de pago solo dentro de cada sucursal. *Descartado:* (a) esperar un cambio de backend, que dejaba sin una de las
  siete preguntas a una spec solo de frontend; (b) mostrar el gráfico sin totales, que se lee peor. Queda documentada
  y se borra cuando la API traiga el campo.
- **Cinco gráficos se reusaron tal cual; solo cambia su tarjeta.** Los de la 026 ya cumplían nombre, tabla y
  "sin mouse". Reescribirlos habría sido riesgo sin ganancia.
- **"Cobrado por sucursal" sigue apilado por forma de pago** y el nuevo de forma de pago es de totales. Se superponen
  un poco a propósito: el primero responde "¿dónde?" y deja ver el desglose; el segundo, "¿con qué?".
- **El período en un renglón aparte, no dentro del título.** El título es una pregunta ("¿Cuánta ropa entró cada
  día?") y no cambia al elegir fechas; el renglón de abajo sí ("De hoy", "Del 01/10 al 15/10"). Los tests que antes
  buscaban el título con el período ahora buscan ese renglón.
- **El gráfico de clientes dibuja solo la página actual.** Es la que el servidor ya entrega ordenada; pedir todos los
  clientes para dibujar un ranking completo sería traer miles de filas para un gráfico de diez barras.
- **Sin color nuevo.** La forma de pago usa los cuatro `serie-*` que ya pasaron el validador; el resto, el
  tono único (`COLOR_UNICO`). Por eso el criterio de colores se cumple sin tocar `index.css` ni `tema.test.ts`.

## Los tests

- `totalesPorFormaDePago.test.ts` — la suma: orden fijo, exactitud (0.10 + 0.20), sin sucursales, y que la suma de las
  cuatro formas coincide con el total del servidor.
- `PantallaEstadisticas.test.tsx` — los 30 tests de la 015, 016, 020 y 026 **se conservaron**; los que buscaban el
  título con el período ahora buscan la pregunta o el renglón del período. Y un bloque nuevo, "El panel como dashboard":
  la grilla (una columna / dos desde 1024px, y la tarjeta entera), las siete preguntas (título, gráfico con nombre y
  tabla `sr-only`), el período, el gráfico de forma de pago con su suma, el detalle plegado y que se abre, el
  gráfico de clientes, el filtro que cambia todo a la vez y el estado sin internet.

**Se reusó** el kit de la 026: `simularEstadisticas`, `ingresosDePrueba`, `clientesDePrueba`, `abrirPanel`,
`seccion` y `fila`. **Se agregó** `detalleDe(tarjeta)` dentro del test: encuentra el `<details>` plegado de una tarjeta;
una próxima spec con otro "Ver el detalle" lo mueve a `test/`.

**Revisión a mano pendiente.** jsdom no pinta: no puede ver si un texto queda encima de otro ni si un gráfico se
corta. El último criterio de la spec (Chrome, claro y oscuro, a 360px y a 1280px) tiene que mirarlo una persona;
esta bitácora no lo da por hecho.

## Si mañana tenés que tocar esto

- **Una tarjeta nueva**: un `SeccionPanel` con su `nombre`, su pregunta y su gráfico, y se agrega a la grilla en
  `PantallaEstadisticas.tsx`. El test "debajo de los indicadores hay una grilla" lista las siete por nombre: hay que
  sumarla ahí.
- **Si la API trae el total por forma de pago**: borrá `totalesPorFormaDePago.ts` y su test, leé el campo en
  `SeccionFormasDePago.tsx`, y sacá la excepción de CLAUDE.md §8.
- **Cuidado con `Math.max(0, ...totales)`**: `BarrasHorizontales` mide todas las barras contra el mismo máximo; con
  todo en cero `hayDatos` es falso y se muestra "No hay datos", no un gráfico vacío.
