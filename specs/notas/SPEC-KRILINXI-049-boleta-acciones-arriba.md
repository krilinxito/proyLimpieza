---
id: SPEC-KRILINXI-049
spec: specs/SPEC-KRILINXI-049-boleta-acciones-arriba.md
explica: []
---

# SPEC-KRILINXI-049 — Acciones de la boleta justo debajo de lo que falta pagar

## Qué se construyó

En el detalle de una boleta, lo que se viene a hacer (avanzar, cobrar, entregar) ahora está justo debajo de "Falta pagar", y la
lista de pagos, que se mira menos, pasó después. Anular salió de la fila de botones y quedó solo, al final. Qué se puede hacer y
cuándo no cambió.

## Cómo funciona, paso a paso

Seguimos a una empleada que abre la boleta 000001 de Rosa, con saldo, y quiere cobrar.

1. El Mostrador monta `DetalleOrden` (`features/ordenes/components/DetalleOrden.tsx`). Arriba, las tarjetas "La ropa" y "Cuentas"; en
   Cuentas, "Falta pagar" en grande (`:133`).
2. **Inmediatamente después** vienen los avisos (error, "Cobro guardado.", "ya fue entregada") y la fila "Qué hacer con esta ropa"
   (`:153`): próximo avance, otro avance si lo hay, Cobrar si hay saldo y lo que agregue `accionesExtra` (Entregar). Máximo cuatro.
3. Al tocar **Cobrar**, `cobrando` pasa a `true`: la fila desaparece y `FormularioCobro` aparece **en el mismo lugar** (`:188`), debajo
   del saldo que se está cobrando. Antes quedaba debajo de los pagos.
4. Recién después van los "Pagos" (`:201`), luego **Anular** (`:215`) y el botón de volver. Anular sigue abriendo el
   `ModalConfirmacion` de siempre (`:232`).

## Dónde encaja en la arquitectura

Es solo orden de pantalla dentro de un componente (`features/ordenes/components`). No toca el estado de la orden, ni las reglas de qué
avance sigue (`ordenes/estado.ts`), ni `AccionEntregar`, que sigue dentro de la fila. La regla de CLAUDE.md §9 "una sola acción
principal a la vista" se mantiene: sigue siendo el próximo avance o, si no queda, entregar.

## Fundamentos

Ningún concepto nuevo. **Ya explicado antes:**

- **Una sola acción principal a la vista** → SPEC-KRILINXI-037 (`specs/notas/SPEC-KRILINXI-037-jerarquia-visual.md`).
- **La fila de acciones compactas con ícono** → SPEC-KRILINXI-038 (`specs/notas/SPEC-KRILINXI-038-acciones-boleta-en-fila.md`).

## Decisiones y por qué

- **Anular al final y no en un menú.** Esconderlo en un menú lo hace difícil de encontrar para quien lo necesita; al final y solo, con
  el rojo y el ícono de alerta de siempre, no se toca por accidente al lado de "Cobrar".
- **El formulario de cobro sube con la fila.** Si la fila subía y el formulario se quedaba abajo, al tocar Cobrar la pantalla
  saltaba. Los dos ocupan el mismo lugar.
- **Se descartó meter las acciones dentro de la tarjeta Cuentas.** La fila tiene su propio grupo con nombre, que los tests y un
  lector de pantalla encuentran; dentro de la tarjeta se confundía con los datos.

## Los tests

Se editaron dos de la 038 (la lista de botones sin Anular, y que Anular está fuera de la fila) y se sumó un bloque propio en
`PantallaMostrador.test.tsx`. "Arriba" se comprueba con `compareDocumentPosition` (el orden en el documento), porque jsdom no mide la
pantalla. Reusa `abrirConRopaLista`, `abrirDetalle`, `boton` y `accionesPrincipales`.

## Si mañana tenés que tocar esto

Si agregás una acción a la boleta, va en la fila (o la cuarta es el tope): con cinco botones vuelve el problema que esta spec quitó.
La confirmación de anular está en `DetalleOrden`; no la muevas junto con el botón por accidente.
