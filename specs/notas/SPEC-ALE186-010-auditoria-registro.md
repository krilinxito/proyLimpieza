---
id: SPEC-ALE186-010
spec: specs/SPEC-ALE186-010-auditoria-registro.md
explica:
  - componer sql sin perder la parametrizacion
  - is distinct from
  - jsonb
  - leer la fila de antes en el mismo update (update from for update)
---

# SPEC-ALE186-010 — Registro de auditoría en cada escritura

## Qué se construyó

Ahora el sistema anota quién hizo cada cosa: quién dio de alta un cliente, quién recibió
una orden, quién la anuló y en qué estado estaba, quién cobró, quién entregó y quién
entró al sistema. Cuando algo se edita queda también el valor que tenía antes. Lo
anotado no se puede perder ni inventar: o queda la acción con su anotación, o no queda
ninguna de las dos.

## Cómo funciona, paso a paso

Sigamos una edición: un empleado corrige el nombre de un cliente.

1. **La petición.** `PATCH /api/clientes/:id` con `{ "nombre": "Ana María" }` llega a
   `patchCliente`. El controller valida, arma `cambios` y llama
   `clientes.actualizar(id, cambios, sesionDe(req).id)`
   (`backend/src/controllers/clientes.controller.ts:109`). El tercer argumento es nuevo:
   **quién** hizo el cambio, sacado del token. Nunca se lee del cuerpo.
2. **El UPDATE que recuerda.** En `clientes.actualizar`
   (`backend/src/models/clientes.model.ts:178`), la lista de campos sale, como antes, de
   la lista cerrada `COLUMNA_EDITABLE`. Lo nuevo es que el UPDATE se arma con
   `updateConAntes` (`backend/src/models/auditoria.model.ts:131`), que produce:

   ```sql
   UPDATE clientes AS c SET nombre = $2
     FROM (SELECT id, nombre, … FROM clientes WHERE id = $1 FOR UPDATE) AS antes
    WHERE c.id = antes.id
   RETURNING c.id, c.nombre, …,
             (CASE WHEN antes.nombre IS DISTINCT FROM c.nombre
                   THEN jsonb_build_object('nombre', antes.nombre) ELSE '{}'::jsonb END)
             AS valores_anteriores
   ```

   En el `RETURNING`, `antes` es la fila como estaba y `c` como quedó. La expresión de
   `valores_anteriores` la arma `valoresAnteriores` (`auditoria.model.ts:96`), una parte
   por cada columna del PATCH.
3. **Encadenar la auditoría.** Ese UPDATE se envuelve con `conAuditoria`
   (`auditoria.model.ts:46`):

   ```sql
   WITH escrita AS ( <el UPDATE de arriba> ),
   auditada AS (
     INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id, valores_anteriores)
     SELECT $3::uuid, $4::accion_auditoria, $5, escrita.id, escrita.valores_anteriores
       FROM escrita
      WHERE escrita.valores_anteriores <> '{}'::jsonb
   )
   SELECT id, nombre, … FROM escrita
   ```

   Los parámetros de la auditoría van después de los del UPDATE. `conAuditoria` cuenta
   cuántos traía la escritura (`auditoria.model.ts:50`) y numera desde ahí.
4. **Postgres lo ejecuta como una sola sentencia** (`clientes.model.ts:204`). Si el
   cliente no existe, `antes` sale vacío, `escrita` también, y `auditada` no tiene filas
   de dónde sacar la suya. Si el nombre ya era "Ana María", `valores_anteriores` es
   `'{}'` y el `WHERE` la descarta. Si el INSERT en `auditoria` falla, se deshace también
   el UPDATE.
5. **Lo que queda.** Una fila en `auditoria`:
   `{ usuario_id: <empleado>, accion: EDITAR, tabla_afectada: clientes, registro_id: <cliente>,
   valores_anteriores: {"nombre": "Ana"} }`. El controller recibe el cliente como siempre
   y responde 200, sin enterarse de nada de esto.

Las altas son el mismo esquema sin `antes`: la escritura es el `INSERT … ON CONFLICT
(id) DO NOTHING` de siempre, y `valores_anteriores` queda `NULL`. Un reintento no inserta,
así que tampoco anota. La entrega ya tenía su propio CTE (`orden AS (UPDATE …)`), que
pasa a `conAuditoria` como `ctesPrevios` (`backend/src/models/entregas.model.ts:141`). El
login es lo único suelto: el controller llama `auditoria.registrar` después de comprobar
la contraseña y el `activo` (`backend/src/controllers/auth.controller.ts:86`).

## Dónde encaja en la arquitectura

- **`models/auditoria.model.ts` arma SQL pero no lo ejecuta** (salvo el LOGIN). Cada
  model sigue siendo el único que habla con su tabla (CLAUDE.md, sección 5). Si cada
  model ejecutara su escritura y después llamara a "auditoría" por separado, serían dos
  sentencias, y se perdería justo lo que pide la spec: que sean las dos o ninguna. Por
  eso la auditoría entra como un fragmento de la misma sentencia.
