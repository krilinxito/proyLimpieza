---
id: SPEC-KRILINXI-008
spec: specs/SPEC-KRILINXI-008-ordenes-sucursal.md
explica:
  - estado derivado (lo que se muestra no es lo guardado)
  - regla copiada atada al original con un test
---

# SPEC-KRILINXI-008 — La ropa de la sucursal: ver, avanzar, anular y cobrar

## Qué se construyó

**Ropa en el local**: la lista de lo que está en la sucursal y todavía no se entregó, con
cuánto debe cada cliente. Se busca por boleta o por teléfono. Al tocar una ropa se ve su
detalle, y desde ahí se la pasa a "En proceso" o "Lista", se anula (con confirmación) o se
cobra a cuenta. **Cobrar** del menú lleva a la misma pantalla.

## Cómo funciona, paso a paso

Seguimos la boleta `000001` de Rosa (Bs 50, con Bs 20 de adelanto), que se pone a lavar y
recibe un cobro de Bs 10.

1. **La lista.** `/ropa` monta `<PantallaRopa />` (`pages/rutas.tsx:76`). La pantalla pide
   `ropa.abiertas()` al hook `useRopa`, que llama a `listarAbiertas(base, sucursalId)`
   (`ropaLocal.ts:116`) con la sucursal de la sesión.
2. **Una consulta con JOIN.** `SELECT_ORDENES` (`ropaLocal.ts:31`) trae cada orden con su
   cliente y su **entrega**, si la tiene (`:37`). Los pagos se leen aparte, todos de una vez,
   y se agrupan por orden.
3. **Fila → vista.** `aOrden` (`:80`) convierte cada fila. El estado **no** se copia de la
   columna: pasa por `estadoEfectivo` (`:93` → `estado.ts:35`). Los montos se convierten de
   `"50.00"` a centavos con `desdeDecimal`, y el saldo sale de `calcularSaldo` (`:101`):
   `5000 − 2000 = 3000`. La tarjeta muestra "Falta pagar Bs 30,00".
4. **Solo las abiertas.** El filtro va **después** de calcular el estado efectivo (`:120`),
   no en el SQL, para que la regla de qué está cerrado viva en un solo lugar.
5. **El detalle ofrece lo que se puede hacer.** `DetalleOrden` arma los botones con
   `avancesDesde('RECIBIDO')` (`DetalleOrden.tsx:110` → `estado.ts:57`), que devuelve
   "Empezar a lavar" y "Marcar como lista".
6. **Avanzar.** "Empezar a lavar" → `ropa.cambiarEstado(id, 'EN_PROCESO')`
   (`DetalleOrden.tsx:60`) → `cambiarEstado` (`ropaLocal.ts:148`). Vuelve a leer la orden,
   comprueba con `puedePasarA` (`:157`) y escribe **solo la columna `estado`** (`:160`). La
   cola anota un `PATCH` con `{ estado: 'EN_PROCESO' }`, que es lo que espera
   `PATCH /api/ordenes/:id`.
7. **Cobrar.** `cobrar` (`:165`) no deja pasar de lo que falta (`:182`) y escribe un pago
   `ADELANTO` con `insertarPago`, la misma función de la 006. El detalle se vuelve a leer y
   muestra "Falta pagar Bs 20,00".

## Dónde encaja en la arquitectura

Es el mismo reparto que en las specs anteriores (`api/` → hook → componentes), con dos
piezas nuevas que son **reglas**, no pantallas:

- `features/ordenes/estado.ts`: qué estado se muestra y qué avances se permiten. No sabe de
  SQL ni de React; es lógica pura y por eso se prueba sin base ni pantalla.
- `features/ordenes/api/ropaLocal.ts` **usa** esas reglas antes de escribir. Los
  componentes **también** las usan para decidir qué botones mostrar. Las dos capas consultan
  la misma regla, no dos copias.

`DetalleOrden` acepta `accionesExtra` (`DetalleOrden.tsx:120`): un hueco para que
`entregar-ropa` agregue su botón sin reescribir el detalle. Es lo mismo que la prop
`alElegir` de la pantalla de clientes en la 006.

## Fundamentos

### Estado derivado: lo que se muestra no es lo que está guardado

**Qué es.** El estado que ve el empleado se **calcula** a partir de dos datos guardados (la
columna `estado` y si existe una entrega), en vez de leerse tal cual de la columna.

**Por qué existe aquí.** Quien pone `ENTREGADO` es el servidor, al recibir la entrega
(SPEC-ALE186-006). En la tablet, entre que se registra la entrega y que vuelve la
sincronización, la orden sigue diciendo `LISTO`. Si la pantalla leyera la columna, esa ropa
aparecería en "Ropa en el local" como pendiente de entrega **después de haberla
entregado**, y alguien podría intentar entregarla otra vez.

