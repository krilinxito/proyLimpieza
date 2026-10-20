---
id: SPEC-KRILINXI-036
spec: specs/SPEC-KRILINXI-036-graficos-sin-texto-encima.md
explica:
  - costura por antialiasing entre figuras superpuestas
  - sr-only y el caption de una tabla
  - svg anidado como recorte
  - testear la estructura de lo que jsdom no pinta
---

# SPEC-KRILINXI-036 — El texto de los gráficos no se pisa

## Qué se construyó

En Estadísticas, el nombre de cada gráfico se veía encima de la leyenda y los rótulos, y las
barras tenían una rayita vertical en el medio. Las dos cosas eran del dibujo, no de los datos:
ahora el nombre solo lo oye el lector de pantalla, y cada barra es una sola pieza.

## Cómo funciona, paso a paso

**El texto encimado.** Cada gráfico se arma en `Grafico`
(`frontend/src/features/estadisticas/components/graficos/Grafico.tsx:33`): el dibujo, la línea
del detalle y una tabla con los mismos números para el lector de pantalla. Antes la tabla era
`<table className="sr-only">`. Chrome dibuja el `<caption>` **fuera** de la caja de la tabla, así
que el recorte de `sr-only` (que se aplica a esa caja) no lo alcanzaba, y "Falta cobrar según los
días" aparecía flotando arriba de todo. Ahora el `sr-only` va en un `<div>` alrededor
(`Grafico.tsx:47`): el caption está dentro de la caja del div, y el recorte sí lo tapa. La tabla
sigue en el árbol de accesibilidad igual que antes, con su caption como nombre, que es lo que leen
los tests de la 026 (`getByRole('table', { name })`).

**La costura.** Sigamos una barra de "Falta cobrar", que tiene un solo valor:

1. `BarrasHorizontales` calcula sus tramos con `apilar` (`escalas.ts:38`); un tramo en cero se
   descarta, así que queda uno solo y `unico` es ese tramo.
2. Con un tramo, dibuja `PuntaRedondeada` (`BarrasHorizontales.tsx:63`) con el ancho de la barra
   en porcentaje.
3. `PuntaRedondeada` (`PuntaRedondeada.tsx:27`) es un `<svg>` anidado de ese tamaño, con un solo
   `<rect rx="4">` adentro que empieza en `-50%` y mide `150%`: la mitad que sobra queda a la
   izquierda del cero, fuera del svg anidado, y no se dibuja. Lo que se ve es una barra con la
   punta derecha redondeada y la base recta, de una pieza.

Antes eran dos rectángulos: uno redondeado y otro recto encima, de la mitad del largo, para tapar
las esquinas del lado del cero. El borde derecho del segundo caía en medio de la barra, y ahí
estaba la costura (ver Fundamentos).

Las **columnas** del volumen (`Columnas.tsx:45`) usan la misma pieza con `hacia="arriba"`: el
rectángulo sobra hacia abajo y la base queda recta sobre el eje.

Las **apiladas** (Cobrado, varias formas de pago) ya no ponen borde a cada tramo: los tramos van
sin trazo, y después se dibuja una `<line>` del color de la superficie solo donde empieza cada
tramo a partir del segundo (`BarrasHorizontales.tsx:79`). Antes el borde rodeaba cada tramo
entero, también arriba, abajo y en las puntas.

## Dónde encaja en la arquitectura

Todo queda dentro de `features/estadisticas/components/graficos/`, la carpeta de los gráficos
propios sin librería (CLAUDE.md §4, SPEC-KRILINXI-026). `PuntaRedondeada` es una pieza de esa
carpeta, no de `components/`: solo la usan los gráficos. Sigue las dos reglas que la carpeta ya
tenía: nada de `style={…}` (la CSP lo ignora en la tablet) y posiciones como atributos de SVG en
porcentajes. El `overflow-hidden` es una clase, no un estilo en línea.

El test nuevo de las piezas vive **fuera** de `graficos/`, en
`features/estadisticas/components/Graficos.test.tsx`: la regla de la 026 dice que esa carpeta solo
importa React y vitest, y Testing Library es otra librería. El test de `escalas` sí puede vivir
adentro porque es puro.

## Fundamentos

**`sr-only` y por qué no alcanza en una `<table>`.** `sr-only` (de Tailwind) oculta algo a la
vista pero lo deja para el lector de pantalla: no lo borra, lo encoge a 1×1 px, lo saca del flujo
con `position: absolute` y recorta todo lo que sale de esa caja (`overflow: hidden` y `clip`).
`display: none` no sirve para esto, porque también lo esconde del lector. El truco depende de que
todo el contenido esté **dentro** de la caja que se recorta. Una tabla es especial: el navegador
arma una caja envoltorio con el caption y la caja de la tabla como hermanos, y las propiedades de
recorte se quedan en la caja de la tabla. El caption queda afuera, de tamaño normal, y en
posición absoluta encima de lo que haya. Con un contenedor común alrededor, el caption es
contenido del contenedor y se recorta con todo lo demás. La regla quedó vigilada en
`frontend/src/test/arquitectura.test.ts:268`.

