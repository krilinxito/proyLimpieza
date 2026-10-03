---
id: SPEC-ALE186-004
spec: specs/SPEC-ALE186-004-ordenes-api.md
explica:
  - condicion de carrera al leer y luego escribir
  - maquina de estados
  - union discriminada
---

# SPEC-ALE186-004 — Registro y avance de órdenes

## Qué se construyó

El backend ya recibe el ingreso de ropa: la app sube la orden (la boleta) que el empleado
registró, con o sin internet, y el servidor la guarda. Después recibe sus cambios: la ropa
pasa a "en proceso", a "lista para recoger", o se anula. El admin también puede registrar
cuando atiende el mostrador, indicando en qué sucursal está.

## Cómo funciona, paso a paso

**Caso 1: María registra una orden sin internet y la subida llega dos veces.**

1. En el mostrador, la app escribe la orden en SQLite con un id propio y PowerSync la
   encola. Cuando vuelve la conexión, la sube como `POST /api/ordenes` con las columnas
   de la tabla: `id`, `numero_boleta`, `cliente_id`, `descripcion`, `precio_total` y
   `fecha_entrada`, la hora a la que María la registró de verdad.
2. `backend/src/routes/index.ts:17` manda todo `/ordenes` al router, y
   `backend/src/routes/ordenes.routes.ts:11` exige sesión antes de cualquier cosa.
3. `postOrden` (`backend/src/controllers/ordenes.controller.ts:129`) valida campo por
   campo. El id tiene que ser un UUID (`:133`). El precio pasa por `leerPrecio` (`:145`),
   que usa `montoEnCentavos` (`backend/src/utils/validacion.ts:71`): `"45.50"` sale de ahí
   como el entero `4550`. La fecha tiene que traer zona horaria
   (`backend/src/utils/validacion.ts:117`).
4. La sucursal no se lee del cuerpo. `sucursalDeRegistro` (`:106`) devuelve la de la
   sesión de María, que es EMPLEADO. Si fuera el admin, leería `sucursal_id` del cuerpo
   y comprobaría en `sucursales.model.ts` que exista y esté activa.
5. `ordenes.crear` (`backend/src/models/ordenes.model.ts:145`) hace un solo `INSERT`. El
   precio vuelve a ser el string `"45.50"`, la fecha pasa por `timestamptz` (`:151`) y
   `ON CONFLICT (id) DO NOTHING` (`:152`) se encarga del reintento.
6. La primera subida inserta y el controller responde **201** (`:155`). La respuesta se
   pierde por el camino, así que PowerSync reintenta: el `INSERT` no hace nada, el model
   lee la orden que ya estaba y el controller responde **200**. Para la cola, las dos
   respuestas son éxito.
7. Si en cambio otra orden de la sucursal ya usaba esa boleta, Postgres rechaza la fila
   por `uq_boleta_por_sucursal`. `traducirErrores` (`ordenes.model.ts:91`) lo convierte
   en `BoletaOcupadaError`, y el controller (`:159`) responde 409 `BOLETA_DUPLICADA` con
   el mensaje para el mostrador.

**Caso 2: María marca la orden como lista, justo cuando otra persona la anula.**

1. Llega `PATCH /api/ordenes/:id` con `{ "estado": "LISTO" }`, y `patchOrden` (`:187`) lo
   recibe.
2. El controller no lee la orden para decidir. Pregunta a
   `estadosDeOrigen` (`backend/src/utils/dominio.ts:77`) desde qué estados se puede
   llegar a LISTO, y la tabla `ORIGENES` (`dominio.ts:60`) responde RECIBIDO, EN_PROCESO
   y LISTO. Pasa esa lista al model (`:214`), junto con la sucursal de María.
3. `actualizar` (`ordenes.model.ts:230`) mete esas condiciones dentro del propio
   `UPDATE` (`:241`): `WHERE id = $1 AND estado = ANY($2) AND sucursal_id = $3`.
4. La anulación llegó un instante antes, así que la orden ya está en ANULADO y el
   `UPDATE` no toca ninguna fila. Solo entonces el model vuelve a leerla (`:259`). Existe
   y es de la sucursal de María, así que devuelve `estado-no-admitido`.
5. El `switch` del controller (`:225`) lo convierte en 409 `TRANSICION_INVALIDA`, con el
   texto de `transicionInvalida` (`:168`): "La orden 001234 ya está anulada y no se puede
   cambiar."

## Dónde encaja en la arquitectura

Las capas son las de siempre (CLAUDE.md §5). Lo nuevo es una cuarta pieza, que no es capa:

