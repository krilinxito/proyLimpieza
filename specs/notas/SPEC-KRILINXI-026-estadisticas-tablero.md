---
id: SPEC-KRILINXI-026
spec: specs/SPEC-KRILINXI-026-estadisticas-tablero.md
explica:
  - act() en los tests de react
  - alternativa accesible de un grafico (nombre tabla sr-only y sin mouse)
  - elegir la forma del grafico segun la pregunta
  - paleta segura para daltonismo (medida con todas las parejas)
  - rampa ordinal de un tono
  - svg sin viewbox (porcentajes como atributos)
---

# SPEC-KRILINXI-026 — Estadísticas como tablero con gráficos

## Qué se construyó

`/estadisticas` dejó de ser una sucesión de tablas y pasó a ser un tablero. Arriba hay cuatro
tarjetas con los números que el admin mira primero: lo cobrado, lo que falta cobrar, la ropa sin
recoger y la ropa recibida. Debajo, cada sección tiene su gráfico y, más abajo, el detalle de
siempre. Los pedidos a la API, el filtro y el aviso sin internet no cambiaron.

## Cómo funciona, paso a paso

Sigamos los ingresos de hoy de la sucursal Centro: `{ total: "980.00", porMetodo: { EFECTIVO:
"520.00", QR: "310.00", TARJETA: "150.00", TRANSFERENCIA: "0.00" } }`.

1. **El pedido no cambió.** `PantallaEstadisticas.tsx:28` llama a `usePanel(filtro)`, que pide las
   cinco métricas juntas (SPEC-KRILINXI-015). Solo con el panel listo se dibujan los indicadores
   (`PantallaEstadisticas.tsx:61`) y las secciones (`:69`). Sin internet no aparece ningún número ni
   ningún gráfico.
2. **La sección convierte los montos en medidas.** `SeccionIngresos.tsx:31` pasa cada total de texto a
   centavos (`desdeDecimal`). Esos centavos sirven **solo para medir las barras**: lo que se lee en
   pantalla sigue siendo el texto del servidor formateado con `bs()`, sin sumar nada en el frontend
   (CLAUDE.md §8).
3. **Si no hay nada que dibujar, lo dice.** `vacio={!hayDatos(totales)}` (`:37`) hace que `Grafico`
   devuelva «No hay datos en este período.» en vez de un gráfico vacío (`graficos/Grafico.tsx:36`).
4. **Cada sucursal es una barra con un tramo por método.** `:59` arma los cuatro tramos en el orden de
   `METODOS_PAGO`, cada uno con la clase de su color (`COLOR_METODO` en `graficos/colores.ts`). La
   escala es la sucursal que más cobró (`maximo`, `:54`).
5. **La parte pura ubica los tramos.** `BarrasHorizontales.tsx:45` llama a `apilar` (`escalas.ts:38`).
   Para cada tramo calcula su ancho con `largo` (`escalas.ts:25`, el valor sobre el máximo, en % del
   ancho) y lo pone donde terminó el anterior (`desde += ancho`, `:45`). La transferencia en cero da
   ancho 0 y se saltea: no deja hueco y no se rotula.
6. **Se dibuja en SVG con porcentajes.** Cada tramo es un `<rect x="62.4%" width="31.6%">`
   (`BarrasHorizontales.tsx:65`). El trazo del color de la superficie (`:68`) los separa con un filo
   blanco. Debajo de la barra, en HTML, cada método con monto lleva su cuadradito de color y su valor.
7. **La barra es un botón.** Su nombre accesible es el detalle completo (`:51`), y `alUsar`
   (`Grafico.tsx:76`) le da los mismos tres caminos: tocarla, llegar con Tab o pasar el mouse.
   Cualquiera de los tres guarda el detalle en el estado de `Grafico` (`:34`), que lo escribe en el
   párrafo con `aria-live` (`:42`): «Centro: Bs 980,00 cobrado. Efectivo Bs 520,00, Pago con QR
   Bs 310,00, Tarjeta Bs 150,00.»
8. **La tabla repite los números** (`Grafico.tsx:45`). Va con `sr-only`, que la saca de la vista pero
   no del lector de pantalla. Los tests leen ahí los valores.

El volumen sigue el mismo camino con `Columnas`. Cada día es un botón `flex-1` (`Columnas.tsx:40`),
así el ancho se reparte sin calcularlo. Solo la columna más alta lleva su número arriba (`:50`), y el
eje escribe las fechas que elige `rotulosDelEje` (`escalas.ts:55`): seis de treinta, siempre la
primera y la última.

