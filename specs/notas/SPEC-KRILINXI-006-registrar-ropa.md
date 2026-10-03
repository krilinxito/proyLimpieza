---
id: SPEC-KRILINXI-006
spec: specs/SPEC-KRILINXI-006-registrar-ropa.md
explica:
  - formatos de un monto (escrito
  - guardado
  - mostrado)
  - orden de la cola como contrato
  - validar todo antes de escribir
---

# SPEC-KRILINXI-006 — Registrar ropa: la orden y su adelanto

## Qué se construyó

La pantalla **Registrar ropa**: el empleado busca al cliente (o lo registra en el momento),
copia el número de la boleta, describe la ropa y pone el precio. Si el cliente deja
adelanto, anota cuánto y cómo pagó. Al final ve un resumen en bolivianos con lo que falta
pagar. Todo pasa en la tablet, con o sin internet.

## Cómo funciona, paso a paso

Seguimos a Rosa, que deja dos pantalones por Bs 50 y adelanta Bs 20,50 con QR.

1. **El paso del cliente reusa la 005.** `PantallaRegistrarRopa.tsx:24` monta
   `<PantallaClientes alElegir={…} />`: la misma búsqueda por teléfono que en `/clientes`.
   Como recibe `alElegir`, debajo de la tarjeta aparece "Es este cliente"
   (`PantallaClientes.tsx:140-144`). Al tocarlo, la pantalla pasa al paso `ropa` con Rosa
   elegida.
2. **El formulario solo junta texto.** `FormularioRopa.tsx` guarda lo que se escribe tal
   cual (`"50"`, `"20,50"`, `"2026-10-10"`) y, al guardar, llama a
   `registrar({ ...datos, cliente })` (`:44`). No valida nada por su cuenta.
3. **El hook pone quién y dónde.** `useRegistrarRopa.ts:21` lee la sesión y en `:27` llama a
   `registrarRopa(base, { usuarioId, sucursalId }, datos)`. La pantalla nunca elige la
   sucursal: sale de la sesión, igual que en el backend.
4. **Se valida todo antes de escribir nada.** En `registrarRopa` (`ordenesLocal.ts:68`):
   - `"50"` → `5000` centavos con `parsearMonto` (`:80`); `"20,50"` → `2050`;
   - el adelanto no puede pasar del precio (`:88`);
   - la boleta se busca entre las órdenes **de esta sucursal** (`:94`): cada sucursal
     tiene su talonario;
   - si quedó algún error (`:100`), se devuelve `{ tipo: 'invalida', errores }` y no se
     escribió ni una fila.
5. **Primero la orden.** `INSERT INTO ordenes` (`:109`) con `precio_total = aDecimal(5000)`
   = `"50.00"` (`:121`, `lib/money.ts:53`), `estado = 'RECIBIDO'` y `fecha_entrada` en ISO
   8601 con zona: los formatos que exige `POST /api/ordenes`.
6. **Después el adelanto.** `insertarPago` (`ordenesLocal.ts:126` → `pagosLocal.ts:31`)
   escribe el pago `ADELANTO` con `monto = "20.50"`. Como se escribió después, la cola lo
   sube después: cuando el servidor reciba el pago, la orden ya va a existir.
7. **El saldo.** `calcularSaldo` (`ordenesLocal.ts:146` → `saldo.ts:23`): `5000 − 2050 =
   2950`. La pantalla lo muestra con `formatearBs` (`lib/money.ts:104`) como "Bs 29,50".

## Dónde encaja en la arquitectura

Es la misma partición de la 005 (`api/` → hook → componentes), ahora con **dos features que
colaboran**:

- `features/ordenes/api/ordenesLocal.ts` llama a `features/pagos/api/pagosLocal.ts` y a
  `features/pagos/saldo.ts`. Una `api/` puede usar a otra: las dos son capa de datos.
- `features/ordenes/components/` usa componentes de `features/clientes/components/`. Un
  componente puede usar a otro.
- Lo que **no** puede pasar es que un componente salte a una `api/` (la de su feature o la
  de otra) o a la base. Eso lo vigila ahora `test/arquitectura.test.ts` para **todas** las
  features: en la 005 la regla vivía dentro de `features/clientes` y no habría visto a
  `ordenes`.

`saldo.ts` está en `features/pagos` y no en `lib/` porque es una regla del negocio (qué se
debe), no una herramienta genérica como `money` (cómo se suma). CLAUDE.md §6 admite
cualquiera de los dos lugares siempre que sea **uno solo**; lo importante es que
`ordenes-sucursal` y `entregar-ropa` lo importen de aquí y no lo vuelvan a escribir.

## Fundamentos

### Validar todo y después escribir todo

**Qué es.** `registrarRopa` hace todas las comprobaciones primero, incluida la consulta de
la boleta, y recién cuando no queda ninguna en contra hace los dos `INSERT`.

**Por qué.** La orden y su adelanto son una sola acción para el empleado. Si se guardara la
orden y después fallara la validación del adelanto, quedaría una orden **sin** el adelanto
que el cliente sí pagó. El empleado volvería a intentar, y como la boleta ya existe, la
app le diría "Ese número de boleta ya está usado": un error que él no cometió.

**Lo que no cubre.** La base local no ofrece transacciones a las features (`BaseLocal`
solo tiene `consultar` y `ejecutar`). Si SQLite fallara **entre** los dos `INSERT` (disco
lleno, por ejemplo), la orden quedaría sin adelanto. Es improbable, y el backend lo
repararía igual: el pago se puede registrar después. Si `BaseLocal` alguna vez expone
transacciones, este es el primer lugar donde usarlas.

