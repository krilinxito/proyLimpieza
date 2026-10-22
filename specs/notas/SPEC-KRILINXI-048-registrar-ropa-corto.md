---
id: SPEC-KRILINXI-048
spec: specs/SPEC-KRILINXI-048-registrar-ropa-corto.md
explica: []
---

# SPEC-KRILINXI-048 — Registrar ropa más corto y sin pérdida de lo escrito

## Qué se construyó

El formulario de Registrar ropa pasó de pedir de entrada entre 6 y 8 cosas a pedir lo imprescindible: el adelanto solo
aparece si se elige "Deja adelanto", la fecha tiene tres botones ("Mañana", "En 3 días", "En una semana") además del
selector, y si hay algo escrito, "Volver al mostrador sin guardar" pregunta antes de tirarlo. Lo que se guarda no cambió.

## Cómo funciona, paso a paso

Seguimos a una empleada que registra la ropa de Rosa con 20 Bs de adelanto y luego se arrepiente de salir.

1. **Entra al formulario.** `PantallaMostrador` muestra `RegistrarEnMostrador` (`PantallaMostrador.tsx`, rama `registrando`), que lee el
   cliente de la ficha, si lo hay, y monta `FormularioRopa` (`RegistrarEnMostrador.tsx`). El adelanto empieza en "No deja
   adelanto": `useState(false)` en `FormularioRopa.tsx:47`. Con eso, ni el importe ni la forma de pago existen en pantalla.
2. **Elige la fecha.** Los botones salen de `atajosDeFecha(hoyEnBolivia())` (`FormularioRopa.tsx:161`). `hoyEnBolivia()` es el día del
   negocio con la hora corregida de la tablet (`lib/diaDelNegocio.ts`), y `atajosDeFecha` solo suma días a ese texto
   `YYYY-MM-DD` (`atajosDeFecha.ts`). Un toque llama a `cambiar('fechaEstimada')` y llena el mismo campo de siempre.
3. **Elige "Deja adelanto".** Cambia `dejaAdelanto` y aparecen el importe y `ElegirMetodo` (`FormularioRopa.tsx:204`).
4. **Intenta salir.** `FormularioRopa` calcula `hayEscrito` en cada render (`:59`): hay un cliente elegido a mano, o algún campo
   con texto. Un `useEffect` se lo cuenta a quien lo montó con `alCambiarEscrito` (`:63`). `PantallaMostrador` lo guarda en su
   estado (`:130`) y, al tocar "Volver al mostrador sin guardar", hace una de dos cosas (`:163`): si no hay nada escrito,
   vuelve; si hay, abre el `ModalConfirmacion` ("¿Salir sin guardar?"). Solo "Sí, salir" descarta; "Seguir escribiendo"
   cierra el aviso y deja el formulario como estaba.
5. **Guarda.** Si eligió "Deja adelanto" pero dejó el importe vacío, `guardar` frena con un mensaje antes de tocar la base
   (`:79`). Si no, llama a `registrar` con los mismos datos de antes.

## Dónde encaja en la arquitectura

Es todo capa de pantalla (`features/*/components`): decide qué se muestra y cuándo preguntar. No toca la validación, que sigue en
`features/ordenes/api/ordenesLocal` (CLAUDE.md §5: los componentes no consultan la base), ni la transacción de alta + orden + adelanto de
SPEC-KRILINXI-034. La razón de que el aviso de "hay algo escrito" suba por una función (`alCambiarEscrito`) y no se calcule en
`PantallaMostrador`: lo escrito vive en el estado del formulario, y duplicarlo arriba sería tener dos verdades.

## Fundamentos

**Ya explicado antes:**

- **Lo que se oculta no puede seguir contando** → SPEC-KRILINXI-046 (`specs/notas/SPEC-KRILINXI-046-entregar-sin-saldo.md`). Acá aparece
  en `elegirAdelanto` (`FormularioRopa.tsx`): al volver a "No deja adelanto" se vacían el importe y la forma de pago, porque si no
  seguirían en el estado y viajarían en el `registrar`, creando un pago que ya no se ve en pantalla.
- **Funciones puras testeables** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`). `atajosDeFecha` recibe el día y devuelve
  fechas, sin leer el reloj: por eso su test cruza fin de mes, de año y 29 de febrero sin congelar nada.
- **Preparar y confirmar** → SPEC-KRILINXI-009 (`specs/notas/SPEC-KRILINXI-009-entregar-ropa.md`): el aviso de salir es la misma idea, avisar antes de lo que no se
  puede deshacer.

## Decisiones y por qué

- **Dos opciones visibles ("No deja" / "Deja"), no un interruptor ni un botón "Agregar adelanto".** Un botón que despliega algo obliga
  a descubrirlo; dos opciones a la vista dicen que hay que contestar. Se usa el mismo estilo que `ElegirMetodo`.
- **El cliente que viene de la ficha no cuenta como escrito.** Es lo que ya había antes de abrir el formulario; preguntar por eso
  sería molestar sin que se pierda nada. En cambio, uno elegido en el buscador sí cuenta, aunque la ropa esté vacía: son pasos que se rehacen.
- **Los atajos son botones, no un campo que reemplaza al selector.** El selector sigue sirviendo para cualquier otra fecha.
- **No se agregó una confirmación al guardar.** Solo se protege el descarte.

## Los tests

Se reusó `abrir`, `elegirARosa` y `escribir` de `RegistrarEnMostrador.test.tsx`, y se sumó `dejaAdelanto()` porque cuatro tests ahora
empiezan por ahí. Los atajos se prueban contra `sumarDias(hoyEnBolivia(), n)`: la tablet de pruebas usa la zona de La Paz, así que
no hace falta congelar el reloj para que el resultado no cambie de un día a otro. La lógica de calendario tiene su propio test puro.

## Si mañana tenés que tocar esto

Empezá por `FormularioRopa.tsx`. Si agregás un campo, sumalo a la lista de `hayEscrito` o el aviso de salir no lo verá.
Cuidado con `elegirAdelanto`: todo lo nuevo que dependa de "dejaAdelanto" tiene que limpiarse ahí.