- **El controller decide quién; el model, qué y dónde.** El controller pasa
  `sesionDe(req).id`, porque es el único que ve la sesión, y el model no conoce `req`. La
  acción (`EDITAR`) y la tabla (`clientes`) las fija el model: son parte de lo que la
  función *es*, no algo que el que llama pueda elegir.
- **Por qué no un trigger.** Sería lo clásico, y lo descartó SPEC-ALE186-006 por la
  misma razón: no hay migraciones, y un trigger nuevo obliga a todos a `down -v`.
  Además, un trigger no sabe quién está en la sesión de la API: habría que pasárselo con
  `SET LOCAL`, en una transacción, desde cada model. El costo de esta elección está
  anotado en CLAUDE.md §13: lo que se escriba sin pasar por `conAuditoria` no queda
  auditado.

## Fundamentos

**Leer la fila de antes en el mismo UPDATE (`UPDATE … FROM (… FOR UPDATE)`).**
`RETURNING` devuelve la fila **después** del cambio, y para auditar hace falta la de
antes. La forma ingenua es hacer un `SELECT` primero y el `UPDATE` después, pero eso abre
la carrera de leer y luego escribir (SPEC-ALE186-004): entre las dos sentencias, otra
petición puede cambiar la fila, y se anotaría un "antes" que ya no era cierto. La
solución es unir en el `FROM` del UPDATE una subconsulta sobre la misma fila con
`FOR UPDATE`. Es el bloqueo **para escribir**, más fuerte que el `FOR SHARE` de pagos
(SPEC-ALE186-005). Aquel deja que otros también tomen la fila con `FOR SHARE` y solo
frena a quien quiere cambiarla. `FOR UPDATE` frena a todos los que quieran tomarla,
incluidos los `FOR SHARE`; las lecturas comunes siguen pasando. Acá corresponde el
fuerte porque esta sentencia va a escribir la fila. Como la subconsulta es parte de la sentencia, si otra
petición tenía la fila tomada, esta espera y lee la versión que dejó la otra. El "antes"
es siempre exactamente lo que el UPDATE pisa. Está en `auditoria.model.ts:139`, y las
condiciones de cada model (estado, sucursal) van dentro de ese SELECT: si la fila no
las cumple, `antes` sale vacío y no se toca nada.

**`IS DISTINCT FROM`.** Con `=`, comparar con `NULL` da `NULL`, no `true` ni `false`:
`NULL = NULL` es "no sé". Entonces `antes.carnet <> c.carnet` con el carnet en NULL
antes y después no diría "son distintos", pero tampoco "son iguales", y un `CASE WHEN`
lo trataría como falso por accidente. Peor es pasar de `'123'` a `NULL`: `<>` da NULL y
el cambio se perdería. `IS DISTINCT FROM` trata a NULL como un valor más: `NULL IS
DISTINCT FROM NULL` es `false` y `'123' IS DISTINCT FROM NULL` es `true`. Se usa en
`auditoria.model.ts:104`, y el test "editar un cliente guarda el valor de antes de lo que
cambió, y nada de lo que no" lo comprueba con un carnet que ya era NULL.

**JSONB.** Es el tipo de Postgres para guardar un objeto JSON en una columna,
almacenado ya parseado (la B es de *binary*), así que se puede consultar por clave.
`valores_anteriores` es JSONB porque cada edición toca columnas distintas, y una tabla
con una columna por cada campo posible de cada tabla auditada sería absurda. Se arma con
`jsonb_build_object('clave', valor)` y se combinan objetos con `||`. Un detalle que
importa acá: un `NUMERIC` dentro de JSON se vuelve un número JSON, y al leerlo en
JavaScript es un float. Por eso el precio se guarda como texto (`comoTexto`,
`backend/src/models/ordenes.model.ts`, `columnaAuditada`): `"45.50"`, igual que sale de la
API.

**Componer SQL sin perder la parametrización.** `conAuditoria` recibe un SQL ya armado
con `$1…$n` y le agrega su parte con `$n+1…`. La regla que lo hace seguro: lo único que
se escribe dentro del texto son cosas que salen del código (nombres de tabla y de
columna de listas cerradas, la clave `contrasena_cambiada`), nunca un valor que llega en
la petición. Quién, qué acción y qué tabla van como parámetros aunque sean constantes.
El test `it.each(ESCRITURAS)` (`backend/tests/unit/auditoria.model.test.ts:132`) lo
verifica para las ocho escrituras.

**Ya explicado antes:**

