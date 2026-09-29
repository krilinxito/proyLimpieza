---
id: SPEC-ALE186-003
spec: specs\SPEC-ALE186-003-clientes-api.md
explica:
  - a que altura va el doble de prueba
  - codigos de error de postgres (sqlstate)
  - entrega al menos una vez
  - errores de dominio
  - ids generados por el cliente
  - mock parcial de un modulo
  - normalizar antes de comparar
  - timestamp sin zona horaria
  - update dinamico con lista blanca
---

# SPEC-ALE186-003 — Alta y edición de clientes

## Qué se construyó

El lado del servidor del alta de clientes. Cuando una empleada registra a un cliente en
el mostrador, la app lo guarda primero en su base local y después lo sube; esta spec es
lo que recibe esa subida, la valida y la guarda en Postgres. También la edición.

Es la primera spec que **escribe datos del negocio**, así que lo importante no es tanto
el cliente como el patrón: órdenes, pagos y entregas van a recibir sus escrituras
exactamente igual.

## Cómo funciona, paso a paso

### Un alta que llega por primera vez

María registra a Ana en el mostrador, sin internet. La app genera un id en el dispositivo
(`crypto.randomUUID()`), guarda la fila en SQLite y la deja en la cola. Cuando vuelve la
conexión, la cola manda:

```
POST /api/clientes     Authorization: Bearer ...
{ "id": "9bf10c49-...", "nombre": "Ana Quispe", "telefono": "7012-3456" }
```

1. **`src/routes/clientes.routes.ts:10`** — `requireAuth` va con `use()`, delante de
   todas las rutas del archivo. Es la forma de decir "todo lo de clientes exige sesión" en
   un solo sitio, en vez de repetirlo ruta por ruta y olvidarlo en la próxima.

2. **`src/controllers/clientes.controller.ts:61`** — `postCliente`. Lo primero es
   `comoObjeto` (`src/utils/validacion.ts:27`): lo que haya en el cuerpo pasa a ser un
   objeto, aunque el cliente haya mandado un array o nada.

3. **`src/utils/validacion.ts:15`** — `esUuid` comprueba que el id tenga forma de UUID.
   Si no la tiene, 400 y fin: no se llega a la base.

4. **`src/utils/validacion.ts:50`** — el teléfono pasa de `7012-3456` a `70123456`.

5. **`src/controllers/clientes.controller.ts:76`** — la sucursal sale de la sesión, **no**
   del cuerpo.

6. **`src/models/clientes.model.ts:119`** — `crear` inserta con `ON CONFLICT (id) DO
   NOTHING` (línea 126). Es la primera vez que ese id llega, así que inserta y devuelve la
   fila.

7. **`src/controllers/clientes.controller.ts:83`** — 201 con el cliente.

### El mismo alta, otra vez

La conexión se cortó justo después de que el servidor guardara a Ana pero antes de que la
respuesta llegara al dispositivo. Para la app, esa subida falló; la cola la reintenta con
**el mismo cuerpo, el mismo id**.

Todo igual hasta el paso 6. Ahí `ON CONFLICT (id) DO NOTHING` ve que el id ya existe, no
inserta y no se queja: devuelve cero filas. El model entiende eso como "ya estaba", la
busca por id y la devuelve tal cual está guardada. El controller responde **200** en vez de
201. Para la cola los dos son éxito, y el reintento se da por cerrado.

Sin esto, el segundo intento chocaría con la clave primaria, daría un error, y la cola lo
seguiría reintentando para siempre — o peor, lo daría por perdido con Ana ya guardada.

### Un teléfono que ya es de otro

Llega un alta con otro id pero con el teléfono `701 23 456`. Normalizado queda
`70123456`, el de Ana.

1. El `INSERT` no choca por id —es nuevo— sino por la restricción `UNIQUE` del teléfono.
   Postgres tira un error con el código `23505` y el nombre de la restricción.
2. **`src/models/clientes.model.ts:63`** — `esTelefonoRepetido` reconoce **ese** error
   concreto y el model lo convierte en un `TelefonoOcupadoError` (línea 49).
3. **`src/controllers/clientes.controller.ts:48`** — el controller lo atrapa, busca a quién
   pertenece el teléfono y responde 409:

   > Ese teléfono ya está registrado a nombre de Ana Quispe. Buscalo por su teléfono en vez
   > de darlo de alta otra vez.

### La edición