- **`utils/dominio.ts`: reglas del negocio sin base ni HTTP.** Guarda qué estados existen
  y cómo se avanza entre ellos. Son funciones puras, así que se testean sin mocks. Lo que
  **no** hace es decidir si una orden concreta puede cambiar: no la conoce. Solo dice qué
  estados de origen sirven para cada destino.
- **Model: comprueba la regla en la misma sentencia que escribe.** El model no sabe *por
  qué* esos estados de origen, solo que tiene que exigirlos. Si el controller leyera la
  orden y decidiera él, la regla quedaría en una capa que no puede garantizarla (ver
  Fundamentos).
- **Controller: traduce el resultado a HTTP, en el idioma del mostrador.** El model
  devuelve `estado-no-admitido`, no un 409. Cómo se le dice eso al empleado, y con qué
  palabras, es decisión del controller (§9: nunca el ENUM en pantalla).

La sucursal y quien recibe salen de la sesión y nunca del cuerpo. Es la misma regla que
`sucursal_registro_id` en clientes, y es control de acceso: sin ella, cualquier
dispositivo podría escribir en otra sucursal.

## Fundamentos

### Máquina de estados

Una orden no tiene un estado cualquiera: tiene un estado actual, y desde él solo puede ir
a algunos otros. Eso se llama máquina de estados. Lo importante es que se describe como
**datos** (una tabla) y no como una cadena de `if`s repartida por el código.

En este repo la tabla es `ORIGENES` (`backend/src/utils/dominio.ts:60`). Está escrita al
revés de lo habitual: para cada destino, desde dónde se llega. Así la consulta al model
es directa ("tocá la orden solo si su estado es uno de estos").

Sin tabla, cada endpoint que cambie un estado reinventaría la regla. Pasa algo parecido
con la entrega, que va a pasar la orden a ENTREGADO: tarde o temprano dos sitios
discreparían sobre si una orden anulada se puede entregar.

Detalle que no es obvio: **cada estado admite venir de sí mismo.** Pasar a LISTO una orden
que ya está LISTO no es un error, porque es exactamente lo que hace un reintento. Ver
"entrega al menos una vez" en la bitácora de SPEC-ALE186-003.

### Condición de carrera: leer, decidir y escribir

El código más natural para "solo se puede pasar a LISTO si no está anulada" es:

```
const orden = await buscarPorId(id);        // 1. leer
if (orden.estado === 'ANULADO') throw ...;   // 2. decidir
await update(id, { estado: 'LISTO' });       // 3. escribir
```

Tiene un hueco entre el paso 1 y el 3. Si en ese instante llega otra petición que anula
la orden, esta la pasa a LISTO igual, porque decidió con un dato que ya no era cierto.
Eso es una condición de carrera: el resultado depende de qué petición llega primero, y
casi siempre sale bien, así que el bug solo aparece de vez en cuando y nadie lo reproduce.

Aquí se cierra poniendo la condición dentro del `UPDATE` (`ordenes.model.ts:241`).
Postgres evalúa el `WHERE` y escribe en la misma operación, con la fila bloqueada: o
cumple y se aplica, o no. Si no se aplicó, se relee solo para explicar por qué
(`ordenes.model.ts:259`), y esa segunda lectura ya no decide nada.

Es un patrón para copiar en cualquier escritura que dependa del estado actual de la fila.
La entrega va a necesitarlo: no se entrega una orden anulada.

### Unión discriminada: un resultado con nombre

`actualizar` puede terminar de tres formas, y la tercera no es un error de programación:
es una respuesta de negocio. En vez de lanzar excepciones o devolver `null` con
significados distintos, devuelve un objeto con un campo `tipo`
(`ordenes.model.ts:212`):

```ts
| { tipo: 'actualizada'; orden: Orden }
| { tipo: 'no-encontrada' }
| { tipo: 'estado-no-admitido'; orden: Orden }
```

TypeScript entiende el campo `tipo`. Dentro de `case 'actualizada':` sabe que existe
`orden`, y dentro de `case 'no-encontrada':` sabe que no. Si mañana se agrega un cuarto
caso, el `switch` del controller (`ordenes.controller.ts:225`) deja de cubrirlos todos y
el compilador lo avisa. Un `null` no dice *por qué*, y una excepción obliga a atraparla
lejos de donde se decide.

**Ya explicado antes:**

- **Idempotencia** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Entrega al menos una vez** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Ids generados por el cliente** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Códigos de error de Postgres (SQLSTATE)** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Errores de dominio** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **UPDATE dinámico con lista blanca** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **TIMESTAMP sin zona horaria** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Dinero en centavos enteros** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Test contra la fuente de verdad** y **type guard** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)

