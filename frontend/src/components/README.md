# components/

UI compartida entre features: botones, inputs, modales de confirmación. Nada que sepa de
órdenes, clientes ni pagos — eso vive en `features/`.

Lo que ya existe — usalo antes de escribir uno propio (SPEC-KRILINXI-002):

- `Boton` — grande, con variantes `primario`, `secundario` y `peligro` (y `navegacion` desde SPEC-KRILINXI-037, ver abajo). Si su `onClick`
  devuelve una promesa, se deshabilita hasta que termine: un doble toque no cobra dos veces.
- `CampoTexto` — etiqueta siempre visible y el error debajo, enlazado al input.
- `ModalConfirmacion` — para toda acción irreversible. Dice qué va a pasar, y solo
  `onConfirmar` ejecuta; cancelar, Escape o tocar fuera llaman a `onCancelar`.

Desde SPEC-KRILINXI-022:

- `Boton` acepta un `icono` opcional, que va antes del texto.
- `Aviso` — un aviso con `tipo` (`informacion`, `exito`, `advertencia`, `error`). Siempre lleva
  texto; error y advertencia son `role="alert"`, información y éxito `role="status"`. No
  escribas otro `<p className="bg-red-50 …">`: usá este.
- `Tarjeta` — agrupa lo que va junto. Con `titulo` es una sección con encabezado; `nivel={3}` si va
  dentro de otra sección que ya tiene su `h2` (SPEC-KRILINXI-025).
- `Insignia` — una etiqueta corta con `tono` (`neutro`, `informacion`, `exito`, `advertencia`,
  `peligro`). No sabe de órdenes: qué tono lleva cada estado lo decide la feature.
- `EnlaceBoton` — un enlace a otra pantalla con aspecto de botón ("Volver al inicio"). Si lleva a
  otra pantalla es un enlace, aunque se vea como botón: `Boton` es para acciones (SPEC-KRILINXI-024).
- `Icono` (`iconos.tsx`) — los íconos de la app por nombre (`<Icono nombre="cobrar" />`).
  Siempre decorativos: van al lado de un texto que diga lo mismo, nunca solos.

## Qué estilo lleva cada cosa (SPEC-KRILINXI-037)

Lo importante y lo secundario no se ven igual. Cada uso se distingue por su **forma**, no solo por
el color (los estilos viven en `estilosBoton.ts`, compartidos por `Boton` y `EnlaceBoton`):

| Variante de `Boton` | Cómo se ve | Cuándo |
|---|---|---|
| `primario` (por defecto) | Lleno, de todo el ancho | Lo que hay que hacer ahora. **Una sola por pantalla a la vista**: "Registrar ropa", "Guardar", "Empezar a lavar". |
| `secundario` | Con borde, sobre la superficie | Otra acción posible: "Cobrar" junto a un avance, "Cancelar". |
| `peligro` | Lleno de rojo, siempre con el ícono de alerta | Lo que no tiene vuelta atrás ("Anular"), y su confirmación. |
| `navegacion` | Sin caja, subrayado, con la flecha de volver | No hace nada, lleva a otro lado: "Volver a la lista", "Ver toda la ropa en el local". |

`tamano="compacto"` (48px de alto, del ancho de su texto) para una **fila** de acciones secundarias,
como Cobrar y Anular debajo del avance principal. Lo normal sigue siendo el grande.

`EnlaceBoton` toma las mismas variantes (menos `peligro`: un enlace no destruye nada). Si lleva a
otra pantalla es un enlace; si cambia lo que muestra la misma pantalla, es un `Boton`.

| Tipo de `Tarjeta` | Cómo se ve | Cuándo |
|---|---|---|
| `informa` (por defecto) | Liviana: borde suave, sin sombra | Agrupar datos: la ropa, los pagos, un cliente. |
| `destaca` | Fondo suave de la marca, franja gruesa a la izquierda | El número que importa: "Cobrado hoy". |
| `toca` | Borde firme, sombra y una flecha a la derecha | Entera tocable, lleva a algo: una boleta en una lista. Es un `<button>` o un `<Link>` con `ESTILO_TARJETA.toca` y `<SenalTocable />`, porque una `<section>` no puede ir dentro de un botón. |

**Menos letra:** un texto de ayuda que repite lo que ya dice la etiqueta o el título se quita. Los
mensajes de error y las confirmaciones, nunca (CLAUDE.md §9).

## Las listas largas se paginan (SPEC-KRILINXI-041)

Ninguna lista que pueda crecer se muestra de golpe, en ninguna pantalla: se parte en páginas con
`Paginas` ("Anteriores · Página 2 de 3 · Siguientes"; con una sola página no dibuja nada). Cuántas filas
entran depende del ancho del dispositivo (6 en angosta, 10 en mediana, 20 en ancha) y se decide en un solo
lugar, `lib/tamanoDePagina.ts`:

- **La lista ya está en memoria** (la base local, o una respuesta entera de la API): `usePaginado(items, reinicio)`
  devuelve `visibles`, `pagina`, `total`, `porPagina` e `irAPagina`. `reinicio` es lo que vuelve a la primera página
  al cambiar (el filtro).
- **La API pagina** (la auditoría, el historial completo): `useTamanoDePagina()` da el `por_pagina` que se pide, y
  `usePagina(filtro, porPagina)` guarda la página elegida.
- Un `<ul>` nuevo tiene que estar en `PAGINAN` o en `CORTAS` (con su motivo) en `test/arquitectura.test.ts`: si no,
  el test falla. Para probarla sin sembrar 21 filas, `test/pantalla.ts` (`conAnchoDePantalla(500)` → 6 por página).

## Colores: siempre del tema

Los colores viven en `src/index.css`, en `@theme`, y Tailwind arma las clases con su nombre:
`--color-marca` es `bg-marca`, `text-marca`, `border-marca`. Los que hay:

| Para qué | Tokens |
|---|---|
| La página y lo que se apoya en ella | `fondo`, `superficie`, `texto`, `texto-suave`, `borde` (lo que se toca), `borde-suave` (lo que solo agrupa) |
| La marca | `marca`, `marca-fuerte` (al pasar por encima), `marca-suave`, `sobre-marca` (el texto encima) |
| El foco con teclado | `foco` |
| Avisos e insignias | `info-*`, `exito-*`, `advertencia-*`, `peligro-*`, cada uno con `-fondo`, `-texto` y `-borde` |
| Botón de peligro | `peligro`, `peligro-fuerte` |

**En ninguna parte de la app (`components/`, `pages/` y `features/`, desde SPEC-KRILINXI-027) se usa la paleta cruda** (`sky-700`, `slate-400`, `bg-white`): lo vigila
`test/arquitectura.test.ts`. Un color nuevo se agrega al tema, y si es un texto, su par con el
fondo va en `test/tema.test.ts`, que comprueba el contraste (WCAG AA).
