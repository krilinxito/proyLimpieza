---
id: SPEC-KRILINXI-009
spec: specs/SPEC-KRILINXI-009-entregar-ropa.md
explica:
  - preparar y confirmar (validar dos veces)
  - una escritura que el dispositivo no hace
---

# SPEC-KRILINXI-009 — Entregar la ropa: con o sin boleta, y el pago final

## Qué se construyó

**Entregar ropa**: el cliente vuelve, se busca su boleta (o su teléfono), y desde el detalle
se toca "Entregar la ropa". Se elige si trae la boleta (si no, se anotan nombre y carnet de
quien retira), se ajusta el precio final si hace falta y se cobra lo que paga. Antes de
guardar, una confirmación dice si queda debiendo algo. Con esto, el mostrador cubre el
recorrido completo: registrar, avanzar, cobrar y entregar.

## Cómo funciona, paso a paso

Rosa vuelve por la boleta `001234` (Bs 50, adelantó Bs 20), trae el papel y paga Bs 15.

1. **La pantalla es la de la 008, con una acción más.** `PantallaEntregar` monta
   `PantallaRopa` y le pasa `accionesExtra` (`PantallaEntregar.tsx:29`), que dibuja
   `AccionEntregar` (`:10`) dentro del detalle. La búsqueda, el estado y el saldo son los
   mismos de "Ropa en el local".
2. **El formulario arranca con el precio de la orden.** `aDecimal(5000)` = `"50.00"`
   (`FormularioEntrega.tsx:42`), que `parsearMonto` puede volver a leer. Con el formato de
   pantalla ("1.234,56") no podría.
3. **Primer toque en "Entregar": revisar sin escribir.** `revisar` (`:55`) llama a
   `entregar.preparar` (`:60`) → `prepararEntrega` (`entregasLocal.ts:52`). Esa función lee
   la orden con `obtenerOrden` de la 008, rechaza una anulada o ya entregada **por su estado
   efectivo** (`:61`), exige nombre y carnet si no hay boleta (`:69`) y no deja cobrar más
   de lo que falta (`:85`). Si todo está bien, calcula `saldoDespues` con `calcularSaldo`
   (`:106`): `5000 − (2000 + 1500) = 1500`. **No escribe nada.**
4. **La confirmación.** Con la entrega preparada (`FormularioEntrega.tsx:65`) se abre
   `ModalConfirmacion`, y como `saldoDespues > 0` el mensaje agrega "El cliente queda
   debiendo Bs 15,00." (`:88`).
5. **"Sí, entregar": validar otra vez y escribir.** `guardar` (`:73`) llama a
   `registrarEntrega` (`entregasLocal.ts:115`), que **vuelve a pasar por
   `prepararEntrega`** (`:121`), inserta la entrega (`:128`) y después el pago
   `PAGO_FINAL` (`:152`). La cola queda con `PUT entregas` y `PUT pagos`, en ese orden.
6. **Lo que no pasa:** no hay `UPDATE ordenes`. En la base, `estado` sigue en `LISTO`, pero
   la orden ya tiene entrega, así que `estadoEfectivo` (SPEC-KRILINXI-008) la muestra
   "Entregado": sale de la lista y no ofrece más acciones. Cuando sincroniza, el servidor la
   pasa a `ENTREGADO` en la misma sentencia que inserta la entrega (SPEC-ALE186-006), y las
   dos fuentes coinciden.

## Dónde encaja en la arquitectura

- `features/entregas/` repite el reparto de siempre: `api/entregasLocal.ts` (SQL y reglas),
  `hooks/useEntregar.ts` (base y sesión) y `components/` (pantalla, formulario y resumen).
- **Reusa, no copia**: `obtenerOrden` y `estadoEfectivo` de `ordenes`, `calcularSaldo` e
  `insertarPago` de `pagos`, y `ElegirMetodo` y `PantallaRopa` de `ordenes/components`. Una
  `api/` usa otra `api/`; un componente usa otro componente. Ningún componente toca una
  `api/` ni la base (lo vigila `test/arquitectura.test.ts` desde la 006).
- **El hueco `accionesExtra`** que dejó la 008 es lo que permitió sumar "Entregar" sin
  editar `DetalleOrden`. Lo único que se tocó del detalle fue el aviso de por qué una ropa
  cerrada no ofrece acciones, que sirve para las dos pantallas.

## Fundamentos

### Preparar y confirmar: validar dos veces a propósito

**Qué es.** La entrega se valida **dos veces**: al tocar "Entregar" (`prepararEntrega`,
para armar la confirmación) y al confirmar (`registrarEntrega` llama de nuevo a
`prepararEntrega` antes de escribir).

