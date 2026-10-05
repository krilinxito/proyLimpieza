---
id: SPEC-ALE186-009
spec: specs/SPEC-ALE186-009-usuarios-admin.md
explica:
  - defensa en profundidad
  - doble con estado
  - limite de 72 bytes de bcrypt
  - reintento idempotente frente a choque de id
---

# SPEC-ALE186-009 — Alta, edición y baja de empleados

## Qué se construyó

Hasta acá la única cuenta del sistema era la del admin que crea la semilla. Ahora el
admin puede dar de alta a quien atiende cada sucursal, corregir sus datos, cambiarle la
contraseña y darlo de baja, con `POST /api/usuarios` y `PATCH /api/usuarios/:id`. Nadie
se borra: dar de baja (`activo: false`) es la única salida.

## Cómo funciona, paso a paso

**Caso: el admin da de alta a Rosa en la sucursal Central, y un mes después la da de baja.**

1. Llega `POST /api/usuarios` con `{ id, nombre_completo, username, password, sucursal_id }`.
   El router lo deriva a `/usuarios` (`backend/src/routes/index.ts:25`), y ahí se cruzan
   dos middlewares antes de tocar el controller: `requireAuth` y `requireRol('ADMIN')`
   (`backend/src/routes/usuarios.routes.ts:10`). Un EMPLEADO se queda en el 403 sin que
   el controller llegue a ejecutarse.
2. `postUsuario` (`backend/src/controllers/usuarios.controller.ts:153`) lee cada campo
   con su `leer*`: el nombre y el username con tope de largo (`:41`, `:49`), la
   contraseña con `contrasenaValida` (`backend/src/utils/validacion.ts:161`), y el rol,
   que si no viene es `EMPLEADO` (`:78`).
3. Como Rosa es EMPLEADO, `leerSucursalDeEmpleado` (`:95`) busca la sucursal en la base:
   si no existe o está cerrada, 404 con qué hacer. Si fuera ADMIN y trajera sucursal,
   400: el admin no tiene sucursal (CLAUDE.md §3).
4. La contraseña se hashea con bcrypt (`:181`), y `creadoPor` sale de la sesión (`:183`),
   nunca del cuerpo.
5. `usuarios.registrar` (`backend/src/models/usuarios.model.ts:205`) hace el `INSERT … ON
   CONFLICT (id) DO NOTHING` (`:213`). Si el username ya es de otra cuenta, Postgres tira
   la unicidad de `usuarios_username_key` (`:160`), el model la convierte en
   `UsernameOcupadoError`, y el controller responde 409 `USERNAME_DUPLICADO`.
6. Si la fila ya existía con ese id (un reintento), el model devuelve la guardada con
   `creado: false`. El controller la compara con lo pedido (`mismosDatos`, `:142` y
   `:191`): igual → 200, distinta → 409 `CONFLICTO`.
7. La respuesta pasa por `paraRespuesta` (`:115`), que copia campo por campo lo que puede
   salir. 201 la primera vez.

**Un mes después, la baja.** `PATCH /api/usuarios/<id-de-rosa>` con `{ activo: false }`
llega a `patchUsuario` (`:207`). Primero busca la cuenta (`:211`): sin ella no se sabe
el rol, y el rol decide si la sucursal es obligatoria o prohibida. Si quien pide la baja
es el mismo admin de la sesión, 409 `BAJA_PROPIA` (`:243`). Si no, `usuarios.actualizar`
(`model:265`) escribe solo `activo`.

**Lo que pasa después en la tablet de Rosa.** Su token sigue siendo válido por firma
durante los días que le quedan, porque un JWT no se puede "apagar" desde el servidor
(→ SPEC-ALE186-002). La baja se hace efectiva donde el servidor vuelve a tener la palabra:
el login y la renovación miran `activo` en la base (`backend/src/controllers/auth.controller.ts:80`
y `:100`). Eso es exactamente lo que recorre
`backend/tests/db/usuarios.db.test.ts:59`.

## Dónde encaja en la arquitectura

Es la misma partición que el resto del backend (CLAUDE.md §5), sin piezas nuevas:

- **La ruta** declara el control de acceso, y nada más. Que sea "solo ADMIN" se lee en
  una línea del archivo de rutas, no escondido en un `if` del controller. CLAUDE.md §8 lo
  dice para el dashboard, y vale igual acá: esconder el botón en la UI no es control de
  acceso.
