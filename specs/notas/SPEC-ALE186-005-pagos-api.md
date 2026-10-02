---
id: SPEC-ALE186-005
spec: specs/SPEC-ALE186-005-pagos-api.md
explica:
  - bloqueo de fila (for share)
  - desnormalizacion controlada
  - insert select condicional
  - registros inmutables
---

# SPEC-ALE186-005 — Registro de cobros

## Qué se construyó

El backend ya recibe los cobros que hace el mostrador: el adelanto cuando el cliente deja
la ropa y el pago final cuando la retira. Como todo lo que se escribe en este sistema, el
cobro nace en el dispositivo (con o sin internet) y sube después por la cola de PowerSync;
este endpoint es el que lo recibe, lo valida y lo guarda.

Un cobro no se edita ni se borra. Si se cargó mal, se corrige con otro registro.

## Cómo funciona, paso a paso

Sigamos un caso: María, empleada de la sucursal Centro, cobra un adelanto de Bs 20 en efectivo
por la orden 001234. Su dispositivo sube:

```json
POST /api/pagos
{ "id": "6a1f…", "orden_id": "5555…", "monto": "20.00", "tipo": "ADELANTO", "metodo": "EFECTIVO" }
```

1. **La ruta.** `src/routes/index.ts:19` manda todo `/api/pagos` a `pagosRouter`, que exige
   sesión (`src/routes/pagos.routes.ts:10`) y declara un solo endpoint, `POST /`
   (`pagos.routes.ts:12`). No hay `PATCH` ni `DELETE`: una petición así cae en el 404
   genérico del final de la app (`src/app.ts:23`).

2. **El controller valida.** `postPago` (`src/controllers/pagos.controller.ts:75`) lee la
   sesión que dejó `requireAuth` y revisa el cuerpo campo por campo: que `id` y `orden_id`
   sean UUID (`:79`, `:82`), que el monto sea un monto (`montoEnCentavos`, de
   `utils/validacion.ts:71`) y mayor que cero (`:29`), que tipo y método sean valores del
   dominio. `"20.00"` se convierte en el entero `2000`.

3. **Lo que NO sale del cuerpo.** Quien cobra es `sesion.id` (`:94`), aunque el cuerpo
   traiga un `usuario_id`. La sucursal del pago ni siquiera se lee: la pone el model,
   copiándola de la orden. Lo único que el controller decide sobre sucursales es un
   **límite**: `sucursalPermitida` (`:60`) devuelve la de María, porque es EMPLEADO; para
   un ADMIN devolvería `null`, que significa "cualquiera".

4. **El model inserta, en una sola sentencia.** `pagos.crear`
   (`src/models/pagos.model.ts:107`) ejecuta un `INSERT … SELECT` (`:109-117`). La parte
   del `SELECT` busca la orden 001234 con tres condiciones: que exista, que no esté
   anulada (`:114`) y que sea de la sucursal de María (`:115`). Si las cumple, la fila
   que se inserta sale de ahí, con `o.sucursal_id` como sucursal del pago (`:110`).
   Postgres responde con la fila recién creada (`RETURNING`).

5. **La respuesta.** El model devuelve `{ tipo: 'creado', pago }` (`:132`) y el controller
   responde **201** con el pago en camelCase (`pagos.controller.ts:101`).

**¿Y si algo no cuadra?** Si el `SELECT` no encontró la orden, el `INSERT` no inserta nada
y `rows` llega vacío. Recién entonces el model averigua por qué, en este orden:

- ¿Ya existe un pago con ese id? (`pagos.model.ts:135`) → es un **reintento** de la cola.
  Responde 200 con el pago guardado, sin tocarlo.
- ¿La orden no existe, o es de otra sucursal? (`:139`) → **400 VALIDACION**: "Esa orden no
  existe en esta sucursal."
- ¿Está anulada? → **409 ORDEN_ANULADA**, con el número de boleta y qué hacer.