**Por qué en un solo lugar.** `estadoEfectivo` (`estado.ts:35`) es una línea. La tentación
es repetirla donde haga falta, y entonces la lista la aplica, el detalle la olvida y la
pantalla de entrega (009) la vuelve a escribir distinta. Con una sola función, un test que
la rompe a propósito hace fallar 6 tests en tres archivos: los que dependen de ella se
enteran.

### Una regla copiada, con un test que la ata al original

**Qué es.** `ORIGENES` (`estado.ts:26`) es una copia de la tabla del backend
(`backend/src/utils/dominio.ts`). Copiar está mal en general, pero aquí no hay alternativa:
frontend y backend son paquetes separados, y la tablet necesita la regla **sin conexión**.

**El test.** `origenesDelBackend` (`estado.test.ts:12`) lee el archivo del backend como
texto, extrae la tabla con una expresión regular y la compara con la copia (`:29`). Si ale186
agrega un estado o cambia una transición, el test del frontend falla en el mismo PR. Sin
este test, el empleado vería botones que después el servidor rechaza, y el registro
terminaría en "para corregir" sin que nadie entienda por qué.

**Ya se usó antes** con otra forma: `schema.test.ts` (SPEC-KRILINXI-004) lee las sync
rules y el SQL del schema. Es el concepto "test contra la fuente de verdad" de la
SPEC-KRILINXI-002; aquí la fuente de verdad está en **otro paquete** del monorepo.

**Ya explicado antes:**

- **Máquina de estados** → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Test contra la fuente de verdad** → SPEC-KRILINXI-002
- **Validar todo antes de escribir**, **formatos de un monto** → SPEC-KRILINXI-006
- **Hook como puerta a los datos**, **estado inicial sembrado** → SPEC-KRILINXI-005
- **Factory de datos de prueba** → SPEC-ALE186-002
- **Doble envío (estado y ref)** → SPEC-KRILINXI-002: es por eso que hubo que esperar al
  botón en el test de anular (ver "Los tests")

## Decisiones y por qué

- **`/cobrar` es la misma pantalla que `/ropa`**, con otro título. Para cobrar, primero hay
  que encontrar la boleta, y la búsqueda ya está ahí. Una pantalla de cobro aparte habría
  repetido la búsqueda.
- **Se cobra como `ADELANTO`.** Antes de la entrega todo cobro es a cuenta; el
  `PAGO_FINAL` lo registra la entrega (009).
- **No se cobra más de lo que falta.** El backend no lo impide (un pago no conoce el saldo
  en su `INSERT`). Es cortesía local, para no generar saldos a favor por un dedo de más.
- **Buscar prueba boleta y teléfono a la vez.** Una boleta también son dígitos, y preguntar
  "¿es boleta o teléfono?" es un paso de más (CLAUDE.md §9).
- **La lista ordena de la más vieja a la más nueva**: lo que lleva más tiempo en el local es
  lo primero que hay que mirar.
- **Fuera de scope, pero tocado:** `lib/powersync/control.ts` dejó de registrar como error
  el caso en que la base se cierra mientras el aviso escucha. Ensuciaba la salida de todos
  los tests de pantalla con base real.

## Los tests

- **Nuevo, `test/filasDePrueba.ts`:** `clienteDePrueba`, `ordenDePrueba`, `pagoDePrueba` y
  `entregaDePrueba`. Cada uno arma una fila válida, con la sucursal de la empleada de
  prueba, para `sembrar`. La 009 lo usa así:
  ```ts
  const orden = ordenDePrueba({ cliente_id: rosa.id, estado: 'LISTO' });
  await sembrar('ordenes', [orden]);
  ```
- **Reusados:** `baseLocalDePrueba` y `sembrar`, `renderEnRuta`, `simularApi`, `sinJerga` y
  `sesionDePrueba`.
- **`sucursalConRopa()`** en `ropaLocal.test.ts` siembra una sucursal con ropa en todos los
  estados (recibida, lista, anulada, entregada sin sincronizar y de otra sucursal), y cada
  test mira lo suyo.
- **Mutación:** `estadoEfectivo` sin la entrega → fallan 6 tests.
- **Un tropiezo:** en el test de anular, el segundo toque en "Anular" no hacía nada. `Boton`
  queda ocupado hasta que termina su acción (la protección contra el doble toque de la 002),
  y el test volvía a tocar antes de que React aplicara el "ya terminé". La solución es
  esperar a que el botón esté habilitado, como esperaría una persona:
  `await waitFor(() => expect(anular).toBeEnabled())`.

## Si mañana tenés que tocar esto

- **Un estado nuevo** se agrega en el backend, en `lib/dominio.ts` (con su texto) y en
  `estado.ts`. Los tests de comparación dicen si falta alguno.
- **Editar una orden** (precio, descripción) sería otra función en `ropaLocal.ts`. El
  `PATCH` ya lo acepta el backend y lo sube la cola.
- La lista lee **todas** las órdenes de la sucursal y filtra en JavaScript. Con miles de
  órdenes entregadas, convendría filtrar en el SQL las que tienen `estado` cerrado **y**
  entrega. Hoy no hace falta.