- **El controller** decide qué es válido y qué responde: los largos, el par rol/sucursal,
  la baja propia, el 409 del reintento distinto. No escribe SQL.
- **El model** arma el SQL y traduce los errores de Postgres a errores de dominio. No sabe
  que existe HTTP: `UsernameOcupadoError` no dice "409", eso lo decide el controller.

Lo que **no** hay, a propósito: un `GET`. La tabla `usuarios` ya baja a todos los
dispositivos por el bucket `global`, sin `password_hash` (§7). Una cuenta nueva aparece en
las tablets sin tocar las sync rules.

## Fundamentos

### Defensa en profundidad: dos barreras para el mismo secreto

**Qué es.** Proteger algo importante con dos mecanismos independientes, de modo que si
uno falla el otro todavía aguanta.

**Por qué existe.** Los errores que filtran datos casi nunca son de diseño: son un cambio
chico, en otro archivo, meses después. Alguien agrega `password_hash` a `COLUMNAS` "para
un caso puntual" y, desde ese momento, todo lo que reenvíe lo que devuelve el model lo
publica.

**En este repo** el hash tiene dos barreras:

1. El model nunca lo lee, salvo en `buscarPorUsername`, que es la del login
   (`backend/src/models/usuarios.model.ts:71`, la lista de columnas sin hash).
2. El controller no responde con lo que le da el model, sino con una copia campo por campo
   (`paraRespuesta`, `backend/src/controllers/usuarios.controller.ts:115`).