El reintento se mira primero a propósito. Si María cobró, la respuesta se perdió y alguien
anuló la orden antes de que la cola reintentara, el cobro **ya está** guardado: es un
reintento, no un cobro nuevo sobre una orden anulada.

## Dónde encaja en la arquitectura

El mismo reparto de las specs anteriores (CLAUDE.md, sección 5):

- **La ruta** (`pagos.routes.ts`) solo dice "POST, con sesión". Si tuviera lógica, habría
  dos lugares donde buscar por qué se rechazó una petición.
- **El controller** (`pagos.controller.ts`) traduce HTTP a dominio y de vuelta: lee el
  cuerpo, valida, decide los mensajes para el mostrador y elige el status. **No escribe
  SQL**, ni siquiera para preguntar si la orden existe; eso lo responde el model.
- **El model** (`pagos.model.ts`) es el único que escribe en `pagos`. No sabe nada de HTTP:
  devuelve un resultado (`creado`, `existente`, `orden-no-encontrada`, `orden-anulada`) y
  el controller decide qué status le corresponde a cada uno.

Una sutileza: el `INSERT` de pagos **nombra** la tabla `ordenes` dentro del `SELECT`. Eso
es inevitable si se quiere resolver todo en una sola sentencia (ver Fundamentos). Pero
cuando hace falta leer una orden completa, el model de pagos llama a
`ordenes.buscarPorId` (`pagos.model.ts:139`) en vez de escribir su propio
`SELECT * FROM ordenes`. Así, el día que cambien las columnas de la orden, se cambia un
solo lugar.

## Fundamentos

### INSERT … SELECT: insertar solo si se cumple una condición

Lo habitual es `INSERT INTO t (a, b) VALUES ($1, $2)`: se inserta lo que viene, siempre.
Pero un `INSERT` también acepta, en lugar de `VALUES`, **una consulta**: inserta una fila
por cada fila que esa consulta devuelva.

```sql
INSERT INTO pagos (id, orden_id, sucursal_id, …)
SELECT $1, o.id, o.sucursal_id, …
  FROM ordenes o
 WHERE o.id = $2 AND o.estado <> 'ANULADO'
```

Si la orden existe y no está anulada, el `SELECT` devuelve una fila y se inserta un pago.
Si no, devuelve cero filas y se insertan cero pagos. Sin error: simplemente no pasa nada,
y `RETURNING` vuelve vacío.

**Por qué acá:** se necesitaban tres cosas de la orden —su sucursal, su estado y a qué
sucursal pertenece— antes de insertar. La alternativa obvia es leer la orden, comprobar
en TypeScript y después insertar. Son dos consultas, y entre ellas el mundo puede cambiar:
es la [condición de carrera](SPEC-ALE186-004-ordenes-api.md) que SPEC-ALE186-004 resolvió
poniendo las condiciones dentro del `UPDATE`. Esto es lo mismo para un `INSERT`. El
ejemplo vivo es `src/models/pagos.model.ts:109-117`.

**Un detalle que se comprobó contra Postgres real:** los parámetros `$1`, `$3`… van en la
lista del `SELECT`, no en un `VALUES`, y `pg` los manda sin tipo. Postgres los infiere
igual a partir de las columnas del `INSERT` (`$1` → `uuid`, `$4` → `tipo_pago`…), así que
no hace falta castearlos. Lo que sí lleva cast es `$8::uuid`, porque en `$8 IS NULL` no hay
ninguna columna de la que deducir el tipo.

### Bloqueo de fila: FOR SHARE

Poner la condición dentro del `INSERT` no alcanza del todo. Postgres, en su modo normal
(*read committed*), hace que el `SELECT` vea la orden **como estaba al empezar la
sentencia**. Si en ese mismo instante otra petición está anulando la orden y todavía no
confirmó, este `SELECT` ve "LISTO", inserta el pago, y un milisegundo después la orden
queda anulada con un cobro encima.

