---
id: SPEC-KRILINXI-052
spec: specs/SPEC-KRILINXI-052-caracter-visual.md
explica: []
---

# SPEC-KRILINXI-052 — Carácter visual propio sin romper contraste ni tema oscuro

## Qué se construyó

La marca de la app pasó de un azul genérico a un **turquesa de agua limpia**, en el tema claro y en el oscuro. Se nota donde ya
se usaba la marca: botón principal, menú y pantalla activa, tarjetas que destacan un número, cabecera, y el color de la barra del
navegador y de la PWA. La tarjeta `destaca` perdió la franja gruesa de un solo lado: ahora se distingue por su fondo y su borde completo.

## Decisión acordada con la persona (criterio 1)

Se eligió el **turquesa de agua limpia** entre cuatro opciones (turquesa, acento cálido tipo aguayo, azul marino con dorado, o solo
quitar la franja). Se pidió que se note en: botón principal y marca, tarjetas que destacan, y cabecera y menú lateral. Los avisos de
información siguen azules a propósito: informar no es lo mismo que marcar la marca.

## Cómo funciona, paso a paso

Un cambio de color es una línea en el tema, porque ningún componente pinta con un valor propio (CLAUDE.md §5):

1. `frontend/src/index.css`, bloque `@theme`: `--color-marca` pasa de `#1e40af` a `#0f766e`, `marca-fuerte` a `#115e59`, `marca-suave` a `#ccfbf1`.
2. El mismo archivo, bloque `:root[data-tema='oscuro']`: `marca` `#5eead4`, `marca-fuerte` `#99f6e4`, `marca-suave` `#134e4a`. `sobre-marca` no cambia
   (sigue blanco en claro y oscuro en oscuro).
3. Tailwind convierte cada token en clases (`bg-marca`, `border-marca`…), así que `Boton`, el menú y las tarjetas cambian solos.
4. `Tarjeta.tsx` (`ESTILO_TARJETA.destaca`): `border border-l-8` pasó a `border-2`, con el mismo `border-marca bg-marca-suave`.
5. `test/tema.test.ts` mide los pares que se sumaron: `marca` sobre `marca-suave` como texto (4,5:1) y como borde (3:1), en los dos temas.
6. `DESIGN.md` y `.impeccable/design.json` renombran los tokens (`turquesa-de-agua`, `turquesa-de-agua-fuerte`, `turquesa-suave`) y los valores;
   `src/test/disenoDocumentado.test.ts` falla si algún color queda sin documentar o documentado de más.

## Dónde encaja en la arquitectura

Es la regla de §5: los colores salen del tema, en los dos bloques, con su par de contraste en `tema.test.ts`. Los componentes no se tocaron salvo
`Tarjeta`, y las pantallas no cambian ni de estructura ni de texto.

## Series de los gráficos (criterio 4)

`serie-1…4` y `antiguedad-1…3` **no cambiaron**, así que su validación para daltonismo (SPEC-KRILINXI-026) sigue valiendo. Ninguna usa la marca:
`graficos/colores.ts` pinta con `fill-serie-n` y `fill-antiguedad-n`. El turquesa nuevo y el verde de `serie-3` (tarjeta) no se dibujan juntos.

## Los tests

Se reusó todo: se sumaron dos pares a `TEXTOS` y `CONTROLES` de `tema.test.ts` (que se miden solos en los dos temas) y se actualizó el test de
`Tarjeta` en `piezas.test.tsx`, que ahora también comprueba que no quede ninguna clase `border-l-*`. `disenoDocumentado.test.ts` no se tocó y pasa.

## Si mañana tenés que tocar esto

Si cambiás un color: `index.css` (los dos bloques), `DESIGN.md` y `design.json`, y un par en `tema.test.ts`. El `theme-color` de `index.html` y de
`vite.config.ts` son valores sueltos (el navegador no lee el CSS) y hay que mantenerlos a mano iguales a `--color-marca`.