**Qué pasaría sin la segunda.** Lo descubrió el propio test, mientras se escribía esta
spec. El doble del model devolvía la cuenta junto con `passwordHash`, y el controller lo
mandaba tal cual en la respuesta. El model de verdad no lo hace, pero eso dependía de una
sola barrera. El test que lo cazó sigue en `tests/http/usuarios.test.ts` ("guarda la
contraseña nueva hasheada, y no la devuelve").

### El límite de 72 bytes de bcrypt

**Qué es.** bcrypt solo usa los primeros 72 **bytes** de la contraseña. El resto lo
descarta sin avisar.

**Qué pasaría sin cuidarlo.** Dos contraseñas largas que empiezan igual serían la misma
contraseña. Y son bytes, no letras: en UTF-8 una `ñ` ocupa 2, así que 37 eñes ya se pasan.

**En este repo** se corta antes de hashear: `BYTES_MAXIMOS_CONTRASENA`
(`backend/src/utils/validacion.ts:158`), medido con `Buffer.byteLength`. El test de
`validacion.test.ts` usa justamente eñes para mostrar la diferencia entre letras y bytes.

### Reintento idempotente frente a choque de id

**Qué es.** El patrón de SPEC-ALE186-003 decía: "si el id ya existe, devolvé lo que hay".
Esta spec lo afina, porque el mismo id puede llegar dos veces por motivos distintos:

- **Un reintento**: la misma alta, que la red repitió. Trae los mismos datos, y lo
  correcto es responder 200 como si nada.
- **Un choque**: otra alta que, por un error del cliente, reusó un id. Trae datos
  distintos. Responder 200 con la cuenta vieja le haría creer al admin que creó a alguien
  que no existe.

**En este repo** el model no decide cuál de los dos es (`registrar` devuelve la fila
guardada con `creado: false`). Lo decide el controller comparando
(`usuarios.controller.ts:142`). La contraseña queda fuera de esa comparación: para
compararla habría que traer el hash hasta el controller, y eso rompería la primera
barrera de arriba.

### Un doble con estado

**Qué es.** Un doble que no devuelve una respuesta fija por llamada, sino que guarda lo
que se le escribe y lo devuelve en la lectura siguiente. Es una "base" de una sola fila,
en memoria.

**Por qué acá.** Lo que había que probar es que tres endpoints (PATCH, login, renovar)
hablan del **mismo** `activo`. Con respuestas fijas, el test le diría al login "devolvé
inactivo", y no probaría nada: el resultado lo habría escrito el test. Con estado, el
PATCH lo escribe y el login lo lee (`tests/http/usuarios.test.ts:316`, la variable
`guardada` de la línea 317).

**Su límite.** Sigue sin ser Postgres. La versión que prueba de verdad que el `UPDATE` y
el `SELECT` se ven entre sí está en `tests/db/usuarios.db.test.ts:59`.

**Ya explicado antes:**

- **Idempotencia** y **entrega al menos una vez** → SPEC-ALE186-002 / SPEC-ALE186-003
  (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Ids generados por el cliente** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Update dinámico con lista blanca** → SPEC-ALE186-003: `COLUMNA_EDITABLE`
  (`usuarios.model.ts:251`) es el mismo patrón
- **Errores de dominio** y **códigos de error de Postgres (SQLSTATE)** → SPEC-ALE186-003
- **Hash de contraseña con bcrypt** y **JSON Web Token** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Autenticación vs autorización (401 y 403)** → SPEC-ALE186-002
- **Mock parcial de un módulo** → SPEC-ALE186-003: el test HTTP conserva la
  `UsernameOcupadoError` real con `importOriginal`
- **Test de integración** y **aislar los datos de prueba** → SPEC-ALE186-007 (`specs/notas/SPEC-ALE186-007-tests-base-real.md`)

## Decisiones y por qué

- **La sucursal se comprueba en el controller, no traduciendo la FK.** Así lo hace
  órdenes (SPEC-ALE186-004), y además permite rechazar una sucursal **cerrada**
  (`activa = false`), cosa que la FK no sabe. Lo descartado: capturar el `23503` de la
  FK, que es atómico pero no distingue "cerrada" de "no existe".
- **El rol y el username no se editan.** El username es con lo que la persona entra:
  cambiárselo sin avisarle la deja afuera. Y el rol cambia qué ve. Si hace falta, se da de
  baja la cuenta y se crea otra.
- **Sin rol en el cuerpo, la cuenta es de EMPLEADO.** Es lo que se crea casi siempre, y el
  criterio de la spec no listaba el rol entre los campos del alta.
- **La baja propia se frena, la de otro admin no.** Si un admin da de baja a otro, quien
  lo hace sigue activo, así que el sistema nunca queda sin nadie que pueda entrar a
  administrarlo.
- **Teléfono vacío = NULL.** Igual que el carnet de clientes.

## Los tests

- **Reusados:** `testApi` y `expectApiError` (`tests/helpers/api.ts`), `conSesion` y
  `usuarioDePrueba` (`tests/helpers/usuarios.ts`), `unicidadViolada`
  (`tests/helpers/postgres.ts`), y de `baseReal.ts`, `crearUsuario`, `crearSucursal` y
  `contar`. No hizo falta ningún helper nuevo de cero.
- **Extendidos** en `tests/helpers/usuarios.ts`: `cuerpoDeAltaUsuario`, que genera un id y
  un username nuevos en cada llamada para que dos altas no choquen (el mismo patrón que
  `cuerpoDeAlta` de clientes), y `comoAdmin`, que ahorra repetir
  `conSesion({ rol: 'ADMIN', sucursalId: null })` en cada test. La pantalla de usuarios
  del admin, y cualquier endpoint solo ADMIN que venga, puede usar los dos.
- `usuarioDePrueba` ganó `telefono: null`, porque `Usuario` tiene ahora ese campo.
- **El criterio "solo buscarPorUsername devuelve el hash"** se prueba de la forma que
  importa: el doble del pool devuelve una fila CON hash a todas las funciones, y se
  comprueba que ninguna lo deja pasar (`tests/unit/usuarios.model.test.ts:135`). Se miran
  solo las columnas que se leen (`SELECT … FROM` y `RETURNING`). El `INSERT` y el `SET`
  nombran `password_hash` porque lo escriben, y eso está bien.

## Si mañana tenés que tocar esto

- Empezá por `patchUsuario`: el orden importa. Primero se busca la cuenta (sin rol no se
  puede validar la sucursal), después se valida todo, y recién al final se hashea, que es
  lo caro.
- El coste de bcrypt (`COSTE_BCRYPT = 10`) está repetido en `db/seed.ts`, y el mínimo de 8
  también (`LARGO_MINIMO`). Si cambiás uno, cambiá el otro. Unificarlos exige tocar la
  semilla, que quedaba fuera del scope de esta spec.
- Si algún día se agrega `GET /api/usuarios`, que use `paraRespuesta`. No mandes la fila
  del model tal cual.