`FOR SHARE` al final del `SELECT` (`pagos.model.ts:116`) le dice a Postgres: "las filas que
leas, bloquealas para que nadie las modifique hasta que yo termine". Es un bloqueo
**compartido**: otros pagos a la misma orden pueden leerla a la vez sin esperarse entre sí.
Lo único que bloquea es a quien quiera **modificarla**. Hay dos órdenes posibles:

- El pago llega primero → la anulación espera a que el pago termine. El cobro quedó antes
  que la anulación, que es lo que pasó de verdad.
- La anulación llega primero → el `SELECT` del pago espera. Cuando la anulación confirma,
  Postgres vuelve a evaluar la condición sobre la fila nueva, ve "ANULADO" y no inserta.

Sin el bloqueo, el resultado dependería de la suerte de quién confirma primero. Con él,
siempre es uno de los dos órdenes coherentes. (La diferencia con `FOR UPDATE`: este
último es exclusivo y haría esperar también a dos pagos simultáneos de la misma orden,
sin ningún beneficio.)

### Desnormalización controlada: sucursal_id dos veces

En un diseño "de libro", `pagos` no tendría `sucursal_id`: se saca de su orden con un JOIN.
Repetir un dato que se puede deducir (**desnormalizar**) tiene un riesgo conocido: que las
dos copias se desincronicen. Un pago con sucursal "Norte" sobre una orden de "Centro"
sería un pago que el dispositivo de Centro nunca vería.

Acá se desnormaliza a propósito porque las sync rules de PowerSync no admiten JOINs
(CLAUDE.md, sección 7): para repartir pagos por sucursal, cada pago tiene que llevar la
suya. El precio es que **alguien tiene que garantizar que coincidan**, y ese alguien es
este endpoint. Por eso la sucursal no se acepta del cuerpo, ni siquiera de la sesión: se
copia de la orden en la misma sentencia que inserta (`pagos.model.ts:110`). No hay ningún
camino por el que pueda llegar otra.

La spec de entregas va a tener exactamente el mismo problema con `entregas.sucursal_id`, y
la misma solución.

### Registros inmutables: corregir agregando, no reescribiendo

Un pago es un hecho: "el 2 de octubre María recibió Bs 20". Si ese registro se
pudiera editar, cambiarle el monto a Bs 25 borraría la historia: ya nadie sabría que alguna
vez decía 20, ni quién lo cambió. Es el mismo principio que siguen los libros contables
desde hace siglos: un asiento mal hecho no se tacha, se compensa con otro.

Por eso `/api/pagos` no tiene `PATCH` ni `DELETE`, y hay un test que lo comprueba
(`tests/http/pagos.test.ts`, bloque "sin edición ni borrado"). Además encaja con el modo
offline: un registro que solo se agrega nunca entra en conflicto con otra edición del
mismo registro hecha en otro dispositivo.

Cómo se compensa un cobro mal cargado (un pago negativo no existe: el schema exige
`monto > 0`) queda por decidir cuando aparezca el caso. Lo que esta spec garantiza es que
el error original siga a la vista.

**Ya explicado antes:**

- **Idempotencia** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Ids generados por el cliente** y **entrega al menos una vez** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Timestamp sin zona horaria** (por qué `fecha_pago` exige zona) → SPEC-ALE186-003
- **A qué altura va el doble de prueba** → SPEC-ALE186-003
- **Condición de carrera al leer y luego escribir** y **unión discriminada** → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Dinero en centavos enteros** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Factory de datos de prueba** → SPEC-ALE186-002

## Decisiones y por qué

- **El model devuelve un resultado, no lanza errores de dominio.** Órdenes lanza
  `BoletaOcupadaError` porque ese caso lo detecta Postgres (una restricción `UNIQUE`). Acá
  ningún caso es un error de Postgres: "la orden está anulada" es simplemente un `INSERT`
  que insertó cero filas. Modelarlo como una unión discriminada, igual que
  `ordenes.actualizar`, deja los cuatro casos a la vista en un solo `switch`
  (`pagos.controller.ts:100-119`), cada uno con su status y su mensaje.