### El orden de la cola es parte del contrato

**Qué es.** PowerSync sube los cambios **en el orden en que se escribieron**. El adelanto
se escribe después de la orden (`ordenesLocal.ts:109` y `:126`) a propósito.

**Qué pasaría al revés.** `POST /api/pagos` llegaría con un `orden_id` que el servidor
todavía no conoce, y lo rechazaría. El código se ve igual de correcto en los dos órdenes; la
diferencia solo aparece al subir. Por eso el test lo comprueba explícitamente: la cola
tiene que ser `['ordenes', 'pagos']`, en ese orden.

### Dos formatos para el mismo monto

El mismo dinero aparece de tres maneras, y cada una tiene su función en `lib/money`:

| Dónde | Ejemplo | Ida | Vuelta |
|---|---|---|---|
| Lo que escribe el empleado | `"20,50"` | `parsearMonto` | — |
| Lo que guarda la base local | `"20.50"` | `aDecimal` | `desdeDecimal` |
| Lo que se muestra | `"Bs 20,50"` | `formatearBs` | — |

En el medio, siempre centavos enteros (`2050`). **Por qué la base guarda texto y no un
número:** `NUMERIC(10,2)` en Postgres llega por PowerSync como `"20.50"`, y SQLite no tiene
decimales exactos. Guardarlo como `REAL` sería guardar un float. **Por qué `desdeDecimal` no
acepta coma:** el texto de la base no lo escribe una persona. Si llega `"20,50"` es que algo
se rompió, y es mejor enterarse que adivinar.

**Ya explicado antes:**

- **Dinero en centavos enteros** y **punto flotante** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Hook como puerta a los datos**, **errores esperados como valor de retorno** y **estado inicial sembrado** → SPEC-KRILINXI-005 (`specs/notas/SPEC-KRILINXI-005-clientes-mostrador.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Cola de subida** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)
- **Factory de datos de prueba** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)

## Decisiones y por qué

- **Solo EMPLEADO** (`rutas.tsx:31` y `:56`). El ADMIN no tiene sucursal ni órdenes en su
  dispositivo: no hay dónde guardar la orden ni contra qué comprobar la boleta.
- **Cada ruta puede tener su propio aviso** (`rutas.tsx:25`, `App.tsx:16`). Antes todas
  mostraban "Esta parte es solo para el administrador", y un ADMIN que abriera
  `/registrar-ropa` habría leído justo lo contrario de lo que pasa.
- **El cliente se elige con la pantalla de la 005**, con una prop `alElegir`, en vez de
  escribir otra búsqueda. Una sola búsqueda por teléfono significa una sola regla de
  normalización a mano.
- **El método de pago son cuatro opciones a la vista**, no un desplegable: un desplegable
  hay que abrirlo para saber qué tiene (CLAUDE.md §9).
- **El adelanto puede ser igual al precio** (pagó todo al dejar la ropa), pero no mayor.
  El backend no lo impide, porque un pago no conoce el precio en el mismo `INSERT`. Es
  cortesía local.
- **Los textos de error repiten los del backend**, salvo el del precio, que aquí dice
  "25,50" con coma: el empleado escribe con coma y el servidor recibe con punto.

## Los tests

- **Reusados:** `baseLocalDePrueba` con `sembrar` (Rosa y la boleta `000999` "ya
  sincronizadas"), `renderEnRuta`, `simularApi(() => 'sin-conexion')` y `sesionDePrueba`.
- **Movido a compartido:** `test/jerga.ts`. La lista de palabras prohibidas vivía dentro del
  test de clientes; ahora `sinJerga()` se llama en cada paso de las dos pantallas, y suma
  "orden" a la lista: en el mostrador se dice "ropa" o "boleta".
- **Generalizado:** la regla "los componentes pasan por un hook" está en
  `test/arquitectura.test.ts` para todas las features. Se comprobó con una mutación
  (importar `api/ordenesLocal` desde `ResumenRopa`): el test falló como debía.
- **Factory local:** `datosRopa({ cambios })` en `ordenesLocal.test.ts`. Es local a
  propósito: solo este archivo arma `DatosRopa`. Las specs siguientes van a **sembrar**
  órdenes, no a registrarlas.
- Un tropiezo que vale anotar: el helper `resumen()` leía las listas de datos de la
  pantalla, y la primera vez agarró la **tarjeta del cliente** del formulario, porque el
  resumen todavía no había aparecido. La solución fue esperar primero el aviso "Ropa
  registrada…". En un test de pantalla, esperá algo que solo exista en el estado que
  querés leer.

## Si mañana tenés que tocar esto

- Para cobrar más adelante (`ordenes-sucursal`), `insertarPago` ya existe en
  `features/pagos/api/pagosLocal.ts`: no valida, así que quien la llama compara el monto
  contra `calcularSaldo`.
- Si el backend empieza a aceptar órdenes del ADMIN desde el mostrador, el cambio no está
  acá sino en la sincronización: el admin necesitaría las órdenes de la sucursal en su
  dispositivo para validar la boleta.
- `fecha_entrada` sale del reloj de la tablet. Si una tablet tiene la hora mal, la orden
  queda con esa hora. Por ahora se acepta, porque es la hora en que el cliente estuvo ahí.
