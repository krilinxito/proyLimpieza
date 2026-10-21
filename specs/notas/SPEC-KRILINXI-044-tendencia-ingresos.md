---
id: SPEC-KRILINXI-044
spec: specs/SPEC-KRILINXI-044-tendencia-ingresos.md
explica:
  - botones debajo de un dibujo que no recibe toques
  - pedir un dato aparte del resto del panel
  - un grafico de lineas sin polyline
---

# SPEC-KRILINXI-044 — La tendencia de lo cobrado en el dashboard

## Qué se construyó

Una tarjeta nueva en el dashboard de Estadísticas: **"¿Cómo vino la caja día a día?"**. Es un gráfico de líneas con lo
cobrado cada día del período, y un selector para verlo **por forma de pago** (una línea por cada una). Cada día se puede
tocar para leer cuánto se cobró y con qué. Usa el endpoint de la 043 y el dashboard de la 042; es solo frontend.

## Cómo funciona, paso a paso

Seguimos lo que pasa cuando el admin abre Estadísticas y llega el panel:

1. **La pantalla suma la tarjeta a la grilla.** `PantallaEstadisticas.tsx:80` monta `<SeccionTendencia filtro=… />` entre las
   de cobrado y la de ropa recibida. Ocupa la fila entera (`entera`): treinta días de línea necesitan ancho.
2. **La tarjeta pide su propio dato.** `SeccionTendencia` (`components/SeccionTendencia.tsx:39`) llama a
   `useIngresosPorDia(filtro)` (`hooks/useIngresosPorDia.ts:15`), que usa `usePedidoOnline` con
   `parametrosHistoria`: **sin fechas elegidas, los últimos 30 días**, no "hoy". Un solo día sería un punto, no una tendencia.
3. **El contrato se comprueba antes de usar la respuesta.** `pedirIngresosPorDia` pasa lo que llegó por
   `leerIngresosPorDia` (`api/estadisticasApi.ts:81`): fechas `YYYY-MM-DD`, los cuatro montos de cada día como texto
   `"125.50"`, ninguno negativo. Si algo no encaja, `RespuestaRara`, y la tarjeta (no todo el panel) lo dice y deja probar de nuevo.
4. **De montos a puntos.** `Tendencia` (`SeccionTendencia.tsx:63`) pasa cada monto a centavos con `desdeDecimal` **solo para
   medir la altura**; lo que se lee (el total de arriba, el de cada día) es el texto que mandó el servidor. Calcula `maximo`
   (`:67`): el día más alto en la vista del total, o el valor más alto de cualquier forma en la vista por forma de pago.
5. **El dibujo** (`components/graficos/Lineas.tsx:46`). Para cada serie dibuja un `<line>` entre cada par de días y un
   `<circle>` en cada día. Las posiciones salen de dos funciones puras de `escalas.ts`: `posicionX` (`:72`, el centro del lugar
   de cada día) y `posicionY` (`:82`, el valor medido desde arriba, con cero sobre la línea de base). Un día sin cobros queda en
   `100%`: el punto está abajo y la línea sigue hasta ahí.
6. **Tocar o enfocar un día.** Debajo del SVG hay una fila de botones, uno por día, que reparten el ancho igual que los
   puntos. Cada uno escribe el detalle del día ("15/10/2026: Bs 125,50. Efectivo Bs 100,00, Pago con QR Bs 25,50.") con el
   mismo `alUsar` de las barras de la 026. El lector de pantalla tiene además la tabla `sr-only` de `Grafico`.

## Dónde encaja en la arquitectura

Es la capa de **componentes** de `features/estadisticas/` y nada más: el pedido sigue pasando por `api/` y un hook (CLAUDE.md §5),
y la regla de §8 se respeta: **ningún monto se suma en el frontend**. (La 042 hizo una excepción documentada para el total por
forma de pago; esta spec no agrega otra.) Respeta lo que fijó la 026: SVG del proyecto sin librería, sin `style`, con nombre y
tabla para el lector de pantalla y nada que dependa del mouse. Y no usa ningún color nuevo: las líneas son los `serie-*` que ya
pasaron el validador de daltonismo y el test de contraste en los dos temas, así que `index.css` y `tema.test.ts` no cambiaron.

## Fundamentos

**Un gráfico de líneas sin `polyline`.** Lo natural para una línea es `<polyline points="10,20 30,40 …">`. Pero el atributo
`points` solo admite números (píxeles del dibujo), y los gráficos del proyecto no tienen `viewBox`: sus posiciones son porcentajes
para que se estiren con la pantalla (→ SPEC-KRILINXI-026, "SVG sin viewBox"). `<line x1="16.67%" y1="…" x2="50%" y2="…">` sí
admite porcentajes. Por eso la línea es una **cadena de tramos** de a dos puntos, con `strokeLinecap="round"` para que las
uniones no dejen una muesca (`Lineas.tsx:66`). Sin eso habría que medir el ancho de la pantalla en JavaScript y volver a dibujar
al girarla.

