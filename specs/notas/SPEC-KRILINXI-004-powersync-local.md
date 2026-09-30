---
id: SPEC-KRILINXI-004
spec: specs/SPEC-KRILINXI-004-powersync-local.md
explica:
  - cola de subida (crud queue)
  - doble que es el sistema real con otro motor
  - import dinamico
  - offline-first (bajada y subida)
  - sync rules y buckets
---

# SPEC-KRILINXI-004 — Base local sincronizada con PowerSync

## Qué se construyó

La tablet tiene ahora su propia base de datos. Al entrar se abre y empieza a recibir los
clientes y las órdenes de la sucursal. Si no hay internet, responde con lo que ya tenía.
Al salir, se borra.

Todavía ninguna pantalla lee de ella: la primera será la de clientes.

Lo que se escribe en la tablet queda guardado en una cola, pero **no sube**. Subir es trabajo
de la spec `cola-subida`. Hasta entonces, la cola espera sin perder nada.

## Cómo funciona, paso a paso

### Recorrido 1: Elena entra y la base se abre

1. El login guarda la sesión (SPEC-KRILINXI-003), y en `SesionProvider` el valor
   `hayAlguien` (`features/auth/SesionProvider.tsx:69`) pasa a `true`.
2. Eso dispara el efecto que llama a `abrirBaseLocal()` (`SesionProvider.tsx:76`). En la app
   de verdad es la función de `lib/powersync/index.ts:14`, que carga el SDK web con un
   `import()` **dinámico** (`index.ts:15`). Es decir, el SDK recién se descarga en este
   momento, no al abrir la página.
3. `web.ts` crea la base: `new PowerSyncDatabase` con `SCHEMA_LOCAL`, en un archivo
   `lavanderia.sqlite` guardado en el navegador (`lib/powersync/web.ts:19`). Después espera a
   `db.init()` (`web.ts:22`), que abre el archivo. **No espera a ninguna sincronización.**
4. La base se envuelve con `envolver` (`lib/powersync/control.ts`) y vuelve al provider, que
   la publica en `ContextoBaseLocal` con `setBase` (`SesionProvider.tsx:82`). Desde ahí,
   cualquier pantalla la obtiene con `useBaseLocal()`.
5. Recién entonces se llama a `conectar` (`SesionProvider.tsx:85`), **sin `await`**. PowerSync
   le pide credenciales al conector: `fetchCredentials` (`lib/powersync/conector.ts:22`) lee
   el `tokenPowerSync` de la sesión en ese momento y lo devuelve junto con la URL del
   servicio.
6. PowerSync se conecta al servicio (`VITE_POWERSYNC_URL`). Las sync rules deciden qué baja:
   el bucket `global` y el de la sucursal de Elena. Las filas llegan al SQLite local.

Sin internet, el paso 6 simplemente no ocurre: PowerSync reintenta por detrás. Pero los
pasos 1 a 4 ya ocurrieron, así que la pantalla lee lo que había de la última vez.

### Recorrido 2: se escribe algo sin que exista la subida

1. Una feature hace `base.ejecutar('INSERT INTO clientes …')`
   (`control.ts:37`, que por debajo es `db.execute`).
2. PowerSync escribe la fila **y además** anota la operación en su cola interna: `PUT
   clientes {nombre, telefono}`. La escritura es local e instantánea.
3. Cuando está conectado, PowerSync llama a `uploadData` del conector (`conector.ts:30`), que
   **lanza** `SubidaNoDisponible` (`conector.ts:35`).
4. PowerSync lo trata como un error de subida: espera y reintenta más tarde. La cola no se toca.

¿Por qué lanzar y no terminar sin hacer nada? Porque si `uploadData` termina sin marcar la
transacción como subida, PowerSync ve la misma operación en la siguiente vuelta y escribe un
aviso de "posible bug en tu código" (lo vimos en su fuente, en
`AbstractStreamingSyncImplementation.ts`). Lanzar un error con nombre propio dice la verdad:
la subida todavía no existe.

### Recorrido 3: Elena sale

1. Confirma "Sí, salir". `cambiarSesion(null)` borra la sesión y toma la base abierta
   (`SesionProvider.tsx:53`) para llamar a `desconectarYBorrar`.
2. `control.ts:43` es `db.disconnectAndClear()`: corta la sincronización y **borra todo**,
   datos y cola incluidos. Quien entre después en esa tablet no ve lo del anterior.

Lo mismo pasa cuando la API responde 401. El `alRechazarSesion` de SPEC-KRILINXI-003 llama a
este mismo `cambiarSesion(null)`, así que hay un solo camino para irse, venga de donde venga.

## Dónde encaja en la arquitectura

Es el camino de **bajada** del diagrama de CLAUDE.md §6: Postgres → PowerSync Service →
SQLite local. El de **subida** (cola → API) queda preparado, pero cerrado a propósito.

