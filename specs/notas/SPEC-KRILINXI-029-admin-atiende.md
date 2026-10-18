---
id: SPEC-KRILINXI-029
spec: specs/SPEC-KRILINXI-029-admin-atiende.md
explica:
  - estado inicial perezoso de useState
  - reconectar la sincronizacion con otros parametros sin perder la cola
  - un dato que se decide en un solo lugar (sucursal de trabajo)
  - un efecto por cada cosa que cambia
---

# SPEC-KRILINXI-029 — El admin atiende en una sucursal

## Qué se construyó

El dueño ya puede atender el mostrador con su propia cuenta. Desde el Inicio elige "Atender en una
sucursal" y cuál, y a partir de ahí registra, cobra y entrega ropa en esa sucursal igual que un
empleado, también sin internet. La cabecera dice "Atendiendo en Centro", con un botón "Dejar de
atender". La elección queda guardada en la tablet hasta que deje de atender o salga.

Es la parte de la tablet de lo que SPEC-KRILINXI-028 hizo en las sync rules (el bucket
`atencion_admin`).

## Cómo funciona, paso a paso

Sigamos a Ana (ADMIN) desde que elige Centro hasta que su boleta queda guardada en Centro.

1. **El Inicio le ofrece elegir.** `pages/Inicio.tsx` monta `<AtenderEnUnaSucursal />`. Ese
   componente se oculta solo para un EMPLEADO o si ya está atendiendo
   (`features/atencion/components/AtenderEnUnaSucursal.tsx:26`). Las opciones salen de
   `useSucursalesAbiertas()`, que lee la base local: por eso funciona sin internet, y las sucursales
   cerradas no aparecen.
2. **"Empezar a atender".** `empezar()` (`AtenderEnUnaSucursal.tsx:28`) llama a
   `atencion.empezar(id)`, que es el `atender` del contexto de la sesión
   (`features/atencion/hooks/useAtencion.ts:24`).
3. **La sesión lo guarda y cambia su estado.** `atender` (`features/auth/SesionProvider.tsx:152`)
   escribe `{ usuarioId, sucursalId }` en `localStorage` con `guardarAtencion`
   (`features/atencion/api/almacen.ts`) y pone `atencion` en el estado de React.
4. **Ese cambio vuelve a conectar PowerSync.** El efecto de conexión (`SesionProvider.tsx:140`)
   depende de `atencion`. Al cambiar, vuelve a llamar a
   `conectar(token, { sucursal_id: 'centro' })` (línea 145), y `envolver` lo pasa al SDK como
   `db.connect(conector, { params })` (`lib/powersync/control.ts:90`).
5. **El servidor decide qué baja.** PowerSync evalúa `atencion_admin`
   (`docker/powersync/sync-rules.yaml:71`) con ese parámetro. Como Ana es ADMIN y está activa, le
   baja las órdenes, los pagos y las entregas de Centro. Un EMPLEADO que mandara el mismo parámetro
   no recibiría nada (ver la bitácora de la 028).
6. **Todo lo que necesita una sucursal la saca de un solo lugar.** `useSucursalDeTrabajo()`
   (`features/atencion/hooks/useSucursalDeTrabajo.ts:16`) devuelve la sucursal asignada para un
   EMPLEADO y `atencion` para un ADMIN. Con eso:
   - el menú y el Inicio pasan `conSucursal = true` a `destinosDelMenu` (`pages/Inicio.tsx:53`),
     y el filtro (`pages/rutas.tsx:235`) deja entrar las rutas marcadas `mostrador: true`;
   - la cabecera dice "Atendiendo en Centro" (`pages/Marco.tsx:35`) y muestra `<DejarDeAtender />`.
7. **Registrar ropa.** La ruta monta la pantalla dentro de `ConSucursalDeTrabajo`
   (`pages/rutas.tsx:58`), que ahora sí la deja pasar
   (`features/atencion/components/ConSucursalDeTrabajo.tsx:15`). `useRegistrarRopa` toma la
   sucursal del hook (`features/ordenes/hooks/useRegistrarRopa.ts:24`) y se la pasa a `registrarRopa`
   como `quien.sucursalId`. Ahí se valida la boleta contra **esa** sucursal
   (`features/ordenes/api/ordenesLocal.ts:110`) y se inserta la orden con ese `sucursal_id` (línea
   155). Lo que sigue (la cola, la API, la auditoría) no cambia: el backend ya aceptaba que el ADMIN
   registrara indicando la sucursal en el cuerpo (SPEC-ALE186-004).
8. **Volver a abrir la app.** El estado `atencion` arranca leyendo `localStorage`
   (`SesionProvider.tsx:49`). Por eso la **primera** conexión ya lleva la sucursal, y Ana sigue
   atendiendo después de un corte de luz.
9. **"Dejar de atender".** Borra lo guardado, pone `atencion = null` y vuelve al Inicio. El mismo
   efecto del paso 4 reconecta sin parámetros, y no se llama a `desconectarYBorrar`. Lo que estaba
   en la cola sigue ahí y sube cuando haya internet.

