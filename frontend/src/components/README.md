# components/

UI compartida entre features: botones, inputs, modales de confirmación. Nada que sepa de
órdenes, clientes ni pagos — eso vive en `features/`.

Lo que ya existe — usalo antes de escribir uno propio (SPEC-KRILINXI-002):

- `Boton` — grande, con variantes `primario`, `secundario` y `peligro`. Si su `onClick`
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