## Decisiones y por qué

- **`fecha_entrada` la manda el dispositivo, y con zona horaria obligatoria.** Una orden
  registrada sin internet puede subir un día después, y con `NOW()` las estadísticas de
  volumen por día quedarían corridas. La zona es obligatoria porque la columna es
  `TIMESTAMP` sin zona, y Postgres descarta en silencio la zona de un texto que la trae.
  `COALESCE($9::timestamptz::timestamp, LOCALTIMESTAMP)` (`ordenes.model.ts:151`)
  convierte el instante a la misma hora de referencia que usan las demás filas. **Es un
  contrato con `cola-subida`:** el frontend tiene que mandar
  `new Date().toISOString()`.
- **Un reintento de un `PATCH` de estado no falla.** La spec pedía 409 al "tocar una orden
  ANULADA", pero así el reintento de la propia anulación fallaría. Se resolvió así:
  repetir el estado actual pasa, y cambiar cualquier otro campo de una orden cerrada no
  (`estadosDeOrigen`, parámetro `tocaOtrosCampos`).
- **El ADMIN registra indicando la sucursal.** No tiene una propia (`sucursal_id` NULL),
  y la alternativa, darle una cuenta de EMPLEADO aparte, perdería quién atendió. Queda
  abierto lo del lado del dispositivo (ver abajo).
- **404 y no 403 para la orden de otra sucursal.** Un 403 confirmaría que ese id existe.
- **El cliente inexistente es un 400, no un 404.** El recurso de la ruta es la orden, y lo
  que está mal es un dato del cuerpo. Se detecta por la clave foránea
  (`ordenes_cliente_id_fkey`), sin una consulta previa que tendría la misma carrera que la
  descrita arriba.
- **Los ENUM, también en el backend.** `utils/dominio.ts` repite las listas de
  `frontend/src/lib/dominio.ts`, porque §6 exige que el servidor valide por su cuenta. Un
  test compara las dos con el schema, así que no pueden separarse sin que alguien se
  entere.

## Los tests

- **Se reusaron** `testApi` y `expectApiError` (`tests/helpers/api.ts`) para cada caso de
  error, y `conSesion` (`tests/helpers/usuarios.ts`), que con `{ rol: 'ADMIN', sucursalId:
  null }` da la sesión del admin sin fabricar nada.
- **Se generalizó** `unicidadViolada`, que vivía suelto en `clientes.model.test.ts`. Ahora
  está en `tests/helpers/postgres.ts`, junto a `claveForaneaViolada` y un
  `errorDePostgres(codigo, restriccion)` genérico, y el test de clientes lo importa de
  ahí. Pagos y entregas lo van a necesitar para sus claves foráneas.
- **Se creó** `tests/helpers/ordenes.ts`: `ordenDePrueba()` para la orden que devuelve el
  model y `cuerpoDeOrden()` para lo que sube la cola, con un id nuevo en cada llamada. Trae
  además `IDS`, con los ids que ya usaban `usuarios.ts` y `clientes.ts` más uno para "otra
  sucursal". La próxima spec lo usa así:

  ```ts
  actualizar.mockResolvedValue({ tipo: 'actualizada', orden: ordenDePrueba({ estado: 'LISTO' }) });
  await testApi().post('/api/pagos').set(conSesion()).send({ orden_id: IDS.orden, ... });
  ```

- **`tests/unit/dominio.test.ts`** lee los ENUM del schema, con la misma técnica que el
  test del frontend.
- **Hueco honesto:** todo el SQL se probó con el pool mockeado. Que
  `ANY($2::estado_orden[])`, el paso por `timestamptz` y el `ON CONFLICT` con una boleta
  repetida funcionen de verdad solo se comprueba contra Postgres, y en esta sesión Docker
  no estaba levantado.

## Si mañana tenés que tocar esto

- **Para cambiar qué transiciones valen, se toca solo `ORIGENES`** (`dominio.ts:60`) y
  sus tests. El controller y el model no saben de la regla.
- **Un campo editable nuevo tiene que ir a dos sitios:** `COLUMNA_EDITABLE`, en el model,
  y la lista de `'x' in cuerpo`, en el controller. Si falta en el primero, no se escribe;
  si falta en el segundo, se ignora en silencio.
- **Queda abierto del lado del dispositivo:** el admin no baja el bucket `sucursal`
  (CLAUDE.md §7), así que su app no puede validar la boleta sin internet. El backend ya
  acepta sus órdenes; cómo trabaja su app se decide con quien lleve las sync rules.