## Dónde encaja en la arquitectura

- **`lib/powersync/`** sigue siendo lo único que conoce el SDK (§5 y el test de SPEC-KRILINXI-004).
  Solo aprendió a pasar `params`. No sabe qué es "atender": recibe un `{ sucursal_id }` y lo
  reenvía.
- **`features/auth/SesionProvider`** guarda el estado de la atención, aunque la feature se llame
  `atencion`. Es una decisión, no un descuido: el provider es quien abre y conecta la base, y la
  sucursal viaja en la conexión. Si el estado viviera en otro provider, habría que coordinar dos
  efectos de conexión. El provider no decide nada del negocio: guarda y reconecta.
- **`features/atencion/`** pone esto al alcance de las pantallas: el almacén (`api/almacen.ts`, el
  único que toca esa clave), los dos hooks y tres componentes. Las pantallas no leen el contexto
  directo: pasan por los hooks (§5, el hook como puerta).
- **`pages/rutas.tsx`** sigue siendo el registro de rutas. Lo nuevo es la marca `mostrador: true` y
  el portero `ConSucursalDeTrabajo`. El acceso de esas cuatro rutas pasó de `SOLO_EMPLEADO` a
  `TODOS`, porque lo que decide ahora es "¿tiene sucursal de trabajo?" y no el rol. Como siempre,
  esto es comodidad: quien de verdad dice que no es el servidor, y para la ropa son las sync rules.
- **Lo que no le toca a una pantalla:** leer `sesion.usuario.sucursalId`. Si lo hace, el ADMIN que
  atiende queda sin sucursal en esa pantalla, sin ningún error: la pantalla dice "no está lista" y
  nadie sabe por qué. Lo vigila `test/arquitectura.test.ts` (el último bloque).

## Fundamentos

### Un dato que se decide en un solo lugar

"¿En qué sucursal trabajo?" tenía una respuesta trivial (`usuario.sucursalId`) que cuatro hooks
copiaban. Mientras la respuesta fue trivial, copiarla no costaba nada. Con esta spec la respuesta
depende del rol y de una elección guardada. Si cada hook la siguiera calculando por su cuenta, el
día que alguien corrigiera la regla en tres y se olvidara del cuarto, esa pantalla se rompería en
silencio y solo para el ADMIN.

Por eso la regla vive en `useSucursalDeTrabajo` (`features/atencion/hooks/useSucursalDeTrabajo.ts`),
y un test de arquitectura impide escribirla en otro lado. El test recorre **todo** `src/` menos el
propio hook, igual que la regla de la paleta de SPEC-KRILINXI-027: una pantalla nueva queda vigilada
sin tocar el test. Se comprobó que el test muerde: devolver `useRopa` a
`sesion?.usuario.sucursalId` lo hace fallar con el nombre del archivo.

### Reconectar la sincronización con otros parámetros, sin perder la cola

Hay dos caminos y son independientes (§6): lo que **baja** depende de los buckets que el servidor
calcula al conectarse, y lo que **sube** es la cola (`ps_crud`) que la tablet guarda.

- Llamar otra vez a `db.connect(…)` corta la conexión anterior y se queda con las **últimas**
  opciones. Si llegan dos pedidos seguidos, gana el último
  (`node_modules/@powersync/shared-internals/lib/client/ConnectionManager.js`, `connect`). Por eso
  cambiar de sucursal es solo "conectar otra vez", sin desconectar antes.
- Cuando un bucket deja de corresponder (Ana deja de atender), PowerSync borra sus filas de la base
  local. **No toca la cola**: lo que se escribió y no subió sigue en `ps_crud` y sube con
  `uploadData`, que no depende de los buckets. Además, PowerSync no aplica cambios bajados mientras
  haya cosas sin subir, así que la orden recién registrada no desaparece de la pantalla antes de
  llegar al servidor.
- Lo que **sí** perdería la cola es `desconectarYBorrar`, y por eso "Dejar de atender" nunca lo
  llama. El test lo comprueba: una orden sin subir sigue en la cola después de dejar de atender.

### El estado inicial que se lee una sola vez (`useState(() => …)`)

`useState(valor)` evalúa `valor` en **cada** render y lo ignora después del primero.
`useState(() => valor)` llama a la función una sola vez, al montar. Se usa cuando el valor inicial
cuesta algo, como leer `localStorage`.

Acá importa además por el orden. Si `atencion` arrancara en `null` y un efecto la cargara después,
la tablet se conectaría primero **sin** la sucursal (y empezaría a borrar la ropa de Centro) y un
instante después **con** ella. Al leerla en el estado inicial (`SesionProvider.tsx:49`), la primera
conexión ya lleva el parámetro. El test "al volver a abrir la app" comprueba justo eso: ninguna
conexión sin la sucursal.

### Un efecto por cada cosa que cambia

