---
id: SPEC-KRILINXI-046
spec: specs/SPEC-KRILINXI-046-entregar-sin-saldo.md
explica:
  - lo que se oculta no puede seguir contando (el envio no sale del estado del formulario sin mas)
---

# SPEC-KRILINXI-046 — Entregar una boleta ya pagada sin pedir montos

## Qué se construyó

Al entregar una boleta que **ya está pagada por completo**, el formulario ya no muestra ningún campo de dinero ("Precio final",
"Cuánto paga ahora", "¿Cómo paga?"). En su lugar dice **"Ya está todo pagado: no hay nada que cobrar."** y entregar es elegir
si el cliente trae la boleta y tocar Entregar. Antes los campos aparecían igual, a pesar de que el mismo formulario ya decía
"No falta pagar nada.", y daban a entender que había que escribir un monto. Es solo frontend, un componente.

## Cómo funciona, paso a paso

Seguimos la boleta 001240 de Rosa: Bs 50, con un adelanto de 20 y un pago de 30 ya hechos.

1. **El Mostrador abre el detalle** y, al tocar "Entregar la ropa", `AccionEntregar` monta `FormularioEntrega` con la
   `OrdenVista` de la boleta (`features/entregas/components/FormularioEntrega.tsx`).
2. **Se decide si está pagada** (`:64`): `orden.saldo <= 0`. `saldo` lo calculó `armar` en `ropaLocal` con la única regla de saldo del
   proyecto (`pagos/saldo.ts`: precio − pagos, mientras la ropa no tenga entrega): 50 − (20 + 30) = 0. Cero o menos (una boleta de
   precio cero, o cobrada de más) cuenta como pagada; con un centavo por cobrar, no.
3. **Se dibuja una cosa u otra** (`:169`): con `yaPagada`, un `Aviso` de éxito; si no, los campos de siempre. Lo demás (la pregunta
   de la boleta, nombre y carnet si no la trae, los botones) es igual.
4. **Se arma lo que se manda** (`:72`, `datosAEnviar`): en una boleta pagada, el precio final es el de la boleta
   (`aDecimal(orden.precioTotal)`), el pago final está vacío y no hay método. Ese objeto, y no el estado del formulario, es el que
   llega a `entregar.preparar` (`:81`) y `entregar.registrar` (`:97`).
5. **La validación y el guardado no cambiaron** (`api/entregasLocal.ts`): con pago vacío, `prepararEntrega` no valida ningún pago, la
   confirmación calcula `saldoDespues = 0` y por eso no dice "queda debiendo", y `registrarEntrega` escribe solo la entrega: la cola
   queda con un único `PUT entregas`, sin `pagos`.

## Dónde encaja en la arquitectura

Es una decisión de **presentación** (qué campos ve quien entrega) y por eso vive en el componente; la **regla** (cuándo una entrega es
válida, qué se escribe) sigue en `api/entregasLocal.ts`, que no se tocó, y el saldo sigue calculándose en un solo lugar
(CLAUDE.md §6). El servidor tampoco cambia: sigue validando la entrega y el paso a ENTREGADO (§6, "lo que valida el cliente es
cortesía"). Esconder un campo no es una validación: si por algún camino llegara un pago de más, `prepararEntrega` lo seguiría
rechazando.

## Fundamentos

**Lo que se oculta no puede seguir contando.** Un formulario tiene un *estado* (lo que hay escrito en cada campo) y una *vista*
(lo que se ve). Ocultar un campo cambia la vista, **no el estado**: si alguien había escrito "30" en "Cuánto paga ahora" y la
boleta pasa a estar pagada (por ejemplo, un cobro que baja de otra tablet), el campo desaparece pero el "30" sigue guardado. Si
el envío se armara directo del estado, mandaría un pago que nadie ve y que la validación rechazaría con un error de un campo que
no existe en pantalla, imposible de corregir. Por eso la entrega se arma con `datosAEnviar`, que **pisa** los campos de dinero
cuando están ocultos: lo que no se ve no se envía. Es la misma idea de "estado derivado" que ya explicó la 008 (lo que se muestra no es
lo guardado), vista desde el lado de los formularios.

**Ya explicado antes:**

- **Estado derivado (lo que se muestra no es lo guardado)** → SPEC-KRILINXI-008 (`specs/notas/SPEC-KRILINXI-008-ordenes-sucursal.md`)
- **Preparar y confirmar (validar dos veces)** → SPEC-KRILINXI-009 (`specs/notas/SPEC-KRILINXI-009-entregar-ropa.md`)

## Decisiones y por qué

- **Se ocultan los dos campos, el precio final también** (decisión tuya). Consecuencia: en una boleta ya pagada **no se puede cargar un
  recargo al entregar** (por almacenamiento, etc.), porque el precio final deja de ser editable. *Descartado:* dejar visible el
  precio final, que conservaba el recargo pero mantenía un campo de dinero en una boleta sin deuda.
- **"Pagada" es `saldo <= 0`, no `=== 0`.** Una boleta cobrada de más no tiene nada más que cobrar: pedirle un monto sería peor.
- **Un aviso y no solo ocultar.** Si los campos simplemente desaparecieran, quien entrega no sabría por qué. El aviso lo dice, en
  palabras, y es de éxito: es una buena noticia, no una advertencia.
- **No se tocó `entregasLocal.ts`.** Entregar sin pago ya era válido (el pago es opcional); lo que estaba mal era lo que se mostraba.

## Los tests

Seis tests nuevos en `EntregarEnMostrador.test.tsx` (bloque "Entregar una boleta ya pagada", etiquetado SPEC-KRILINXI-046), sobre la
`App` con la base local de verdad: sin campos de dinero y con el aviso; entregar sin monto (confirmación sin deuda, entrega a Bs 50,00 y
**cola con un solo `PUT entregas`**); sin boleta sigue pidiendo nombre y carnet; pagada en partes y de precio cero; con saldo, el
formulario de siempre; y una sola acción principal. Primero se escribieron y fallaron (tres, los de ocultar); después se hizo el
cambio. Los 12 tests de entrega de la 009 y la 033 pasan sin tocarse.

Se reusaron `abrirEntrega`, `escribir`, `resumen` y las factories de `filasDePrueba`; el único agregado es `abrirConPagadas` (el mismo
armado de `abrir`, con dos boletas pagadas más) y `confirmacionDe`, que es `pedirConfirmacion` para cualquier boleta.

## Si mañana tenés que tocar esto

Si hace falta cargar un recargo en una boleta ya pagada, hay dos caminos: volver a mostrar solo el "Precio final" cuando la boleta está
pagada, o agregar un enlace "Cambiar el precio final". Cualquiera de los dos obliga a revisar `datosAEnviar`, que hoy fija el precio de
la boleta.