`PATCH /api/clientes/:id` (**`src/controllers/clientes.controller.ts:91`**) valida el id de
la URL, lee **solo** `nombre`, `telefono` y `carnet` del cuerpo, y llama a `actualizar`
(**`src/models/clientes.model.ts:168`**), que arma el `UPDATE` con las columnas que vinieron.
Si nadie la tiene, 404; si el teléfono nuevo es de otro, el mismo 409 de arriba.

## Dónde encaja en la arquitectura

Las capas no cambian respecto a la 002; lo nuevo es qué hace cada una **cuando escribe**:

| Capa | Hace | No hace |
|---|---|---|
| Rutas | Declara el middleware de todo el recurso | Nada de lógica |
| Controller | Valida, normaliza, decide la sucursal, traduce errores de dominio a HTTP | No escribe SQL ni sabe de códigos de Postgres |
| Model | Escribe, hace idempotente el reintento, reconoce errores de Postgres | No sabe que existe un 409 |
| `utils/validacion.ts` | Piezas de validación que comparten todos los recursos | No sabe de clientes |

La frontera más interesante es la del error del teléfono, porque **pasa por las dos
capas**: el model sabe *qué* pasó en la base —un `23505` en `clientes_telefono_key`— y lo
dice en el idioma del dominio; el controller sabe *qué significa para quien pidió* —un 409
con un mensaje que dice qué hacer—. Si el model tirara directamente el 409, dejaría de
servir para cualquier cosa que no sea HTTP (un script, una importación masiva). Si el
controller mirara el código `23505`, tendría que saber cómo se llaman las restricciones de
la base.

**No hay `GET`**, y no es un olvido. La §6 dice que las lecturas salen del SQLite del
dispositivo: los clientes se sincronizan enteros en el bucket `global`. Un endpoint de
búsqueda haría que el mostrador dependiera de internet para encontrar a un cliente, que es
exactamente lo que el diseño offline existe para evitar. **Tampoco hay `DELETE`**: un
cliente tiene órdenes que lo referencian.

## Fundamentos

### Ids que genera el cliente

En casi todos los tutoriales el id lo pone la base (`SERIAL`, autoincremental): insertás
la fila y la base te dice qué número le tocó. Acá eso no sirve. Una empleada sin internet
registra a un cliente y **tiene que poder crearle una orden en el acto**, y la orden
necesita el id del cliente. No puede esperar a que el servidor se lo diga, porque no hay
servidor.

Por eso el id lo inventa el dispositivo, y lo inventa como **UUID**: 122 bits al azar. La
probabilidad de que dos dispositivos, en tres sucursales, generen el mismo es tan baja que
en la práctica no se considera. El schema lo explica en su propio comentario
(`context/lavanderia_schema.sql`, "PORQUÉ UUID Y NO SERIAL").

La consecuencia para el backend es que **el id llega en el cuerpo y hay que respetarlo**
(`src/models/clientes.model.ts:126` lo inserta tal cual), pero también **validarlo**: un
id mal formado que llegara a Postgres no sería un 400, sería un error de tipo y un 500.

### Entrega "al menos una vez"

Una cola de subida puede fallar de tres maneras: la petición no llega, llega y el servidor
falla, o **llega, el servidor la procesa bien, y la respuesta se pierde**. Desde el
dispositivo, los tres casos se ven igual: sin respuesta. La única opción segura es
reintentar.

Eso tiene un nombre: la cola garantiza entregar cada escritura **al menos una vez**, no
**exactamente una vez**. Y lo que hace funcionar el sistema entero es que el receptor sea
**idempotente** (concepto explicado en la bitácora de la 002): recibir lo mismo dos veces
tiene que dejar el mismo resultado que recibirlo una.

Acá la idempotencia se apoya en el id del dispositivo. Como el reintento trae **el mismo
id**, el servidor puede reconocerlo. Si el id lo generara el servidor, el reintento sería
indistinguible de un alta nueva y Ana quedaría registrada dos veces.

Una sutileza, en `src/models/clientes.model.ts:109`: si ya existía, se devuelve **lo
guardado**, no lo que llegó. Un reintento trae los datos de la primera vez; si desde
entonces alguien editó al cliente, esa edición viaja en su propio `PATCH`. Pisar lo
guardado con el reintento desharía la edición.

### Códigos de error de Postgres

Cuando Postgres rechaza algo, el error trae un **código SQLSTATE** de cinco caracteres
además del mensaje. `23505` es *unique_violation*. Y cuando lo que se violó es una
restricción, el error dice **cuál** (`error.constraint`).

Por qué mirar eso y no el mensaje: el texto depende del idioma y la versión del servidor
—"duplicate key value violates..." hoy, otra cosa en un Postgres en español—. El código y
el nombre de la restricción son contrato; el texto, no.