**Por qué dos figuras superpuestas dejan una costura.** El navegador suaviza los bordes
(antialiasing): un píxel que la figura cubre a medias se pinta a medias, mezclando su color con el
de abajo. Cuando dos rectángulos del mismo color se tocan o se superponen, el borde del de arriba
cae en un lugar donde las cuentas de cobertura no siempre suman 100%, y aparece una línea apenas
más clara u oscura. Se nota más en pantallas con escala fraccionaria (125%, 150%), comunes en
laptops y tablets. La única forma segura de no tener costura es no tener borde: **una sola
figura**.

**Un `<svg>` anidado recorta.** Un `<svg>` dentro de otro abre su propio rectángulo de dibujo
(su "viewport"), y por defecto lo que se sale de él no se ve (`overflow: hidden` es el valor de
los navegadores para un svg que no es la raíz; acá además lo dice la clase). Los porcentajes de
lo que está adentro se miden contra ese svg, no contra el de afuera: `width="150%"` es 1,5 veces
el ancho de la barra. Eso permite recortar sin `clipPath` (que pide un `id` único por barra) ni
`viewBox`, y sin calcular píxeles: `PuntaRedondeada.tsx:22`.

**Testear algo que jsdom no pinta.** jsdom arma el DOM pero no calcula dónde va cada cosa ni
dibuja (→ SPEC-KRILINXI-001). No puede ver un texto encimado ni una costura. Lo que sí puede
afirmar es **la estructura que lo evita**: que el `sr-only` esté en el padre de la tabla, que una
barra de un valor tenga un solo `rect`, que una apilada tenga un corte menos que tramos. Si alguien
vuelve al rectángulo "tapa-esquinas", el test de dos `rect` falla, aunque no sepa qué se ve. Lo
que se ve se confirma a mano en Chrome (CLAUDE.md §4).

**Ya explicado antes:**

- **jsdom** → SPEC-KRILINXI-001 (`specs/notas/SPEC-KRILINXI-001-frontend-scaffold.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Alternativa accesible de un gráfico (nombre, tabla sr-only, sin mouse)** → SPEC-KRILINXI-026
  (`specs/notas/SPEC-KRILINXI-026-estadisticas-tablero.md`)
- **SVG sin viewBox (porcentajes como atributos)** → SPEC-KRILINXI-026 (misma bitácora)

## Decisiones y por qué

- **Un svg anidado y no un `<path>` con la punta redondeada.** Un path necesita coordenadas en
  números, y las barras se miden en porcentajes sin `viewBox`: habría que medir el ancho en
  pixeles con JavaScript. Tampoco `clipPath`: necesita un `id` único por barra, y con varias en la
  pantalla es fácil que choquen.
- **Una línea por corte, en vez de un borde por tramo.** El borde de 2 px rodeaba cada tramo, se
  comía su orilla en las puntas y lo hacía ver más fino que su vecino. La línea marca solo lo que
  importa: dónde termina una forma de pago y empieza otra.
- **Los atributos `data-barra`, `data-tramo` y `data-corte`.** El SVG es `aria-hidden` y sus
  piezas no tienen rol: los tests las encuentran por esos atributos en vez de depender de cuántos
  `rect` hay o en qué orden.

## Los tests

- **Reusado:** el patrón de `arquitectura.test.ts` — `archivosFuente` y `sinComentarios`, más un
  `it` que comprueba que el patrón reconoce lo prohibido y deja pasar lo correcto (como el de la
  paleta cruda). Una regla nueva del mismo tipo copia ese par de `it`.
- **Ajustado:** cinco afirmaciones de `PantallaEstadisticas.test.tsx` (SPEC-KRILINXI-020 y -026)
  que miraban la geometría vieja: el tamaño ahora está en `[data-barra]`, no en el `rect`, los
  tramos ya no llevan `stroke-superficie`, y el `sr-only` está en el padre de la tabla. Lo que
  comprueban es lo mismo.
- **Nuevo:** `Graficos.test.tsx` monta `Grafico`, `BarrasHorizontales` y `Columnas` solos, sin la
  pantalla ni la API falsa. Para probar una pieza de dibujo con datos inventados (un tramo en cero,
  una apilada que queda con uno) es más corto que armar una respuesta entera de estadísticas.
  `barra('Centro', 10, 0, 30)` arma una barra con un tramo por valor.

## Si mañana tenés que tocar esto

- Antes de ocultar algo con `sr-only`, mirá si es una tabla (o algo con caption o leyenda propia,
  como un `<fieldset>` con `<legend>`): envolvelo. El test de arquitectura solo vigila `<table>`.
- Si un gráfico nuevo necesita una barra redondeada, usá `PuntaRedondeada`; no vuelvas a tapar
  esquinas con un segundo rectángulo.
- Cualquier cambio de dibujo se mira en Chrome, en tema claro y oscuro, y con el zoom del sistema
  en 125% o 150%, que es donde aparecen las costuras.
