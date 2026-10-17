---
id: SPEC-KRILINXI-025
spec: specs/SPEC-KRILINXI-025-estilo-mostrador.md
explica:
  - contenido permitido dentro de un boton
  - listas de definiciones (dl dt dd)
---

# SPEC-KRILINXI-025 — Pantallas del mostrador con el tema

## Qué se construyó

Las pantallas que se usan todo el día —Registrar ropa, Ropa en el local, Cobrar, Entregar ropa y
Clientes— dejaron de pintar a mano: cada boleta de la lista es una tarjeta con su estado en una
insignia de color, el detalle se agrupa en "La ropa", "Cuentas" y "Pagos" con lo que falta pagar en
grande, y los mensajes son avisos del tema. Ningún texto ni comportamiento cambió.

## Cómo funciona, paso a paso

Rosa abre `/ropa` y ve la boleta 000001, recibida, con Bs 30 por cobrar.

1. `ropaLocal` arma cada `OrdenVista` con el estado **efectivo** (`estadoEfectivo`: ENTREGADO si ya
   tiene entrega en la tablet), como desde SPEC-KRILINXI-008.
2. `TarjetaOrden` (`frontend/src/features/ordenes/components/TarjetaOrden.tsx:18`) dibuja la tarjeta.
   El estado va en una `Insignia` (`TarjetaOrden.tsx:26`) con la palabra de `TEXTO_ESTADO_ORDEN` y el
   tono de `TONO_ESTADO` (`frontend/src/features/ordenes/estado.ts:48`): RECIBIDO es neutro.
3. Rosa la toca. `DetalleOrden` arma dos grupos de pares dato/valor —`laRopa` y `cuentas`
   (`DetalleOrden.tsx:84` y `:91`)— y los pone en tres `Tarjeta` con `nivel={3}` (`DetalleOrden.tsx:103`
   en adelante), porque el detalle ya tiene su `h2` "Boleta 000001".
4. "Falta pagar" va aparte (`DetalleOrden.tsx:111`), en tamaño 3xl y en tono de peligro porque el saldo
   es mayor que cero; pagado, sería tono de éxito.

## Dónde encaja en la arquitectura

- **Qué color le toca a un estado es una regla del negocio**, así que vive en la feature
  (`estado.ts`), junto a las otras reglas de estado, y no en `components/`. `Insignia` no sabe qué es
  una orden: recibe un tono. Si mañana LISTO tiene que destacarse más, se cambia una línea de
  `TONO_ESTADO`, y la lista y el detalle cambian juntos.
- **`Tarjeta` ganó `nivel`** (`components/Tarjeta.tsx`): la pieza compartida no puede adivinar dónde la
  ponen, así que quien la usa dice qué nivel de encabezado le corresponde.

## Fundamentos

**Lo que puede ir dentro de un botón.** Un `<button>` solo admite *contenido de frase*: texto y
elementos en línea como `<span>`, nunca un `<div>`, un `<section>` ni un `<dl>`. El navegador "arregla"
el HTML inválido a su manera, y los lectores de pantalla pueden leer mal el resultado. Por eso
`TarjetaOrden` —que es un botón entero, para tocarlo con el dedo— no usa `Tarjeta` (un `<div>`): repite
sus clases, y todo lo de adentro son `<span>`, incluida la `Insignia`.

**Listas de definiciones (`<dl>`, `<dt>`, `<dd>`).** Para pares "dato: valor" (Cliente: Rosa Quispe;
Falta pagar: Bs 30,00), HTML tiene un elemento propio: `<dt>` es el nombre del dato y `<dd>` su valor.
Un lector de pantalla los anuncia como pares, y los tests los buscan igual: `datoDelDetalle`
(`frontend/src/features/ordenes/components/PantallaRopa.test.tsx:36`) encuentra el `<dt>` por su texto y
lee el `<dd>` que le sigue. Por eso, al destacar "Falta pagar", se lo sacó de la lista general pero
**siguió siendo un par `<dt>`/`<dd>`**: cambió cómo se ve, no qué es.

**Ya explicado antes:**

- **Tokens de diseño** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)
- **Regiones vivas (`role="status"` y `"alert"`)** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)
- **Regiones de la página (landmarks)** → SPEC-KRILINXI-023 (`specs/notas/SPEC-KRILINXI-023-marco-app.md`)

## Decisiones y por qué

- **Tonos sobrios.** Solo LISTO (éxito: se puede entregar) y ANULADO (peligro: no se toca) se
  destacan; RECIBIDO y ENTREGADO son neutros y EN_PROCESO información. Si todo tiene color, nada se
  destaca.
- **La opción elegida (método de pago, trae la boleta) se marca también en negrita**, no solo con el
  borde azul: la diferencia entre dos tonos se pierde con la edad.
- **El aviso de "ya fue entregada" o "fue anulada" es información**, no advertencia: no pasó nada malo,
  solo se dice por qué no hay botones.

## Los tests

- **Reusé** los `abrir()`, `abrirDetalle()` y `abrirClientes()` de cada pantalla, que ya siembran
  órdenes en distintos estados en la base local de verdad. Los tests nuevos son un `describe` más al
  final de cada archivo, con la etiqueta de esta spec.
- **Las pruebas de la paleta** miran clases (`bg-fondo`, `text-peligro-texto`), porque jsdom no pinta;
  las de accesibilidad miran roles y nombres (`region` "Cuentas", `heading` de nivel 3, `alert`).
- La suite pasó también en modo lento (`LENTO_MS=200`).

## Si mañana tenés que tocar esto

Para cambiar el color de un estado: `TONO_ESTADO` en `estado.ts`. Para mover un dato del detalle:
`laRopa` o `cuentas` en `DetalleOrden.tsx`, y que siga siendo un par `<dt>`/`<dd>` o los tests de
`PantallaRopa.test.tsx` no lo van a encontrar. Y si formateás con Prettier: `--single-quote
--print-width 120`, solo los archivos que tocaste (CLAUDE.md §10).