Por qué mirar **las dos cosas**: `clientes` tiene dos restricciones únicas, la clave
primaria y el teléfono. Si solo se mirara el `23505`, cualquier choque —incluido uno que
no tiene nada que ver— se presentaría como "teléfono repetido" y mandaría al empleado a
buscar un cliente equivocado. Hay un test que lo comprueba.

El nombre `clientes_telefono_key` no está escrito en el schema: es el que **Postgres le pone
solo** a un `UNIQUE` declarado en la columna. Se verificó contra la base real
(`pg_constraint`) al implementar esta spec, y el comentario de
`src/models/clientes.model.ts:58` avisa de que hay que cambiarlo si algún día se nombra a
mano.

### Errores de dominio

`TelefonoOcupadoError` (`src/models/clientes.model.ts:49`) no es un `ApiError`. Es un error
que habla del **negocio** —"ese teléfono es de otro"— y no del transporte —"409"—.

La regla que lo justifica es la de la sección 5: un model no sabe de `req` ni de `res`.
Tampoco de códigos HTTP. El día que exista un script de importación de clientes desde un
Excel, va a usar el mismo model y va a querer saber qué teléfonos chocan, pero un 409 no le
sirve de nada.

### Normalizar antes de comparar

Una restricción de unicidad compara **bytes**. Para Postgres, `7012-3456` y `70123456` son
distintos, así que la regla "un teléfono, un cliente" se burla con un guion. El resultado
es el mismo cliente con dos fichas, y sus órdenes repartidas entre las dos.

La solución es guardar **siempre la misma forma**: solo dígitos
(`src/utils/validacion.ts:50`). Se normaliza antes de insertar y antes de actualizar, y la
restricción `UNIQUE` pasa a comparar lo que tiene que comparar.

La otra mitad de esto no está en este repo sino en el frontend: la búsqueda local tiene que
normalizar igual, o un cliente guardado como `70123456` no aparecerá al buscar `7012-3456`.
Es un contrato entre los dos lados.

### TIMESTAMP sin zona horaria

Esta la encontramos al implementar, y afecta a todas las specs que vienen.

`fecha_registro` es `TIMESTAMP`, sin zona horaria: guarda una hora "de reloj de pared", sin
decir de qué país. `pg`, por defecto, la lee como si fuera **hora local de la máquina donde
corre Node**, y al pasarla a JSON la convierte a UTC. En una máquina a −4 h, un cliente
registrado a las 20:00 salía por la API como `00:00Z` del día siguiente.

Y hay un segundo problema encima: PowerSync le entrega al dispositivo **el texto crudo**
de la columna, sin conversiones. La misma fecha llegaría con dos valores distintos según
viniera por la API o por la sincronización.

El arreglo es el mismo que ya existía para `DATE` (el **type parser de pg**, explicado en la
001): entregar la columna tal cual está (`src/db/pool.ts:36`). Una columna sin zona
horaria no tiene información para convertirse a ninguna zona; inventarla es el bug.

### UPDATE dinámico con lista blanca

Un `PATCH` trae solo los campos que cambiaron, así que el `UPDATE` no puede estar escrito
de antemano: a veces es `SET nombre = $2`, a veces `SET telefono = $2, carnet = $3`.

Armar SQL a pedido es terreno peligroso, y la regla de la sección 5 —nunca concatenar
valores— sigue en pie. Lo que se hace (`src/models/clientes.model.ts:155`) es separar las dos
cosas que hay en un `SET`:

- **Los nombres de columna** salen de una lista cerrada escrita en el código. Nunca del
  cuerpo de la petición. Un campo que no esté en la lista no puede llegar al SQL.
- **Los valores** van siempre como `$2, $3...`. Aunque alguien mande como nombre
  `Ana'; DROP TABLE clientes; --`, viaja como dato y nunca toca el texto de la consulta. Hay
  un test que comprueba literalmente eso.

**Ya explicado antes:**