## Dónde encaja en la arquitectura

- **`graficos/escalas.ts` es dominio de la pantalla, sin React.** Hace cuentas de geometría y nada
  más: no formatea montos ni sabe qué es una sucursal. Así se prueba con números
  (`escalas.test.ts`) sin montar nada. Si una cuenta se escribiera dentro del JSX, solo se podría
  probar abriendo la pantalla entera.
- **`graficos/*.tsx` son piezas genéricas de la feature:** una barra no sabe si mide plata o boletas.
  No están en `components/` porque solo las usa el panel, y `components/` es para lo que comparten
  varias features (CLAUDE.md §5). Si otra pantalla necesita un gráfico, ese es el momento de
  subirlas.
- **Las secciones (`Seccion*.tsx`) traducen del contrato de la API a barras.** Deciden qué color, qué
  rótulo y qué detalle lleva cada cosa. No piden datos ni suman montos para mostrar.
- **Los colores son del tema** (`index.css:87-95`). La feature nombra las clases (`fill-serie-1`) pero
  no elige hexadecimales. La regla de la paleta cruda ya cubre `features/estadisticas`
  (`test/arquitectura.test.ts`).
- **Lo que no cambió:** las métricas se piden a la API y nunca se leen de la base local
  (SPEC-KRILINXI-015, su test de arquitectura sigue igual).

## Fundamentos

### Elegir la forma del gráfico según la pregunta

Cada gráfico contesta una pregunta, y la pregunta decide la forma. Si se elige por gusto, el admin
tiene que hacer una cuenta mental para leer lo que el dibujo debería decirle solo.

| Pregunta | Forma | Por qué |
|---|---|---|
| ¿Cuánto se cobró? | Un número grande (`Indicadores.tsx`) | Es un solo valor: un gráfico de una barra no agrega nada. |
| ¿De qué forma se cobró en cada sucursal? | Barra horizontal apilada | Es parte de un todo. Las barras alineadas se comparan; los ángulos de una torta, no. |
| ¿Cómo fue el volumen en el mes? | Columnas | Es una tendencia en el tiempo, que se lee de izquierda a derecha. |
| ¿Cuánto hay de cada antigüedad? | Barras de un tono que se oscurece | Los tramos tienen un orden, y el color lo muestra. |
| ¿Quién recibió más? | Barras ordenadas de mayor a menor | El orden ya es la respuesta. |

Nada de tortas ni de dos ejes. Un gráfico con dos escalas permite hacer que dos series parezcan
relacionadas eligiendo dónde empieza cada eje.

### Una paleta segura para daltonismo, medida y no a ojo

Alrededor de 1 de cada 12 hombres no distingue bien el rojo del verde. Si dos formas de pago se
diferencian solo por eso, para esas personas son la misma barra. Mirarlo «a ojo» no sirve, porque
quien elige los colores casi siempre ve bien. Por eso se mide:

- Se simula cómo ve cada color una persona con protanopía y con deuteranopía (el modelo de Machado,
  2009) y se calcula la distancia entre cada par de colores en OKLab, un espacio donde la distancia
  se parece a lo que percibe el ojo. Debajo de 8 se confunden.
- **¿Qué pares se miden?** En una barra apilada solo se tocan los vecinos. Pero acá un método en cero
  no ocupa lugar: con QR en cero, el efectivo (serie 1) queda pegado a la tarjeta (serie 3). Así que
  cualquier par puede quedar pegado, y la paleta tiene que pasar con **todas las parejas**, no solo
  con las vecinas.
- Además, cada color tiene que llegar a 3:1 contra la superficie blanca. Las dos condiciones juntas
  descartaron la paleta de referencia de la guía (su aqua y su amarillo no llegan a 3:1) y varias
  probadas a mano. Al final se buscó con un programa: colores de cuatro familias que llegaran a 3:1,
  y entre las combinaciones que pasaban con todas las parejas, la más viva y pareja en claridad.

El resultado, con el validador de la guía de visualización (`validate_palette.js`, superficie
`#ffffff`):

```
Series #3a83fc, #e55108, #0f9958, #d14ead (efectivo, QR, tarjeta, transferencia)
  vecinas:          CVD peor 9,3 (verde↔naranja, deuteranopía)  · visión normal peor 29,0  → PASA
  todas las parejas: CVD peor 9,3 (verde↔naranja, deuteranopía)  · visión normal peor 19,4  → PASA
  contraste contra la superficie: 3,60 · 3,81 · 3,67 · 3,89 (todas ≥ 3:1)
  claridad y croma dentro de la banda; sin advertencias
```

