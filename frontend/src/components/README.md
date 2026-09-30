# components/

UI compartida entre features: botones, inputs, modales de confirmación. Nada que sepa de
órdenes, clientes ni pagos — eso vive en `features/`.

Lo que ya existe — usalo antes de escribir uno propio (SPEC-KRILINXI-002):

- `Boton` — grande, con variantes `primario`, `secundario` y `peligro`. Si su `onClick`
  devuelve una promesa, se deshabilita hasta que termine: un doble toque no cobra dos veces.
- `CampoTexto` — etiqueta siempre visible y el error debajo, enlazado al input.
- `ModalConfirmacion` — para toda acción irreversible. Dice qué va a pasar, y solo
  `onConfirmar` ejecuta; cancelar, Escape o tocar fuera llaman a `onCancelar`.