Antes, el mismo efecto abría la base y la conectaba. Ahora la conexión tiene que repetirse cuando
cambia la sucursal, pero abrir la base no. Si los dos siguieran en un solo efecto con `atencion`
entre sus dependencias, cada cambio de sucursal volvería a abrir la base. Por eso hay dos: uno abre
(depende de si hay alguien adentro, `SesionProvider.tsx:116`) y otro conecta (depende de la base
abierta, la sucursal y el token, línea 140). Regla práctica: si una parte del efecto tiene que
repetirse y otra no, son dos efectos.

**Ya explicado antes:**

- **Contexto de React (provider)** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)
- **Hook como puerta a los datos** → SPEC-KRILINXI-005 (`specs/notas/SPEC-KRILINXI-005-clientes-mostrador.md`)
- **Sync rules y buckets**, **cola de subida** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)
- **Parámetros del cliente: eligen pero no autorizan** → SPEC-KRILINXI-028 (`specs/notas/SPEC-KRILINXI-028-sync-admin-atiende.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Una regla que cubre todo por defecto** → SPEC-KRILINXI-027 (`specs/notas/SPEC-KRILINXI-027-estilo-gestion.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)

## Decisiones y por qué

- **Las tareas del mostrador solo aparecen mientras atiende.** La alternativa era mostrárselas
  siempre al ADMIN, con el aviso de "elegí sucursal" adentro. Se descartó porque serían cuatro
  tarjetas que no puede usar, y la regla de §9 es un solo camino claro. Si igual llega a una (un
  enlace guardado), `ConSucursalDeTrabajo` le dice cómo empezar.
- **Para cambiar de sucursal, primero "Dejar de atender".** Mientras atiende no se le ofrece otra
  sucursal. Así siempre está claro dónde está, y no se salta de una sucursal a otra con un toque
  por error.
- **"Dejar de atender" sin confirmación.** No es irreversible y no se pierde nada (ver arriba). La
  confirmación de §9 es para lo que no tiene vuelta atrás.
- **La elección va con el id de quien eligió.** Si otra persona entra en la misma tablet, no
  hereda la sucursal. Salir la borra igual; el id es la segunda línea.
- **`AvisoSoloEmpleado` se borró.** Ya nadie lo usaba: el aviso nuevo dice cómo empezar en vez de
  "ingresá con otro usuario".
- **Fuera del `scope` declarado:** `features/pendientes/hooks/useCorreccion.ts` también leía la
  sucursal de la sesión (para validar la boleta corregida). Pasó a `useSucursalDeTrabajo`. Si no,
  el ADMIN que atiende corregiría una boleta contra "ninguna sucursal". Es una línea, y el test de
  arquitectura la habría marcado igual.

## Los tests

- **Reusados:** `renderEnRuta` y `sesionDePrueba({ rol: 'ADMIN' })` para montar la App;
  `baseLocalDePrueba` + `sembrar` para tener sucursales y órdenes "ya sincronizadas";
  `clienteDePrueba` y `ordenDePrueba` de `test/filasDePrueba.ts` (sembrar órdenes en **otra**
  sucursal es solo pasarles `sucursal_id`); `simularApi(() => 'sin-conexion')` para el mostrador sin
  internet; `sinJerga()`; `archivosFuente` para la regla nueva.
- **Ampliado:** `controlFalso().conectar` ahora acepta el segundo argumento. Un test puede mirar con
  qué parámetros se conectó: `conectar.mock.calls.at(-1)?.[1]`.
- **El truco de este archivo:** con la base de verdad, `conectar` intentaría hablar con un PowerSync
  inexistente. `vi.spyOn(prueba.control, 'conectar').mockResolvedValue()` lo reemplaza por un espía
  que no hace nada. El test ve **con qué** se conectaría la tablet, que es lo que decide qué ropa
  baja, sin red.
- **Para simular "volver a abrir la app"**, `cleanup()` desmonta todo y `renderEnRuta` monta de
  nuevo con el mismo `control` y sin limpiar `localStorage` (eso lo hace el `afterEach` de
  `test/setup.ts`, al terminar el test). Es la misma tablet, montada de cero.
- Se pasaron los tests nuevos 5 veces en modo lento (`LENTO_MS=200`, §4), sin fallos.

## Si mañana tenés que tocar esto

- Empezá por `useSucursalDeTrabajo`: es la respuesta a "¿dónde trabajo?". Si una pantalla nueva
  necesita la sucursal, usá ese hook, nunca la sesión.
- Si cambian las sync rules (el nombre del parámetro `sucursal_id`), cambiá
  `ParametrosSincronizacion` en `lib/powersync/control.ts`. El tipo hace que el compilador te
  muestre dónde se arma.
- La prueba de punta a punta con PowerSync de verdad (que la ropa de Centro llega y se va) no está
  automatizada: los tests ven los parámetros, y la 028 probó las reglas en el motor. A mano: ADMIN
  en la tablet, atender en una sucursal con ropa, ver que aparece en "Ropa en el local"; dejar de
  atender y ver que desaparece.