- **CTE que modifica datos** → SPEC-ALE186-006 (`specs/notas/SPEC-ALE186-006-entregas-api.md`)
- **Atomicidad de una sentencia** → SPEC-ALE186-006 (`specs/notas/SPEC-ALE186-006-entregas-api.md`)
- **Condición de carrera al leer y luego escribir** → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Bloqueo de fila (FOR SHARE)** → SPEC-ALE186-005 (`specs/notas/SPEC-ALE186-005-pagos-api.md`)
- **Idempotencia** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **UPDATE dinámico con lista blanca** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Test de integración** → SPEC-ALE186-007 (`specs/notas/SPEC-ALE186-007-tests-base-real.md`)

## Decisiones y por qué

- **Avanzar y anular una orden son `EDITAR`, no una acción propia.** El ENUM no tiene
  `ANULAR`, y agregarlo exige `down -v`. Lo que dice qué pasó es
  `valores_anteriores: {"estado": "EN_PROCESO"}` junto con el estado actual de la orden.
- **Una entrega anota solo `ENTREGAR`, no también un `EDITAR` de la orden.** El paso a
  ENTREGADO es consecuencia de la entrega, y anotarlo dos veces haría que la consulta
  futura cuente dos acciones donde hubo una.
- **Solo se anota lo que cambió de verdad.** La alternativa era anotar las columnas que
  vinieron en el PATCH. Pero PowerSync reenvía el mismo PATCH si se pierde la respuesta
  (*entrega al menos una vez*, SPEC-ALE186-003), y cada reintento dejaría un cambio
  fantasma.
- **De la contraseña, solo la marca.** El hash viejo en `auditoria` sería otra copia del
  hash fuera de `usuarios`, en una tabla que no tiene la protección de "listar columnas
  explícitas". Como un hash bcrypt nuevo nunca es igual al anterior (lleva sal),
  "mandaron contraseña" es lo mismo que "cambió la contraseña".
- **Login sí; logins fallidos y renovaciones, no.** `auditoria.usuario_id` es `NOT NULL`,
  y un username inventado no es de nadie. La renovación pasa en cada reconexión: en una
  sucursal con wifi flojo serían decenas de filas por día que no dicen nada.
- **Si la anotación del login falla, el login falla.** Un 500 en el login es molesto,
  pero un login sin rastro es lo que la spec quiere evitar. Y si la base no puede
  insertar una fila, tampoco va a poder atender lo que venga después.

## Los tests

- **Reusados:** `conSesion` y `comoAdmin` (sesiones), `escenario`, `crearOrden` y
  `crearUsuario` de `baseReal.ts` (filas reales), y los cuerpos `cuerpoDeAlta`,
  `cuerpoDeOrden`, `cuerpoDePago` y `cuerpoDeEntrega`.
- **Creado: `auditoriaDe(registroId)`** en `backend/tests/helpers/baseReal.ts:181`.
  Devuelve las filas de auditoría de un registro, ya en camelCase. `auditoria-consulta` lo
  va a necesitar para preparar datos antes de consultar.
- **Creado: `ID_DE_SESION`** en `backend/tests/helpers/usuarios.ts:54`. Es el id que usa
  `conSesion()` por defecto, exportado para poder escribir
  `expect(crear).toHaveBeenCalledWith(…, ID_DE_SESION)`: "se anotó a nombre de la sesión"
  sin copiar el UUID.
- **La lista `ESCRITURAS`** (`auditoria.model.test.ts:132`) es una tabla de las ocho
  escrituras auditadas: con qué acción, en qué tabla, a nombre de quién. **Una escritura
  nueva tiene que sumar ahí su línea.** Si la agregás y el test falla, te olvidaste de
  `conAuditoria`.
- **Los tests de atomicidad** (`backend/tests/db/auditoria.db.test.ts:218` y siguientes)
  hacen fallar la parte de auditoría a propósito, con un autor que no existe (rompe la FK
  de `usuario_id`), y comprueban que la escritura tampoco quedó. Con dobles no se podría:
  un doble del pool falla o no falla entero, no "a medias".
- Se ajustaron los tests de los models que miraban la forma exacta del SQL: el UPDATE
  ahora es `UPDATE … AS c … FROM (… FOR UPDATE) AS antes`. Los de pagos y entregas que
  usaban `.at(-1)` para leer la sucursal pasaron a un índice fijo, porque ahora los
  parámetros de la auditoría van al final.

## Si mañana tenés que tocar esto

- **Una escritura nueva** (por ejemplo, la corrección de registros rechazados): envolvela
  con `conAuditoria`, y si es un UPDATE armalo con `updateConAntes`. Pasale el autor desde
  el controller con `sesionDe(req).id` y sumá su línea a `ESCRITURAS`.
- **Una columna nueva editable:** si es dinero, `comoTexto: true`. Si es un secreto,
  `soloMarca`.
- **Las `condiciones` de `updateConAntes`** van dentro del `SELECT … FOR UPDATE`, sobre la
  tabla sin alias. Ahí no existe `c`: escribí `estado = …`, no `c.estado = …`.
- **La consulta de todo esto** (`GET /api/auditoria`, solo ADMIN) va en su propia spec
  (`auditoria-consulta`).