Si alguien cambia un color, tiene que volver a correrlo con `--pairs all`. `tema.test.ts` solo
comprueba el contraste. La separación para daltonismo no está en la suite porque el validador no es
parte del repo.

### Una rampa ordinal: un tono, de claro a oscuro

Los tramos de antigüedad no son tres cosas distintas: son un orden. Si cada tramo tuviera un color
distinto, el lector tendría que ir a la leyenda para saber cuál es el más viejo. Con un solo azul
que se oscurece (`#3987e5` → `#1c5cab` → `#0d366b`), lo más oscuro es lo más viejo sin leer nada.
Hay dos condiciones. Cada paso tiene que distinguirse del anterior: el validador con `--ordinal` pide
al menos 0,06 de diferencia de claridad. Y el más claro tiene que verse contra el blanco: llega a
3,64:1. `tema.test.ts` comprueba que la luminancia baje en cada paso.

### SVG sin `viewBox`: la geometría se estira, el texto no

Un SVG con `viewBox="0 0 100 20"` se escala entero: en un teléfono la barra se achica, y el texto
también, hasta quedar ilegible. Sin `viewBox`, `width="42%"` es un porcentaje del ancho real del
SVG. La barra se estira con la pantalla y el texto queda con el tamaño de la app (18px de base).
Los porcentajes van como **atributos**, no como `style`: la CSP de la app bloquea los estilos en
línea (SPEC-KRILINXI-020), pero un atributo de SVG no es un estilo.

El precio es que no se pueden mezclar unidades: no existe «42% menos 2px». Por eso hay dos trucos.
La separación de 2px entre tramos es un trazo del color de la superficie
(`BarrasHorizontales.tsx:68`). Y la punta redondeada con la base recta son dos rectángulos: uno con
`rx` y otro sin redondear que tapa las esquinas del lado del cero (`:73`).

Y el texto no se puede medir. El valor de cada barra iba primero en la punta, y en la captura del
teléfono «8 boletas — Bs 410,00» llegaba al borde de la tarjeta. Se pasó a la línea del nombre, en
HTML, que baja de renglón sola.

### La alternativa accesible de un gráfico

Un dibujo no se lee en voz alta. Cada gráfico tiene tres cosas para quien no lo ve
(`Grafico.tsx`):

- **Un nombre:** `<figure aria-label="Ropa recibida por día">`. El lector de pantalla lo anuncia, y
  los tests lo encuentran con `getByRole('figure', { name })`.
- **Una tabla con los mismos números**, escondida con `sr-only`. Esa clase de Tailwind no es
  `display: none`, que la sacaría también del lector: la deja de 1px, recortada, fuera de la vista.
- **Barras que se usan sin mouse.** Cada una es un `<button>`, se llega con Tab, y su detalle se
  escribe en un párrafo `aria-live` (las regiones vivas, ya explicadas en SPEC-KRILINXI-022). En una
  tablet no hay «pasar el mouse»: un dato que solo aparece así no existe para el admin.

### `act()`: cuándo React dibuja lo que cambió

React no redibuja en el momento en que cambia un estado: agenda el cambio. En un test, `fireEvent`
envuelve el evento en `act()`, que espera a que React termine de dibujar antes de devolver. Un
`elemento.focus()` llamado a mano no pasa por ahí. El foco llega, `onFocus` corre y el estado
cambia, pero el test mira la pantalla antes de que se dibuje y no encuentra el detalle. Pasó acá: el
test «nada se ve solo con el mouse» fallaba con el texto de la pista todavía en pantalla. El arreglo
es `act(() => centro.focus())` (`PantallaEstadisticas.test.tsx`, en el bloque de esta spec). La
señal para reconocerlo es un estado que «no cambió», aunque el handler sí corrió.

**Ya explicado antes:**

