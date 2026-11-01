---
id: SPEC-KRILINXI-071
spec: specs/SPEC-KRILINXI-071-admin-edita-boleta.md
explica:
  - decidir antes de escribir dentro de una transaccion
  - probar las sync rules corriendo sus consultas en postgres
  - reemplazar una coleccion entera comparando con lo guardado
  - una transaccion que cruza varios models (conexion compartida)
---

# SPEC-KRILINXI-071 — El admin corrige una boleta registrada

## Qué se construyó

El admin puede arreglar lo que un empleado registró mal en una boleta, esté en el estado que esté: el número, la
sucursal, cuándo entró, para cuándo estará lista y las prendas (y con ellas el total). Lo hace desde el Historial de
boletas: abre una, toca **Corregir esta boleta**, cambia lo que haga falta y guarda. Los cargos que se sumaron al
entregar se ven pero no se tocan: van con el cobro y la entrega, en otra spec (`admin-corrige-pagos-entregas`).

## Cómo funciona, paso a paso

Un caso concreto: la boleta `000500` se registró en Centro, pero la ropa se dejó en Sur, y además eran 3 camisas y no 2.

1. **En la tablet del admin.** El detalle del historial ofrece el botón si la boleta trae `origen`, que solo llena la
   API (`frontend/src/features/historial/api/historialApi.ts`, al final de `leerBoleta`). La pantalla pasa al formulario
   (`PantallaHistorial.tsx`, en `Completo`), que arranca con `datosIniciales`
   (`frontend/src/features/historial/correccion.ts`): cada prenda conserva como clave **su id en la base**, que es lo que
   permite decir después cuál cambió.
2. **Qué se manda.** Al guardar, `revisarCorreccion` (`correccion.ts:124`) valida con las mismas reglas de Registrar ropa
   y arma solo lo que cambió: `sucursal_id`, y como cambió una prenda, **la lista entera** de prendas más la descripción
   rearmada (`"3 Camisa"`). El total no viaja: con prendas, lo calcula el servidor. `guardarCorreccion` hace el `PATCH`
   con `enviar()` de `lib/api` (`CorregirBoleta.tsx:69`), directo y no por la cola.
3. **El controller.** `patchOrden` (`backend/src/controllers/ordenes.controller.ts:373`) mira primero lo que solo el admin
   corrige: un EMPLEADO que manda `sucursal_id`, `fecha_entrada` o `renglones` recibe 403. Un ADMIN sin `estado` en el
   cuerpo va a `corregir` (`:300`), que valida cada campo (`leerRenglones`, `:247`, reusa los validadores de
   `ordenItems.controller.ts`) y llama al servicio. Un ADMIN que anula sigue el camino de siempre, con su tabla de
   transiciones.
4. **El servicio.** `corregirOrden` (`backend/src/services/correccionOrden.ts:54`) abre una transacción
   (`enTransaccion`, `backend/src/db/transaccion.ts:26`) y hace tres pasos:
   - **Bloquear** (`:61`): `leerParaCorregir` (`ordenes.model.ts:653`) lee la orden con `FOR UPDATE`, y aparte lo cobrado y
     si ya salió.
   - **Decidir** (`:66`): Sur existe y está abierta (`estadoDeLaSucursal`, `:678`, con `FOR SHARE`), cada id de prenda es de
     esta boleta y de INGRESO (`:82`), el total es la suma de las prendas (`:92`) y no queda por debajo de lo cobrado si la
     ropa sigue en el local (`:107`). Cualquier "no" se devuelve acá, **antes de escribir nada**.
   - **Escribir** (`:110`): `aplicarCorreccion` (`ordenes.model.ts:730`) cambia la orden con su fila de auditoría (la
     sucursal anota la anterior y la nueva: `conNuevo`, `auditoria.model.ts:154`). `moverRegistrosDeLaOrden` (`:784`) lleva a
     Sur la copia de `sucursal_id` de sus pagos, su entrega y sus renglones. `reemplazarIngreso`
     (`ordenItems.model.ts:245`) deja las prendas como llegaron.
5. **La respuesta.** Si todo salió bien, la transacción se confirma y el controller responde la orden. Si el número
   `000500` ya existía en Sur, Postgres lo dice recién en el `UPDATE` (23505): el model lo traduce a `BoletaOcupadaError`,
   `enTransaccion` deshace **todo** y el controller responde 409 con "En la sucursal elegida ya hay una boleta con ese
   número…". La tablet lo muestra tal cual y el formulario sigue con lo escrito.
6. **Después.** La tablet vuelve a la lista y la pide de nuevo. Al sincronizar, la tablet de Centro deja de recibir la
   boleta (y sus cobros y su entrega) y la de Sur la empieza a recibir, porque cada tabla se reparte por su propio
   `sucursal_id`.

## Dónde encaja en la arquitectura

- **Controller** (`ordenes.controller.ts`): valida la forma de la entrada y traduce resultados a HTTP. No decide si la
  sucursal está abierta ni cuánto se cobró: para eso hace falta la base, y un controller no escribe SQL (CLAUDE.md §5).