**Botones debajo de un dibujo que no recibe toques.** Un punto de 4px es imposible de tocar con un dedo, y un `<circle>` no se
enfoca con Tab. En vez de hacer el SVG interactivo, se pone **una fila de botones del ancho de cada día** y el SVG encima con
`pointer-events-none` (`Lineas.tsx:63`): los toques lo atraviesan y llegan al botón, que es grande, tiene foco y nombre. El orden
importa: los botones van primero y el SVG después, para que el fondo de un botón al pasar el mouse quede *detrás* de la línea y
no la tape. Los puntos y los botones se alinean porque comparten la cuenta: cada uno ocupa `1/n` del ancho (`flex-1`) y el punto
va a la mitad de su lugar (`posicionX`).

**Pedir un dato aparte del resto del panel.** El panel pide cinco cosas juntas en `usePanel`, y el Inicio del admin lo reusa
(`ResumenDelInicio`). Si el endpoint nuevo entrara ahí, el Inicio lo pediría para nada (y un test del Inicio con un servidor que
solo sabe contestar lo viejo se rompería). Por eso lleva su propio hook, como los clientes (`useClientesAtendidos`), y falla por
su cuenta: una tarjeta rota no esconde las otras seis.

**Ya explicado antes:**

- **Alternativa accesible de un gráfico (nombre, tabla `sr-only`, sin mouse)** → SPEC-KRILINXI-026 (`specs/notas/SPEC-KRILINXI-026-estadisticas-tablero.md`)
- **SVG sin `viewBox` (porcentajes como atributos)** → SPEC-KRILINXI-026
- **Elegir la forma del gráfico según la pregunta** → SPEC-KRILINXI-026 (una tendencia en el tiempo es línea, o columnas si es una sola serie)
- **Comprobar una respuesta externa contra su contrato** → SPEC-KRILINXI-015 (`specs/notas/SPEC-KRILINXI-015-estadisticas-panel.md`)
- **Dinero en centavos enteros** → SPEC-ALE186-001

## Decisiones y por qué

- **Líneas y no columnas.** Las columnas ya muestran "ropa por día" (026). Para dinero día a día lo que importa es la forma, si
  sube o baja, y una línea lo lee mejor; y por forma de pago, cuatro líneas se comparan mejor que cuatro columnas por día.
- **Cada vista se mide con su propio máximo.** En "por forma de pago" las líneas son más bajas que el total, y con la escala del
  total quedarían aplastadas abajo. *Descartado:* una escala común: se compara mejor entre vistas pero se lee peor cada una.
- **El eje y no tiene números.** Solo el total de arriba, las fechas debajo y el detalle al tocar. Como en las columnas de la 026:
  un número en cada punto no lo lee nadie, y se leen todos en la tabla.
- **Un día sin cobros baja a cero en vez de saltarse.** Lo pide la spec y lo hace posible la 043, que manda todos los días del período.
- **Máximo de cuatro líneas:** una por forma de pago, fijas y en el orden de siempre, también la que está en cero (una línea plana
  sobre la base). Así el color de cada forma no cambia de un período a otro.
- **Revisión a mano pendiente.** jsdom no pinta: no puede ver si un punto queda fuera del dibujo ni si se amontonan las fechas del eje.
  El último criterio (Chrome, claro y oscuro, a 360px y a 1280px) lo tiene que mirar una persona.

## Los tests

- `PantallaEstadisticas.test.tsx` — la **tarjeta sobre la `App`**: qué pide a la API (30 días; o el período y la sucursal
  elegidos), la geometría de los puntos (`cx`/`cy` exactos), el día en cero sin cortar la línea, treinta días, la vista por forma de
  pago con sus cuatro colores y la leyenda, tocar y enfocar un día, la tabla `sr-only`, que el total es el del servidor, el período
  sin cobros, el contrato roto y el corte de internet.
- `api/estadisticasApi.test.ts` — `leerIngresosPorDia`: una respuesta válida, y una lista de respuestas rotas (monto negativo,
  falta una forma de pago, fecha mal escrita…), más el pedido a su ruta.
- `components/graficos/escalas.test.ts` — `posicionX` y `posicionY`, puras y sin montar nada.

**Se creó** en `test/estadisticasDePrueba.ts`: `ingresosPorDiaDePrueba` (tres días, uno en cero) e `ingresosPorDiaDeDias(n)`, y
`simularEstadisticas` ya contesta `/ingresos-por-dia`, como pide la spec. Una próxima spec que necesite esa respuesta la arma así:
`simularEstadisticas({ ingresosPorDia: { status: 200, data: ingresosPorDiaDeDias(30) } })`. Se reusaron `abrirPanel`, `seccion` y `fila`.

## Si mañana tenés que tocar esto

Empezá por `SeccionTendencia.tsx` (qué se dibuja) y bajá a `Lineas.tsx` (cómo). Con cuidado: si agregás una serie, escribí su clase
`stroke-…` **entera** en `colores.ts` (Tailwind no ve las armadas con una variable); y si cambiás el ancho que ocupa cada día,
cambialo en `posicionX` y en los botones a la vez, o el punto y lo que se toca dejan de coincidir.