- **idempotencia** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`). Acá
  se usa con `ON CONFLICT (id)` en vez de `ON CONFLICT (username)`, por el mismo motivo.
- **type parser de pg** → SPEC-ALE186-001
- **dobles de prueba (mocks)** → SPEC-ALE186-001
- **factory de datos de prueba** → SPEC-ALE186-002
- **formato de error uniforme** → SPEC-ALE186-001

## Decisiones y por qué

**201 la primera vez, 200 en el reintento.** Podrían ser los dos 201, y a la cola le daría
igual. Distinguirlos deja rastro en los logs de que hubo un reintento, que es información
útil el día que alguien pregunte por qué la sincronización de una sucursal va lenta.

**El 409 nombra al otro cliente.** Parece dar información de más, pero no: la tabla
`clientes` entera ya está en el dispositivo de cualquier empleado. Lo que sí hace es
ahorrarle a la persona del mostrador la duda de si se equivocó al escribir o si ese
cliente ya venía antes.

**Los campos no editables se ignoran, no se rechazan.** Un `PATCH` que trae `fechaRegistro`
o la sucursal podría responder 400. Pero en este diseño los PATCH los manda la cola de
subida, y un 400 ahí se convierte en un error que alguien tiene que atender en el
mostrador. Ignorarlos no cuesta nada y el campo sigue sin poder cambiarse.

**El arreglo de las fechas se hizo en esta spec aunque `pool.ts` no estaba en su scope.** La
alternativa era convertir la fecha a texto en la consulta de clientes (`fecha_registro::text`)
y dejar el problema para cada model siguiente. Es la primera tabla con `TIMESTAMP` que sale
por la API; si no se arreglaba en el origen, el parche se iba a copiar cinco veces.

## Los tests

45 tests nuevos en tres archivos.

**Lo que se reusó.** `testApi()` y `expectApiError()` de la 001, y la factory y el
`tokenDePrueba` de la 002.

**Lo que se generalizó.** `conSesion()` en `tests/helpers/usuarios.ts`. La línea
`.set('Authorization', \`Bearer ${tokenDePrueba()}\`)` ya se repetía siete veces, y cada
recurso que viene va detrás de `requireAuth`. Ahora es:

```ts
await testApi().post('/api/ordenes').set(conSesion()).send({ ... });
await testApi().get('/api/estadisticas').set(conSesion({ rol: 'ADMIN', sucursalId: null }));
```

**Lo que se creó.** `tests/helpers/clientes.ts`, con `clienteDePrueba()` —la factory, igual
que la de usuarios— y `cuerpoDeAlta()`, que es lo que manda el dispositivo: cada llamada
trae un UUID nuevo, como en la vida real. `ordenes` va a necesitar las dos cosas para sí.

**Dos niveles de doble, y por qué.** Hasta ahora siempre se reemplazaba el model entero.
Esta spec tiene tests a dos alturas distintas, y conviene ver por qué:

- `tests/http/clientes.test.ts` reemplaza **el model**. Prueba el controller: qué responde
  según lo que el model le diga. El SQL no le importa.
- `tests/unit/clientes.model.test.ts` reemplaza **el pool**. Prueba el model: qué SQL arma,
  con qué parámetros, y cómo traduce los errores de Postgres. Deja correr el model entero y
  solo intercepta el momento de hablar con la base.

La regla: **el doble va justo debajo de lo que se está probando.** Si se quiere probar el
model, reemplazar el model no prueba nada.

**Un mock parcial.** En `tests/http/clientes.test.ts:10` se reemplazan las funciones del
model pero se conserva **la clase `TelefonoOcupadoError` verdadera**, con `importOriginal`.
Sin eso, el controller comprobaría `instanceof` contra la clase real y el test le pasaría
una copia del doble: no coincidirían nunca, y el test del 409 fallaría por un motivo que no
tiene nada que ver con el código.

**Lo que se verificó contra la base real.** Los tests no pueden saber cómo llamó Postgres a
la restricción del teléfono, y de eso depende el 409 entero. Se comprobó levantando Docker:
el nombre es `clientes_telefono_key`, el alta crea, el reintento no duplica (dos llamadas,
una fila), el teléfono con otra forma choca, y la fecha sale por la API exactamente igual
que está guardada. Los clientes de prueba se borraron después.

## Si mañana tenés que tocar esto

**Si agregás una columna editable**, va en `COLUMNA_EDITABLE`
(`src/models/clientes.model.ts:155`) y en `CambiosCliente`. Si solo la agregás al tipo, el
compilador te avisa: la lista está tipada con las claves de `CambiosCliente`.

**Si el 409 del teléfono deja de salir** y en su lugar aparece un 500, lo primero es
comprobar que la restricción se siga llamando `clientes_telefono_key`:

```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'clientes'::regclass AND contype = 'u';
```

**Para las specs de órdenes, pagos y entregas**: el patrón es este archivo. Id del
dispositivo validado con `esUuid`, `ON CONFLICT (id) DO NOTHING` para el reintento,
sucursal de la sesión y nunca del cuerpo, errores de Postgres convertidos a errores de
dominio en el model, y traducidos a HTTP en el controller.