**Por qué no alcanza con la primera.** Entre las dos validaciones hay una persona leyendo un
cartel, a veces con el cliente hablándole. En ese tiempo pueden cambiar cosas: otra pestaña
pudo registrar la misma entrega, o el formulario cambió. Si `registrarEntrega` confiara en
lo que se validó antes, podría escribir una segunda entrega sobre una ropa ya entregada.
El test "no se entrega dos veces" lo cubre.

**Por qué hace falta la primera.** La confirmación tiene que decir **cuánto queda
debiendo**, y ese número sale de validar: hay que leer el monto, el precio final y los
pagos. Sin un paso que calcule sin escribir, habría que escribir para saberlo, y entonces la
confirmación ya no confirmaría nada.

### Una escritura que el dispositivo no hace

**Qué es.** Lo más importante de esta spec es algo que **no** hace: no escribe
`ordenes.estado = 'ENTREGADO'`.

**Por qué.** En este proyecto el servidor es dueño de ese cambio (CLAUDE.md §6): lo hace en
la misma sentencia que inserta la entrega, para que nunca exista una orden ENTREGADO sin
entrega ni al revés. Si la tablet además subiera un `PATCH` a ENTREGADO, el backend lo
rechazaría con 409 (la transición está prohibida a propósito), y el registro aparecería en
"para corregir" por algo que el empleado hizo bien.

**Cómo se ve igual.** La tablet no necesita escribir el estado para **mostrarlo**:
`estadoEfectivo` lo deriva de la entrega. Es el mismo dato visto desde dos lados: en el
servidor se guarda, en el dispositivo se calcula. Una mutación (agregar el `UPDATE`) hace
fallar los dos tests que lo vigilan.

**Ya explicado antes:**

- **Estado derivado** y **regla copiada atada al original** → SPEC-KRILINXI-008 (`specs/notas/SPEC-KRILINXI-008-ordenes-sucursal.md`)
- **Validar todo antes de escribir** y **el orden de la cola como contrato** → SPEC-KRILINXI-006
- **Atomicidad de una sentencia** y **CTE que modifica datos** → SPEC-ALE186-006 (el lado del servidor de esta misma entrega)
- **Errores esperados como valor de retorno** → SPEC-KRILINXI-005

## Decisiones y por qué

- **Se puede entregar con saldo pendiente, con confirmación** (krilinxito, 2026-10-03).
  Bloquearlo obligaría a inventar un pago cuando el negocio decide fiar; no avisar dejaría
  pasar descuidos.
- **El precio final viene cargado y se puede cambiar.** Cero también vale (se perdonó el
  cobro). Si el cliente ya había pagado más que el nuevo precio, el saldo queda negativo: un
  saldo a favor que se ve en el detalle.
- **Con boleta no se guardan nombre ni carnet**, aunque el backend los aceptaría. El
  formulario ni siquiera los pide: un campo de más es un paso de más (CLAUDE.md §9).
- **La sucursal de la entrega es la del empleado**, que es la de la orden porque
  `obtenerOrden` solo encuentra órdenes de su sucursal. La ropa se retira donde se dejó.
- **`/entregar` pasó a ser solo para EMPLEADO.** Con esto, el ADMIN solo ve Clientes y
  Estadísticas en el menú.

## Los tests

- **Reusados:** `filasDePrueba` (de la 008) para sembrar la orden, el adelanto y una entrega
  previa; `baseLocalDePrueba` y `sembrar`, `renderEnRuta`, `simularApi` y `sinJerga`.
- **Factory local** `datosEntrega({ cambios })`: una entrega con boleta, al precio de la
  orden y sin cobro, y cada test cambia lo suyo. Es local porque solo este archivo arma
  `DatosEntrega`.
- **De punta a punta:** `PantallaEntregar.test.tsx` entrega, vuelve a la lista y comprueba
  que la ropa ya no está, que buscándola figura "Entregado" y que no ofrece entregarla otra
  vez. Es el criterio del estado derivado probado desde la pantalla.
- **Mutación:** agregar `UPDATE ordenes SET estado = 'ENTREGADO'` → fallan 2 tests.

## Si mañana tenés que tocar esto

- **Deshacer una entrega** no existe ni en el backend: es irreversible a propósito. Si el
  negocio lo necesita, es una spec de los dos lados.
- **El resumen sale de la entrega preparada**, no de releer la base. Si se agrega algo que
  el servidor calcule distinto, el resumen podría diferir de lo que se ve después de
  sincronizar.
- El formulario de entrega queda **dentro** del detalle, junto a los otros botones. Si
  molesta visualmente, es material para la ola de mejoras de UI, no un cambio de esta spec.