| Pieza | Qué es | Qué NO le toca |
|---|---|---|
| `lib/powersync/schema.ts` | Qué tablas y columnas hay en el dispositivo | Decidir qué baja: eso lo deciden las sync rules; el schema las refleja |
| `lib/powersync/conector.ts` | Lo que PowerSync le pregunta a la app | Guardar el token: lo pide cada vez |
| `lib/powersync/control.ts` | La capa de acceso: `base` + ciclo de vida | Saber si corre en navegador o en Node |
| `lib/powersync/web.ts` | La base del navegador | Cargarse sin que alguien entre (va por `import()`) |
| `SesionProvider` | Cuándo abrir y cuándo borrar | Saber cómo se abre: lo recibe por prop |

**Solo `lib/powersync/` importa `@powersync/*`.** Lo vigila `test/arquitectura.test.ts`.
Si una pantalla importara el SDK directo, cambiar de versión o de driver obligaría a tocarla,
y el doble de los tests dejaría de servir para ella.

**Por qué `abrirBaseLocal` entra como prop:** es la misma inversión de dependencia que
`conectarSesion` (bitácora de SPEC-KRILINXI-003). Con ella, los tests le pasan un doble sin
tocar el provider.

## Fundamentos

### Offline-first: dos caminos, bajada y subida

**Qué es.** Una app offline-first escribe y lee **primero en el dispositivo**, y trata al
servidor como un lugar con el que se sincroniza cuando se puede, no como algo que tiene que
responder antes de seguir. En este proyecto la bajada y la subida van por caminos distintos:
bajan por PowerSync y suben por nuestra API. Así el backend sigue siendo el único que escribe
en Postgres, con sus validaciones (CLAUDE.md §6).

**Qué pasaría sin esto.** Cada pantalla esperaría a la red. Con el wifi flojo de un
mostrador, "Registrar ropa" tardaría o fallaría, y la sucursal volvería al papel.

**En este repo:** `web.ts:22` abre la base sin esperar la sincronización, y
`SesionProvider.tsx:85` conecta sin `await`. Esas dos decisiones son las que hacen que la app
funcione sin internet.

### Sync rules y buckets

**Qué es.** Las sync rules (`docker/powersync/sync-rules.yaml`) le dicen al servicio de
PowerSync **qué filas bajan a qué dispositivo**. Un **bucket** es un paquete de filas que
comparten a quién se entregan. `global` se entrega a todos. `sucursal` se entrega por
sucursal: el parámetro sale de la tabla `usuarios`, buscando al dueño del token.

**Por qué importa.** No son una optimización, son **control de acceso** (CLAUDE.md §7). Lo que
no está en una sync rule no llega nunca al dispositivo, ni siquiera para quien sabe usar las
herramientas del navegador.

**Lo que cambió en esta spec:** el parámetro de `sucursal` ahora exige `activo = true`. Sin
esa condición, un empleado dado de baja seguía recibiendo las órdenes de su sucursal mientras
su token viviera. Esto era deuda de CLAUDE.md §13.

### Cola de subida (CRUD queue)

**Qué es.** Cada `INSERT`, `UPDATE` o `DELETE` sobre la base local se guarda dos veces: en la
tabla, para que se lea al instante, y en una cola interna de PowerSync, como operación
pendiente (`PUT`, `PATCH` o `DELETE`, con la tabla, el id y los datos). La cola se vacía solo
cuando `uploadData` marca las operaciones como subidas.

**Por qué existe.** Es lo que permite escribir sin internet sin perder nada: las operaciones
esperan en orden hasta que se puedan mandar.

**En los tests:** `db.getCrudBatch()` deja mirar la cola. `conector.test.ts` escribe un
cliente, llama a `uploadData` y comprueba que la operación sigue ahí.

### Carga diferida con `import()` dinámico

**Qué es.** `import { x } from './y'` carga el módulo apenas se carga el archivo que lo
importa. `await import('./y')` (`lib/powersync/index.ts:15`) lo carga **recién cuando esa
línea se ejecuta**. Vite lo separa en su propio archivo: el `web-*.js` del build, que ocupa
114 kB y viene acompañado de sus workers y del SQLite en WASM.

**Por qué acá.** Hay dos razones:
- **Los tests:** el SDK web necesita workers y WASM, que jsdom no tiene. Si se importara
  arriba de todo, cualquier test que monte `App` intentaría cargarlo y fallaría.
- **La pantalla de ingreso:** carga más rápido sin cargar el SDK, que no se usa hasta que
  alguien entra.

### Un doble que es el sistema real con otro motor

**Qué es.** `test/baseLocalDePrueba.ts` no imita a PowerSync: **es** PowerSync, con el SDK de
Node (`@powersync/node`) en vez del web. Tiene el mismo schema, pasa por el mismo `envolver`,
ejecuta SQL real y usa la cola real. Lo único distinto es el motor de SQLite: nativo de Node
(better-sqlite3) en vez de WASM.