- **Orden inexistente → 400, no 404.** El recurso pedido es `/api/pagos`, que sí existe. Lo
  que falla es un dato del cuerpo, igual que un `cliente_id` inexistente al registrar una
  orden. Una orden de otra sucursal responde lo mismo, para no confirmarle a un EMPLEADO
  que ese id existe en otra parte.
- **No se rechaza el sobrepago, ni un PAGO_FINAL sin entrega.** El dinero ya cambió de
  manos en el mostrador; rechazarlo al sincronizar perdería el registro de algo que pasó
  de verdad. Un saldo negativo se ve en el dashboard; un cobro rechazado en silencio no
  se ve nunca.
- **`MONTO_MAXIMO` va a `utils/validacion.ts`.** Órdenes tiene su propia copia
  (`PRECIO_MAXIMO`) y quedó fuera del scope de esta spec. Cuando alguien vuelva a tocar el
  controller de órdenes, que use la compartida.

## Los tests

- **Reusados:** `testApi` y `expectApiError` (`tests/helpers/api.ts`), `conSesion`
  (`tests/helpers/usuarios.ts`) e `IDS` y `ordenDePrueba` (`tests/helpers/ordenes.ts`).
  Ninguno se tocó: servían tal cual.
- **Creado:** `tests/helpers/pagos.ts`, con `pagoDePrueba()` y `cuerpoDePago()`, el mismo
  patrón que la factory de órdenes. La spec de entregas lo va a necesitar para el
  PAGO_FINAL que acompaña al retiro:

  ```ts
  await testApi().post('/api/pagos').set(conSesion()).send(cuerpoDePago({ tipo: 'PAGO_FINAL' }));
  ```

- **El test del model** (`tests/unit/pagos.model.test.ts`) reemplaza solo el pool, y deja
  correr de verdad a `ordenes.buscarPorId`, que también le pide su fila al pool. Por eso
  cada test encola las respuestas en el orden en que se piden, con el helper local
  `laBaseDevuelve([], [FILA_PAGO], [FILA_ORDEN])`: "el INSERT no devolvió nada, el pago sí
  existe, la orden es esta".
- **El test HTTP** (`tests/http/pagos.test.ts`) reemplaza el model entero, porque lo que se
  prueba es el controller: qué valida, qué le pasa al model y cómo traduce cada resultado.
- **Lo que los dobles no pueden probar.** Que Postgres acepte la sentencia, que `pg` mande
  los parámetros con el tipo correcto y que el `INSERT … SELECT` se comporte como promete
  quedó fuera de `npm test`, porque la suite no levanta base. Se comprobó con un script de
  punta a punta (fuera del repo) que usa la app real, el pool real y el Postgres de Docker,
  crea sus propios datos y los borra al terminar. Recorrió los criterios por HTTP (camino
  feliz, reintento, anulada, orden ajena, admin, sobrepago, validaciones, 401, PATCH y
  DELETE) y además **la carrera**: con una anulación abierta sin confirmar, el cobro
  quedó esperando y, al confirmarse la anulación, respondió 409 sin guardar nada. Como
  control, la misma carrera **sin** `FOR SHARE` dejó colarse el cobro: el bloqueo no es
  decorativo. Los 30 chequeos pasaron.

  Ese script es una verificación de una vez, no un test del proyecto: el repo todavía no
  tiene infraestructura de tests contra una base real. Cuando la tenga, la carrera es el
  primer test que vale la pena llevar ahí.

## Si mañana tenés que tocar esto

Empezá por `crear` en `src/models/pagos.model.ts`: el comentario de arriba explica las
tres garantías de la sentencia. Si agregás una condición nueva ("no se cobra una orden
de hace más de un año"), va **dentro del WHERE del INSERT**, no en un `if` del controller,
y además hay que agregar el caso en la investigación que viene después, para que el
`throw` final no se dispare.

Ojo con quitar el `FOR SHARE`: los tests no fallan sin él, porque con dobles no hay
concurrencia. Lo que deja de funcionar es la garantía.