- **Servicio** (`services/correccionOrden.ts`): es la primera vez que `services/` orquesta varios models (antes solo tenía
  el límite del login, que no toca la base). Le toca porque la regla no es de una tabla: decide entre lecturas de
  `ordenes`, `orden_items` y `sucursales`, y escribe en cuatro. **No escribe SQL**: si lo hiciera, habría dos lugares que
  saben cómo es `ordenes`.
- **Models** (`ordenes.model.ts`, `ordenItems.model.ts`): cada uno sigue siendo el único que escribe su tabla. Lo nuevo es
  que sus funciones de corrección **reciben la conexión** (`Ejecutor`) en vez de usar el pool. Ninguna decide nada sola:
  `aplicarCorreccion` no mira el estado; confía en que quien la llama ya lo hizo.
- **Frontend**: la parte pura (`correccion.ts`) decide qué se manda; la API (`api/correccionApi.ts`) solo lo manda; el
  componente no importa `api/` (lo vigila `test/arquitectura.test.ts`), así que la llamada se ofrece desde
  `hooks/useCorreccion.ts`, como `cambiosDeSucursal` en Sucursales.

## Fundamentos

**Decidir antes de escribir, dentro de una transacción.** Una transacción garantiza "todo o nada" si algo **lanza**:
`enTransaccion` hace ROLLBACK cuando la función tira un error. Pero un rechazo del negocio ("la sucursal está cerrada")
no es un error de programación: es una respuesta normal, que el servicio **devuelve** (`{ tipo: 'sucursal-cerrada' }`), y
lo que se devuelve se confirma con COMMIT. Si el servicio escribiera la orden y recién después descubriera que la sucursal
está cerrada, devolvería el rechazo y confirmaría la orden ya cambiada. Por eso `corregirOrden` tiene tres pasos en ese
orden: bloquear, decidir todo y recién después escribir. Las únicas fallas posibles durante la escritura son las que solo
Postgres puede ver (la boleta repetida), y esas sí lanzan. Sin el bloqueo del primer paso, lo decidido podría dejar de ser
cierto antes de escribir (otro pedido entrega la boleta en el medio).

**Una transacción que cruza varios models.** El pool presta una conexión distinta en cada `pool.query`, y una transacción
vive en **una** conexión: un `BEGIN` en una y un `UPDATE` en otra no tienen nada que ver. Si `aplicarCorreccion` usara el
pool, su escritura quedaría confirmada aunque la transacción del servicio después se deshiciera. Por eso esas funciones
reciben `conexion: Ejecutor` (`backend/src/db/transaccion.ts`, el tipo es `Pick<pg.PoolClient, 'query'>`): quien abre la
transacción presta su conexión, y todos escriben por ahí. El test que lo prueba es "si en la sucursal nueva ya hay una
boleta con ese número, no cambia NADA" (`tests/db/correccionOrden.db.test.ts`): la descripción y las prendas se mandaron
juntas con la sucursal, y quedan como estaban.

**Reemplazar una colección entera, comparando con lo guardado.** Las prendas no se mandan una por una ("agregá esta",
"cambiá aquella"): se manda la lista como tiene que quedar, y `reemplazarIngreso` la compara con lo que hay. Lo que no
está se borra, lo que tiene un id conocido se actualiza y lo demás se agrega. Funciona porque cada prenda lleva su id, que
genera el dispositivo (CLAUDE.md §6). El motivo es una regla que tiene que valer **al final**: el total es la suma de las
prendas. Con pedidos sueltos, entre uno y otro la boleta tendría un total que no cuadra. El costo es mandar más datos
(todas las prendas aunque cambie una), pero una boleta tiene pocas. Dos detalles: una prenda que llega igual no anota nada
(el `UPDATE` audita solo lo que cambió de verdad), y las posiciones no se renumeran, porque si no, quitar la primera
prenda anotaría una "edición" en todas las demás (`let siguiente`, `ordenItems.model.ts:270`).

**Probar las sync rules corriendo sus consultas en Postgres.** `syncRules.test.ts` lee el YAML como texto y comprueba su
forma. Lo que no puede comprobar es qué filas bajarían. El test nuevo ("Las sync rules siguen a la boleta movida",
`tests/db/correccionOrden.db.test.ts`) toma las consultas `data` de cada bucket, cambia `bucket.sucursal_id` por `$1` y las
**corre en la base de prueba**, antes y después de mover la boleta. Vale porque esas consultas son SQL simple (PowerSync
no admite JOIN, CLAUDE.md §7), así que Postgres las evalúa igual que PowerSync evalúa sus condiciones. Si mañana alguien
agrega una tabla al bucket y se olvida de moverla, el conteo (6 filas) deja de cuadrar. No reemplaza la prueba con el motor
de PowerSync (→ SPEC-KRILINXI-028): no dice qué buckets recibe cada cuenta, solo qué filas tiene cada sucursal.

**Ya explicado antes:**