**Por qué no un doble en memoria.** Las próximas specs van a calcular saldos y "ropa sin
recoger" con SQL. Un doble en memoria no ejecuta SQL: probaría que llamás a `consultar`, no
que la consulta está bien escrita. Con este, un `WHERE` mal escrito falla en el test.

**Su costo:** abrir un SQLite por test. Por eso existe además `test/controlFalso.ts`, un doble
de mentira hecho con `vi.fn()`, para las pantallas que no leen datos. Es el que usa
`renderEnRuta` por defecto.

Ver también, en SPEC-ALE186-003: **a qué altura va el doble de prueba**. Este va lo más abajo
posible, justo encima del driver.

**Ya explicado antes:**

- **Test contra la fuente de verdad** → SPEC-KRILINXI-002
  (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`). `schema.test.ts` lo aplica dos veces: lee
  `sync-rules.yaml` y `lavanderia_schema.sql`.
- **Test de arquitectura** → SPEC-KRILINXI-002.
- **Inversión de dependencia**, **contexto de React**, **leer estado desde fuera de React
  (useRef)** y **prueba de mutación** → SPEC-KRILINXI-003
  (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`).
- **Dinero en centavos enteros** y **punto flotante** → SPEC-ALE186-001. Por eso los montos son
  `text` en el schema local.
- **Ids generados por el cliente** → SPEC-ALE186-003. Por eso en los tests se usa `uuid()` de
  SQLite y nunca se espera un id del servidor.

## Decisiones y por qué

- **Montos como `text`, no `real`.** PowerSync replica `NUMERIC` como texto ("85.50"), así que
  guardarlo como `real` lo convertiría en float. `lib/money` lo lee a centavos.
  `control.test.ts` lo comprueba.
- **`uploadData` lanza en vez de no hacer nada.** Se explica en el recorrido 2.
- **Una sola base por pestaña (`web.ts`).** Se reutiliza después de `disconnectAndClear`. Si la
  apertura falla, no se guarda el fallo: el próximo intento vuelve a probar.
- **Los errores de abrir o conectar van a `console.error`, no a la pantalla.** No es
  silencio: mostrarlos en palabras del mostrador es trabajo de `conexion-y-renovacion`, que
  es la spec del aviso de conexión.
- **`SesionProvider.test.tsx` quedó fuera del scope declarado,** aunque prueba un archivo que
  sí estaba (`SesionProvider.tsx`).
- **Dependencias nuevas:**
  - `@powersync/web` y `@powersync/common`, en producción;
  - `@powersync/node` y `better-sqlite3`, solo para tests.

  better-sqlite3 es un módulo nativo. Se instaló en Windows con su binario precompilado, sin
  compilar nada.

## Los tests

- **Helpers reusados:**
  - `renderEnRuta`, ampliado: ahora pone también la base local, con `controlFalso()` por
    defecto. Ningún test existente cambió.
  - `simularApi`, para probar que `uploadData` no llama a la API y el 401 que borra la base.
  - `sesionDePrueba`.
  - `archivosFuente`, en el test de arquitectura nuevo.
- **Helpers creados:**
  - **`baseLocalDePrueba()`:** la base real sobre SQLite de Node, en una carpeta temporal que
    se borra sola. La spec de clientes lo va a usar así:

    ```ts
    const { control } = await baseLocalDePrueba();
    await control.base.ejecutar('INSERT INTO clientes (id, nombre, telefono) VALUES (uuid(), ?, ?)', ['Rosa', '70123456']);
    renderEnRuta(<App />, '/clientes', { baseLocal: control });
    expect(await screen.findByText('Rosa')).toBeInTheDocument();
    ```

  - **`controlFalso()`:** para comprobar qué se le pidió a la base. Por ejemplo:
    `expect(baseLocal.desconectarYBorrar).toHaveBeenCalledOnce()`.
- **Pruebas de mutación:** al sacar `AND activo = true` de las sync rules falló el test
  correspondiente. El archivo se restauró.
- **El test del schema encontró un bug en sí mismo:** su lector del SQL no reconocía columnas
  de tipo ENUM, porque se escriben en minúscula. Faltaban `estado`, `tipo` y `metodo`. Por
  eso conviene mirar por qué falla un test antes de "arreglar" el código.

## Si mañana tenés que tocar esto

- **Si cambiás una sync rule,** `schema.test.ts` te va a pedir el mismo cambio en
  `lib/powersync/schema.ts`. Hacelos juntos.
- **Si una pantalla necesita datos,** usá `useBaseLocal()` de `lib/powersync` y estrechá cada
  fila con los type guards de `lib/dominio`. Nunca importes `@powersync/*`.
- **Para `cola-subida`:** el único lugar a tocar es `uploadData` en `conector.ts`. Ahí
  `db.getNextCrudTransaction()` da las operaciones pendientes.
- **Cuidado: nada de esto se probó contra un PowerSync real,** porque Docker no estaba
  levantado. Los tests usan el SDK real, pero sin el servicio. Antes del PR conviene probarlo
  a mano con `docker compose up`, entrar y mirar que baje un cliente.