- **Funciones puras testeables** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Contraste WCAG (luminancia relativa)** y **tokens de diseño** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)
- **Regiones vivas (role status y alert)** y **focus-visible** → SPEC-KRILINXI-022
- **Política de seguridad del contenido (CSP)** → SPEC-KRILINXI-020 (`specs/notas/SPEC-KRILINXI-020-csp-frontend.md`)
- **Contenido permitido dentro de un botón** y **listas de definiciones (dl dt dd)** → SPEC-KRILINXI-025 (`specs/notas/SPEC-KRILINXI-025-estilo-mostrador.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`); **helper de test** → SPEC-KRILINXI-001 (`specs/notas/SPEC-KRILINXI-001-frontend-scaffold.md`)
- **Esperar lo que se afirma (findBy y waitFor)** → SPEC-KRILINXI-018 (`specs/notas/SPEC-KRILINXI-018-auditoria-admin.md`)

## Decisiones y por qué

- **SVG propio y no una librería** (Recharts, Chart.js). Una librería suma cientos de KB al precache
  de la PWA, y varias usan estilos en línea que la CSP bloquea. Para cinco formas simples no hace
  falta. Un test de arquitectura vigila que `graficos/` solo importe React y archivos propios.
- **Cada barra es un botón, con su detalle en un párrafo fijo** y no en un globo que aparece al
  pasar el mouse. El globo no funciona con el dedo ni con el teclado, y se pierde al alejar el
  puntero. El párrafo siempre está y el lector de pantalla lo lee.
- **Los montos de cada tramo van debajo de la barra, no adentro.** Un tramo angosto no tiene lugar
  para «Bs 150,00», y sobre el naranja o el magenta el texto no siempre llega a 4,5:1.
- **Los saldos se miden por plata y la ropa por boletas.** Lo que preocupa de una deuda es cuánto se
  debe. De la ropa, cuántas bolsas ocupan el local.
- **«No hay datos en este período» convive con los textos de las listas** («Nadie debe nada en este
  período.»). Uno habla del gráfico y el otro de la lista, y la spec pedía conservar los dos. En los
  ingresos, que no tienen lista debajo, reemplazó a «No hubo cobros en este período.».
- **Los indicadores van de a dos.** Con cuatro por fila, al lado del menú, «Bs 1.840,50» se partía en
  dos renglones (se vio en la captura de 1280px).
- **La productividad rotula «Ana Flores (Centro)»** y la lista de abajo sigue con «Ana Flores —
  Centro», en el orden del servidor. El gráfico ordena; la lista conserva el orden que tenía.

## Los tests

- **Reusé** `simularEstadisticas` y las respuestas de `test/estadisticasDePrueba.ts`, y le sumé
  `volumenDeDias(n, ordenes)`: un período de N días que termina el 16/10. La próxima spec que
  necesite un mes de volumen ya lo tiene.
- **Creé `fila(contenedor, tabla, encabezado)`** en `PantallaEstadisticas.test.tsx`: lee las celdas
  de una fila de la tabla de un gráfico. Los tests viejos que buscaban `getByText('Más de 30
  días').nextElementSibling` ahora encontraban ese texto dos veces (en la barra y en la tabla), así
  que leen la tabla, que es lo que oye el lector de pantalla.
- **La parte pura tiene su test aparte** (`graficos/escalas.test.ts`): escala, tramos que se saltean
  en cero, fechas del eje, empates en el orden. Ese test encontró un error de borde: con 8 días, la
  última fecha quedaba pegada a la anterior porque la condición era `<` en vez de `<=`.
- **El test de la 020** («sin estilos en línea») sigue cuidando lo mismo, pero mira el alto de cada
  columna en el atributo del SVG en vez de la clase `w-[60%]` de antes.
- **Se miró dibujado de verdad.** jsdom no pinta. El tablero se abrió en un Chromium aislado contra
  `npm run dev`, con la API simulada desde el navegador, a 1280, 800 y 390px. Esas capturas son las
  que cambiaron dos decisiones: el valor en la línea del nombre y los indicadores de a dos.

## Si mañana tenés que tocar esto

- Para un gráfico nuevo, armá las barras en la sección y pasáselas a `BarrasHorizontales` o
  `Columnas` dentro de un `Grafico` con su `nombre`, su `pista` y su `tabla`. Si necesitás una
  cuenta nueva, va en `escalas.ts` con su test.
- Para cambiar un color, tocá `index.css` y volvé a correr el validador con `--pairs all` (ver
  arriba). Un color que se lee mal para daltonismo no lo detecta ningún test.
- Nada de `style={…}`: las medidas van como atributos del SVG, en porcentajes, con `porciento()`.
- Un test que busca un número del panel tiene que buscarlo dentro de su sección o de su tabla: casi
  todos aparecen dos veces (en el dibujo y en la tabla).