- **Transacción explícita (BEGIN / COMMIT / ROLLBACK)** → SPEC-ALE186-019 (`specs/notas/SPEC-ALE186-019-migraciones-schema.md`)
- **Bloqueo de fila (`FOR SHARE`)** → SPEC-ALE186-005 (`specs/notas/SPEC-ALE186-005-pagos-api.md`)
- **Leer la fila de antes en el mismo UPDATE (`updateConAntes`)** → SPEC-ALE186-010 (`specs/notas/SPEC-ALE186-010-auditoria-registro.md`)
- **Desnormalización controlada (el `sucursal_id` duplicado)** → SPEC-ALE186-005 (`specs/notas/SPEC-ALE186-005-pagos-api.md`)
- **Sync rules y buckets** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)

## Decisiones y por qué

- **El mismo `PATCH /api/ordenes/:id`, con un camino para el admin.** La spec lo pedía así. Se descartó un endpoint aparte
  (`/correccion`), que habría separado mejor la sesión de la cola (que acepta tokens vencidos) de la del admin. El costo
  que se aceptó: un PATCH del admin que atiende el mostrador y sube por la cola también va por la corrección, así que
  puede editar una boleta cerrada. Es coherente con lo que el admin puede hacer igual desde el historial.
- **El cambio de estado sigue aparte.** Un ADMIN que manda `estado` va por la tabla de transiciones de siempre, y mezclar
  `estado` con sucursal, fecha o prendas responde 400. Corregir una boleta no es una forma de saltarse "ENTREGADO lo pone
  la entrega".
- **Los cargos al entregar no se tocan** (decisión del 2026-11-01, en la spec). En una boleta entregada, cargo, precio
  final y pago forman un paquete con saldo 0. Cambiar uno solo dejaría la boleta incoherente o con un saldo que el sistema
  no puede representar. Un id de cargo en la lista responde 400.
- **Ya entregada, el total no se compara con lo cobrado.** El saldo de una boleta que salió se mide con `precio_final`, que
  esta corrección no toca. Bajar las prendas de una entregada por debajo de lo cobrado se permite: lo que se cobró en el
  mostrador sigue siendo lo que se cobró.
- **El total a mano solo en una boleta sin prendas.** Con prendas, el total es su suma (lo calcula el servidor). Mandar
  `precio_total` sin prendas en una boleta que sí tiene responde 409 `TOTAL_DISTINTO_DE_RENGLONES`.
- **Mover una boleta no audita sus pagos ni su entrega.** El cambio es uno, el de la orden, y su fila guarda la sucursal
  anterior y la nueva. Anotar cada pago movido llenaría la auditoría de filas que dicen lo mismo.
- **La sucursal de las acciones viejas se mueve con la boleta.** La auditoría ubica cada acción en la sucursal del registro
  que tocó (SPEC-ALE186-012), así que lo que se hizo con la boleta antes de moverla ahora figura en la sucursal nueva. Se
  aceptó: moverla es corregir un error de registro, y la ropa estaba de verdad en la nueva.
- **Una prenda quitada sigue ubicada.** Su fila ya no existe, así que la auditoría saca su sucursal de la orden anotada en
  lo que había (`SUCURSAL_DE_LA_ACCION`, `auditoria.model.ts`).

## Los tests

- **Reusados.** En el backend: `testApi`, `expectApiError` y `conSesion` para el HTTP, y `baseReal.ts` para la base
  (`escenario`, `crearOrden`, `crearRenglon`, `crearPago`, `crearEntrega`, `auditoriaDe`). En el frontend: `simularApi`,
  `baseLocalDePrueba`, `boletaDePrueba` / `renglonDePrueba` de `test/historialDePrueba.ts` y `sinRed()` de `test/red.ts`.
- **Tres niveles, cada uno con lo suyo.** `tests/http/ordenes.test.ts` reemplaza el servicio por un doble y comprueba qué
  valida el controller y qué responde a cada resultado (un `it.each` con los ocho). `tests/db/correccionOrden.db.test.ts`
  prueba lo que solo Postgres garantiza: la atomicidad, los 409 reales, la auditoría de cada prenda y las sync rules.
  `correccion.test.ts` prueba sin pantalla qué se manda; `CorregirBoleta.test.tsx`, el camino entero como el admin.
- **Un test que encontró un error.** "Sin tocar nada, no se manda nada" falló la primera vez: una boleta cuya descripción
  no era exactamente el resumen de sus prendas mandaba una "corrección" sin que el admin tocara nada. Ahora la descripción
  se vuelve a armar solo si cambiaron las prendas.
- **Una carrera del test, no del código.** Las sucursales del formulario salen de la base local, que se lee aparte; el
  helper `abrirLaCorreccion` las espera con `findByRole`. Pasó tres veces seguidas con `LENTO_MS=200`.

## Si mañana tienes que tocar esto

Empieza por `services/correccionOrden.ts`: los tres pasos están numerados. Una regla nueva que puede decir que no va en
el paso 2, **nunca** después de una escritura. Si agregas una tabla con `sucursal_id` duplicado a los buckets de la
sucursal, súmala a `moverRegistrosDeLaOrden`: el test de las sync rules lo va a reclamar (el conteo de 6 filas). Y si la
spec `admin-corrige-pagos-entregas` corrige los cargos, el rechazo `renglon-ajeno` con `esCargo` es el que hay que
levantar.
