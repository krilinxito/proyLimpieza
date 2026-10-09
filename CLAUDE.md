# CLAUDE.md — Sistema de gestión de lavandería

Guía de trabajo para este repositorio. Se actualiza a medida que las specs avanzan:
cuando una decisión de este archivo deje de ser cierta, corregila en la misma spec que
la cambió.

---

## 1. Qué es este proyecto

Un negocio de limpieza de ropa con **3 sucursales** que hoy anota todo en papel. El
sistema digitaliza dos momentos: **el ingreso de la ropa** y **su recojo**.

Quienes lo van a usar todos los días son personas mayores, con poca familiaridad con la
tecnología. Eso no es un detalle de UI: es una restricción de diseño que gana casi
siempre que choque con la elegancia técnica. Si una pantalla es más rápida de usar pero
más difícil de entender, pierde.

El otro pilar es que **la app tiene que funcionar sin internet**. Una sucursal sin
conexión no puede dejar de recibir ropa.

---

## 2. Estado actual

Fase inicial, con los dos workspaces en pie.

`backend/` tiene el esqueleto de SPEC-ALE186-001 —arranca, se conecta a Postgres, responde
`GET /api/health`— y la autenticación de SPEC-ALE186-002: `POST /api/auth/login` y
`/api/auth/renovar`, los middlewares de sesión y de rol, y la semilla que crea el primer
admin (`npm run seed --workspace backend`, que exige `SEED_ADMIN_PASSWORD`). SPEC-ALE186-003
añadió el alta y la edición de clientes (`POST` y `PATCH /api/clientes`), que fija el patrón
de escritura del resto: id generado por el dispositivo y reintento idempotente.
SPEC-ALE186-004 añadió las órdenes (`POST` y `PATCH /api/ordenes`): los estados y cómo se
avanza entre ellos viven en `utils/dominio.ts`, y la regla se comprueba dentro del mismo
`UPDATE`. El ADMIN también registra, indicando la sucursal en el cuerpo. `fecha_entrada`
la manda el dispositivo, en ISO 8601 con zona. SPEC-ALE186-005 añadió los cobros (`POST
/api/pagos`, sin edición ni borrado): la sucursal del pago se copia de la orden en el mismo
`INSERT … SELECT`, que también rechaza las órdenes anuladas. SPEC-ALE186-006 añadió las
entregas (`POST /api/entregas`, sin edición ni borrado), que cierran el flujo: la entrega y
el paso de la orden a ENTREGADO van en una sola sentencia. Con eso están todas las
escrituras del negocio y las cuatro métricas del dashboard del admin. SPEC-ALE186-007 añadió la suite
de integración contra Postgres real (`npm run test:db`, sección 4), con la atomicidad y
las carreras de pagos y entregas. SPEC-ALE186-008 añadió las primeras estadísticas
(`/api/estadisticas/ingresos`, `/saldos` y `/sin-recoger`, solo ADMIN; sección 8).
SPEC-ALE186-009 añadió el alta, la edición y la baja de cuentas (`POST` y `PATCH
/api/usuarios`, solo ADMIN): no se borra a nadie, se pone `activo: false`, y la baja corta el
acceso en el siguiente login o renovación. Un admin no puede darse de baja a sí mismo.
SPEC-ALE186-010 añadió la auditoría: cada alta, edición, cobro y entrega deja su fila en
`auditoria` **en la misma sentencia** que la escritura (`models/auditoria.model.ts` arma el
CTE), y el login exitoso deja un LOGIN. Quién la hizo sale siempre de la sesión. Una edición
guarda en `valores_anteriores` solo lo que cambió de verdad, y de la contraseña solo
`contrasena_cambiada: true`. Un reintento o un PATCH que no cambia nada no anota. Toda
escritura nueva tiene que pasar por `conAuditoria`. SPEC-ALE186-011 añadió las sucursales
(`POST` y `PATCH /api/sucursales`, solo ADMIN): el nombre es único sin distinguir
mayúsculas (regla en la aplicación, porque el schema no tiene UNIQUE), y una sucursal no se
cierra (`activa: false`) mientras tenga ropa en RECIBIDO, EN_PROCESO o LISTO. Las dos reglas
van dentro de la sentencia que escribe. Una sucursal cerrada no recibe personal nuevo.
SPEC-ALE186-012 añadió la consulta de la auditoría (`GET /api/auditoria`, solo ADMIN), paginada y
con filtros por fechas, persona, acción, tabla, registro y sucursal. **La sucursal de una acción
sale del registro que tocó** (la orden, el pago, la entrega, o el cliente en su alta), nunca de
la sucursal a la que está asignada hoy la persona: si la mueven, lo que hizo antes sigue en la
anterior. Editar un cliente, el login y lo que el admin hace con usuarios y sucursales no tienen
sucursal. El período (`desde`/`hasta` en días de Bolivia) se lee en `utils/periodo.ts`, que
comparten la auditoría y las estadísticas. SPEC-ALE186-013 completó las métricas de la sección 8
con `/api/estadisticas/volumen` y `/productividad`. SPEC-ALE186-014 hizo que una sucursal dada
de baja (`activa: false`, algo excepcional) no reciba ropa nueva: acepta la que una tablet
cargó sin internet **antes** del cierre y sube después, y rechaza con 409 `SUCURSAL_CERRADA`
la posterior. El momento del cierre sale de la auditoría. Toda `fecha_entrada` más de 5
minutos en el futuro de la hora del servidor se rechaza con 400 `FECHA_FUTURA`.
SPEC-ALE186-015 agregó `ahora` (la hora de Postgres) a las respuestas de `login` y `renovar`,
para que la tablet mida el desfase de su reloj, y `fechaDelHecho` a cada registro de la
auditoría: cuándo pasó de verdad según la tablet, aparte de cuándo llegó al servidor (`fecha`).
SPEC-ALE186-016 limitó el login: después de 5 intentos fallidos seguidos para un mismo nombre de
usuario (exista o no, y también si es una cuenta dada de baja), se bloquea 5 minutos con 429
`DEMASIADOS_INTENTOS` y `Retry-After`. El contador vive en `services/limiteLogin.ts`, en memoria.
SPEC-ALE186-017 agregó `/api/estadisticas/clientes`: las atenciones de cada cliente por sucursal
(órdenes no anuladas, lo que pagó de verdad y su última visita), paginadas. La paginación pasó a
`utils/paginacion.ts`, que comparte con la auditoría.
SPEC-ALE186-018 resolvió la cola de una cuenta dada de baja: las rutas de escritura del
mostrador (`POST`/`PATCH` de clientes y órdenes, `POST` de pagos y entregas) usan
`requireAuthDeLaCola`, que acepta un token vencido hace hasta 3 días y mira en la base si la
cuenta sigue activa. Lo de una cuenta dada de baja se acepta pero queda marcado para el admin
(`revision` en la auditoría, filtrable con `?revisar=true`). Nada más acepta tokens vencidos.

`frontend/` tiene el scaffolding de SPEC-KRILINXI-001: Vite, Tailwind, rutas y su suite de
tests. SPEC-KRILINXI-002 añadió las piezas que reutilizan todas las pantallas: `Boton`,
`CampoTexto` y `ModalConfirmacion` en `components/`, `lib/money` (centavos enteros) y
`lib/dominio` (los ENUM como constantes tipadas, con un test que los compara con el schema).
SPEC-KRILINXI-003 añadió el ingreso: `lib/api` es el único cliente HTTP (pone el token y
traduce los errores a `ErrorApi` / `ErrorSinConexion`), la sesión vive en `localStorage` y se
lee con `useSession`, y las rutas declaran qué roles las abren. Para los tests hay un servidor
falso (`test/apiFalsa.ts`) y `renderEnRuta` monta por defecto con un EMPLEADO adentro.
SPEC-KRILINXI-004 añadió la base local: PowerSync abre un SQLite en el navegador al entrar
(`useBaseLocal()` desde `lib/powersync`, el único que importa el SDK) y lo borra al salir o
ante un 401; el schema local se testea contra las sync rules. Lo escrito queda en la cola:
`uploadData` todavía no sube. Los tests usan la base real sobre SQLite de Node
(`test/baseLocalDePrueba.ts`). SPEC-KRILINXI-005 añadió la primera pantalla del negocio,
`/clientes`: buscar por teléfono y dar de alta, todo en la base local. Fija el patrón de las
demás: el SQL vive en `features/<x>/api/`, un hook lo pone al alcance de la pantalla, y el
teléfono se normaliza con la misma regla que el backend. SPEC-KRILINXI-006 añadió
`/registrar-ropa` (orden y adelanto opcional, solo para EMPLEADO: el ADMIN no tiene
sucursal), el saldo en `features/pagos/saldo.ts` —el único lugar donde se calcula— y
`aDecimal`/`desdeDecimal` en `lib/money`, que es como se guardan los montos en la base local
("25.50"). Cada ruta puede declarar su propio `sinPermiso`. Para los tests: `sembrar()` carga
filas "ya sincronizadas" y `sinJerga()` revisa que no haya palabras del sistema en pantalla.
SPEC-KRILINXI-007 cerró la subida: `uploadData` manda cada cambio de la cola a su `POST` o
`PATCH` por `lib/api`. Lo rechazado (400/403/404/409/422) se copia a la tabla solo local
`para_corregir` y la cola sigue; sin conexión, 5xx o 401 se reintenta. El aviso de conexión
(`components/AvisoConexion`, con `hooks/useConexion`) está en todas las pantallas con sesión
y lleva a `/para-corregir`. Un 401 con cambios sin subir ya no borra la base local.
SPEC-KRILINXI-008 añadió `/ropa` ("Ropa en el local") y `/cobrar`, la misma pantalla: lista,
búsqueda por boleta o teléfono, detalle, avances, anular y cobrar. El **estado que se muestra**
sale de `features/ordenes/estado.ts` (`estadoEfectivo`: si la orden tiene entrega en la base
local, figura ENTREGADO aunque no haya sincronizado), y los avances permitidos repiten la tabla
del backend con un test que la compara. SPEC-KRILINXI-009 añadió `/entregar`: la misma
pantalla con "Entregar la ropa" en el detalle (`accionesExtra`), con o sin boleta, precio final
y pago final. Se puede entregar con saldo pendiente: la confirmación dice cuánto queda
debiendo. **El frontend nunca escribe `ordenes.estado = 'ENTREGADO'`**: lo hace el servidor, y
en la tablet se ve por `estadoEfectivo`. Con eso, el flujo del mostrador está completo
(registrar → avanzar → cobrar → entregar). Las pantallas del mostrador son solo para EMPLEADO.
Falta la renovación del token.

Además existen el modelo de datos (`context/lavanderia_schema.sql`) y el entorno Docker. El
desarrollo avanza spec a spec con el flujo de la sección 12.

---

## 3. Dominio y vocabulario

**El dominio se nombra en español, en la base y en el código.** Una tabla se llama
`ordenes`, no `orders`, y su modelo `OrdenModel`. Traducir el vocabulario del negocio
crea un diccionario mental que nadie mantiene.

| Término | Qué es |
|---|---|
| **Sucursal** | Una de las 3 tiendas. Todo el trabajo diario está delimitado por ella. |
| **Usuario** | Quien opera el sistema. Rol `ADMIN` (global, sin sucursal) o `EMPLEADO` (atado a una sucursal). |
| **Cliente** | Quien deja la ropa. Se identifica por **teléfono**, que es único. |
| **Orden** | El ingreso de ropa. Equivale a la boleta que se le da al cliente. |
| **Entrega** | El retiro de esa ropa. Relación 1 a 1 con la orden. |
| **Pago** | Un cobro contra una orden. Puede haber varios: `ADELANTO` y `PAGO_FINAL`. |
| **Auditoría** | Registro de quién hizo qué. Solo lo ve el admin. |
| **Moneda** | Bolivianos (Bs). Todos los montos —precios, pagos, saldos— están en Bs; no hay otras monedas. |

### Flujo del negocio

```
El cliente llega con ropa
  └─ se lo busca por teléfono; si no existe, se lo da de alta en el momento
  └─ se crea la ORDEN
       · numero_boleta: el empleado lo copia de la boleta física preimpresa
       · descripcion, precio_total, fecha_estimada_salida
       · estado inicial: RECIBIDO
  └─ opcionalmente un PAGO de tipo ADELANTO

La ropa avanza:  RECIBIDO → EN_PROCESO → LISTO → ENTREGADO
                 (o ANULADO en cualquier punto)

El cliente vuelve a recoger, a la misma sucursal donde dejó la ropa
  └─ se registra la ENTREGA
       · CON_BOLETA: trae el papel
       · SIN_BOLETA: no lo trae → nombre y carnet de quien retira son OBLIGATORIOS
       · precio_final puede diferir del precio_total (recargo por almacenamiento, etc.)
  └─ PAGO de tipo PAGO_FINAL

Saldo de una orden = (precio_final o, si aún no hay entrega, precio_total) − suma de pagos
```

### Reglas del negocio que el código debe respetar

- Un `ADMIN` tiene `sucursal_id` NULL; un `EMPLEADO` siempre tiene sucursal.
- El teléfono del cliente es único en todo el sistema.
- `numero_boleta` es único **por sucursal**, no globalmente (ver sección 6).
- Una entrega sin boleta exige nombre **y** carnet de quien retira.
- La ropa se retira en la **misma sucursal** donde se dejó: la entrega lleva siempre la
  sucursal de su orden, y un empleado solo entrega órdenes de la suya.
- Los montos nunca son negativos; un pago siempre es mayor que cero.

---

## 4. Stack

PERN con TypeScript de punta a punta.

**Backend** — Node + Express + `pg` (SQL directo, sin ORM) + JWT + cors, con nodemon
en `npm run dev`.

**Frontend** — React + Vite + TypeScript + Tailwind + axios, empaquetado como **PWA**,
con el SDK web de PowerSync para la base local.

**Datos** — PostgreSQL 16 en Docker (el schema declara compatibilidad desde la 12) y
**PowerSync Service 1.25.0** self-hosted para la sincronización offline. El tag está fijo
en `.env`: `latest` puede cambiar de un día para otro y romper `docker/powersync/`.

PowerSync necesita guardar su propio estado (buckets, checkpoints, reglas activas) y
puede hacerlo en MongoDB o en Postgres. **Usamos Postgres**, en la base separada
`powersync_storage` del mismo servidor. No es la opción más común en los ejemplos
oficiales, pero acá gana por una razón concreta: es un motor menos que instalar,
respaldar, monitorear y aprender. El equipo ya sabe Postgres. Si algún día el volumen de
sincronización lo justifica, cambiar a MongoDB es editar el bloque `storage:` de
`docker/powersync/powersync.yaml` y levantar el contenedor — nada del código de la
aplicación depende de esa elección.

**Tests** — Vitest en los dos lados: `supertest` en el backend, React Testing Library en
el frontend. Un solo runner y un solo `npm test`, que corre sin Docker.

El backend tiene además una **suite de integración contra Postgres real**
(`npm run test:db --workspace backend`, SPEC-ALE186-007), aparte porque necesita Docker. Usa
la base `<nombre>_test` del mismo servidor, que se borra y se recrea desde el schema en cada
corrida: nunca toca la base de desarrollo. Cuándo va un test en cada una:

- **Con dobles (`npm test`)**: todo lo que se decide en TypeScript —qué valida un
  controller, qué responde a cada caso, qué SQL y qué parámetros arma un model—. Es rápido y
  corre en cualquier máquina.
- **Contra la base real (`npm run test:db`)**: lo que solo Postgres puede garantizar —que
  una sentencia sea atómica, que un bloqueo frene una carrera, que una agregación sume bien—.
  Un doble del pool no puede probar nada de eso: solo devuelve lo que el test le dijo.
  Los datos se crean con `tests/helpers/baseReal.ts`.

---

## 5. Arquitectura y estructura de carpetas

### Backend — MVC estricto

```
backend/src/
  models/       Acceso a datos. SQL parametrizado, una función por operación.
  controllers/  Orquestan: validan la entrada, llaman a models, arman la respuesta HTTP.
  routes/       Solo declaran endpoints y su middleware. Sin lógica.
  middleware/   Autenticación JWT, control de roles, manejo centralizado de errores.
  services/     Lógica de negocio que no cabe en un solo model.
  db/           Pool de conexión y migraciones.
  utils/        Helpers compartidos (dinero, validación).
```

Las dos reglas que sostienen la separación:

- **Un controller nunca escribe SQL.** Si necesita datos, pasa por un model.
- **Un model nunca toca `req` ni `res`.** Recibe argumentos y devuelve datos, así se
  puede testear sin levantar un servidor.

Nunca concatenes valores dentro de una consulta. Siempre `$1, $2`.

### Frontend — modular por feature

```
frontend/src/
  features/     ordenes/ clientes/ entregas/ pagos/ auth/ estadisticas/
                cada una con components/ hooks/ api/ types.ts
  components/   UI compartida: botones, inputs, modales de confirmación.
  lib/          powersync/ (schema local, connector), axios, money.
  hooks/        Transversales: useOnline, useSession.
  pages/        Composición de rutas.
```

Regla equivalente en el front: **ningún componente llama a axios ni consulta PowerSync
directamente.** Pasa siempre por `features/<x>/api` o por un hook. Un componente que
hace su propia consulta es un componente imposible de testear y de reutilizar.

---

## 6. Arquitectura offline-first

La parte más delicada del proyecto. Leé esta sección entera antes de tocar nada que
guarde datos.

```
   Postgres ──replicación lógica──▶ PowerSync Service ──sync buckets──▶ SQLite local (PWA)
       ▲                                                                     │
       │                                                                     │
   API Express ◀──────────── cola de subida (uploadData) ───────────────────┘
```

Los datos **bajan** por PowerSync y **suben** por nuestra API. Son dos caminos distintos
y es correcto que lo sean: el backend sigue siendo el único que escribe en Postgres, con
sus validaciones y su auditoría intactas.

### Las reglas

**Lecturas: siempre de SQLite local.** Si el dato está sincronizado, no se pide a la API.
Un `GET` a la API para algo que ya está en el dispositivo rompe el modo offline sin que
nadie lo note hasta que se corta internet.

**Escrituras: primero local, después la cola.** Se escribe en SQLite, PowerSync encola el
cambio y lo manda a la API cuando hay conexión. La UI no espera al servidor: la orden
está creada apenas se guarda local.

**Los ids los genera el cliente.** `crypto.randomUUID()` antes de insertar. Por eso todas
las PKs son `UUID` y no `SERIAL`: una fila creada sin internet necesita identidad propia
desde el primer momento. Nunca escribas código que espere un id del servidor.

**Las vistas no se replican.** PowerSync replica tablas. `vw_saldos` y
`vw_pendientes_recoger` existen solo en Postgres, para el dashboard del admin. El
equivalente offline —el saldo de una orden, las órdenes sin recoger de mi sucursal— se
calcula en el cliente sobre las tablas sincronizadas, **en un único lugar**
(`features/<x>/` o `lib/`), no repetido en cada componente que lo necesite.

**No hay ENUM en SQLite.** Los tipos enumerados de Postgres llegan al dispositivo como
texto. Los valores válidos viven en un módulo de constantes tipadas, y el backend
**vuelve a validarlos** al recibir la escritura. Lo que valida el cliente es cortesía;
lo que valida el servidor es la garantía.

**El dinero no se toca con floats.** En Postgres es `NUMERIC(10,2)`, pero SQLite no tiene
decimal y JavaScript menos. Un helper `money` en `lib/` centraliza parseo, formato y
sumas, trabajando en centavos enteros. Sumar precios con `+` sobre números de punto
flotante es un bug de contabilidad esperando su turno.

**Lo autoritativo del servidor se hace en el servidor, y no siempre con triggers.** Marcar
`ordenes.estado = 'ENTREGADO'` al registrarse una entrega es del servidor, pero se hace en
el model de entregas, en la misma sentencia que inserta la entrega (SPEC-ALE186-006): es
igual de atómico y no exige migraciones, que el proyecto no tiene —un trigger nuevo
obligaría a todos a recrear su base con `down -v`. La auditoría sigue el mismo camino
(SPEC-ALE186-010): un CTE encadena la escritura con su fila de `auditoria`. Toda validación de la que el empleado
necesite respuesta inmediata va en TypeScript: nada del servidor existe en el dispositivo,
y su efecto no se ve hasta que sincroniza.

**`numero_boleta` y sus conflictos.** El número no lo genera el sistema: el empleado lo
copia de una boleta física preimpresa. Cada sucursal maneja su propio talonario, así que
la restricción es `UNIQUE (sucursal_id, numero_boleta)` y no única global. Offline el
dispositivo solo conoce las órdenes de su sucursal, y contra ellas valida. Si aun así el
servidor rechaza la escritura, **el empleado tiene que enterarse**: la orden queda marcada
como pendiente de corrección y se le muestra. Ningún error de sincronización puede quedar
en silencio.

**La sesión sobrevive sin conexión.** Hay dos credenciales: el JWT de nuestra API y el
token que PowerSync verifica. Que a un empleado se le cierre la sesión a mitad del turno
porque se cayó internet no es aceptable.

El mecanismo, ya decidido:

- **El token vive en el dispositivo y es el comprobante.** Se emite en un login online y a
  partir de ahí la app funciona sola: sin conexión no hay servidor al que enseñárselo, así
  que no hay nada que verificar. Offline las lecturas salen de SQLite y las escrituras van
  a la cola; el token solo hace falta para hablar con un servidor.
- **Dura 2 o 3 días.** Es el presupuesto de trabajo sin internet, no una medida de
  seguridad: se ajustará según lo que aguante de verdad cada sucursal.
- **En cada reconexión se verifica el estado contra el servidor** y se renueva el token,
  reiniciando el plazo. Ese es el único momento en que se puede decir que no, así que es
  donde se comprueba que el usuario sigue `activo`.
- **La contraseña solo se pide cuando esa renovación falla.** Pedirla en cada reconexión
  haría la app inusable en un mostrador con wifi flojo, y lo primero que pasaría es que la
  contraseña acabaría anotada en un papel al lado de la caja.

Lo que este diseño **no** puede hacer, y hay que saberlo: un dispositivo que nunca se
vuelve a conectar conserva legibles los datos que ya bajó. No podrá escribir nada nunca
más, pero las órdenes de su sucursal y la tabla de clientes completa siguen ahí. Revocar
es una operación de servidor: sin reconexión no hay forma de alcanzarlo. Cuando el
dispositivo sí reconecta y recibe el rechazo, la app borra la base local.

---

## 7. Reglas de sincronización

Definidas en `docker/powersync/sync-rules.yaml`. No son una optimización: son **control
de acceso**. Lo que no está ahí no llega nunca al dispositivo.

- **Bucket `sucursal`** — las `ordenes`, `entregas` y `pagos` de la sucursal del usuario.
- **Bucket `global`** — `clientes` (el mismo cliente puede dejar ropa en sucursales
  distintas en visitas distintas, y el alta por teléfono tiene que encontrarlo desde
  cualquiera; la ropa de cada orden, eso sí, se retira donde se dejó), más `sucursales` y
  `usuarios` **sin `password_hash`**, con lista explícita de columnas.
- **`auditoria` no se sincroniza a ningún dispositivo.** Se consulta por API, solo admin.
- **El admin no descarga el histórico**, porque su dashboard es online (sección 8).

Una limitación de PowerSync que explica una rareza del schema: las consultas de datos
**no admiten JOINs ni subconsultas**. Por eso `entregas` y `pagos` llevan su propio
`sucursal_id` duplicado, aunque se podría deducir desde `ordenes`. El backend es
responsable de mantenerlo igual al de la orden.

---

## 8. Dashboard del admin

Es **la única excepción** a la regla "todo se lee de SQLite local", y conviene tener
clara la razón: sincronizar años de órdenes y pagos a un navegador solo para graficarlos
es caro y no aporta nada, porque el admin trabaja en la oficina, con conexión.

- Endpoints `GET /api/estadisticas/*`, que agregan en Postgres con `SUM` y `GROUP BY`.
  Todos aceptan `desde`, `hasta` y `sucursal_id` opcional. Hechos: `/ingresos`, `/saldos`
  y `/sin-recoger` (SPEC-ALE186-008, que fija la forma de cada respuesta campo por campo:
  es el contrato de la pantalla), y `/volumen` y `/productividad` (SPEC-ALE186-013). El
  volumen trae todos los días del período, también los que quedan en 0. La productividad va
  por persona **y por la sucursal del registro**: a quien cambió de sucursal le
  corresponde una fila por cada una, la misma regla que la auditoría (SPEC-ALE186-012).
  Además, `/clientes` (SPEC-ALE186-017): cuántas veces se atendió a cada cliente en cada
  sucursal y cuánto pagó. Un cliente no es de ninguna sucursal; cada atención es de la
  sucursal de su orden.
- **Las fechas se miran en la hora de Bolivia** (`ZONA_NEGOCIO = 'America/La_Paz'`, en
  `utils/periodo.ts` desde SPEC-ALE186-012, junto con `leerPeriodo` y `horaDelNegocio`). Las columnas `TIMESTAMP` guardan la hora de la sesión de
  Postgres, que en el servidor es UTC: sin convertir, un cobro de las 21:00 caería en el día
  siguiente. `desde`/`hasta` son días de Bolivia, y "hoy" también (`hoyEnElNegocio()`).
- **Los montos se suman en Postgres y salen como texto** (`"125.50"`), incluidos los totales
  por sucursal y el general. El frontend no suma: muestra.
- Métricas de la primera versión:
  - **Ingresos** por período y sucursal, desglosados por `metodo_pago`.
  - **Saldos pendientes** de cobro, con antigüedad.
  - **Ropa sin recoger**, por antigüedad.
  - **Volumen** de órdenes por día y **productividad** por empleado.
- `vw_saldos` y `vw_pendientes_recoger` ya resuelven dos de las cuatro: se reutilizan, no
  se reescriben las agregaciones a mano.
- **Sin conexión, la pantalla lo dice.** "Las estadísticas necesitan conexión", no un
  gráfico vacío. Un cero falso en un panel de ingresos es peor que una pantalla honesta.
- Acceso solo para `ADMIN`, verificado en el middleware. Esconder el botón en la UI no es
  control de acceso.

---

## 9. Interfaz para quienes no son técnicos

Requisitos concretos, no buenas intenciones:

- **Botones y texto grandes.** Se usa de pie, en un mostrador, muchas veces con prisa.
- **El idioma es el del negocio, no el del sistema.** "Registrar ropa", no "Crear orden".
  "Cobrar", no "Insertar pago". Nada de "sincronizar", "caché" o "token" en pantalla.
- **Confirmación explícita antes de cualquier acción irreversible**, diciendo qué va a
  pasar: "¿Anular la orden 001234? Esta acción no se puede deshacer."
- **El estado de conexión está siempre visible y en palabras**: "Trabajando sin internet —
  3 registros se guardarán cuando vuelva la conexión". Nunca un ícono suelto que haya que
  interpretar.
- **Los errores dicen qué hacer**, en español y sin códigos: "Ese número de boleta ya
  está usado en esta sucursal. Revisá el papel y volvé a escribirlo."
- Pocos campos por pantalla y un solo camino claro para cada tarea.

---

## 10. Convenciones de código

- **Español para el dominio, inglés para lo técnico.** Tablas, columnas, tipos y rutas de
  API en español (`/api/ordenes`, `precio_total`). Funciones y patrones técnicos en inglés
  (`getById`, `useOrdenes`, `OrdenesRepository`).
- `snake_case` en la base, `camelCase` en TypeScript, `PascalCase` en componentes React y
  clases. La conversión entre la base y TS se hace en los models, en un solo lugar.
- **REST por recurso**: `/api/ordenes`, `/api/clientes`, `/api/entregas`, `/api/pagos`,
  `/api/estadisticas`.
- **Formato de error uniforme** en toda la API, con el mismo shape para que el frontend lo
  trate en un solo sitio.
- **Nada de `any`.** Si el tipo no se sabe, `unknown` y se estrecha.
- **Ningún secreto en el repositorio.** Todo por `.env`, con `.env.example` versionado y
  al día.

---

## 11. Comandos

```bash
cp .env.example .env        # solo la primera vez (y generá el secreto JWT)

docker compose up           # Postgres (negocio + storage de PowerSync) + PowerSync
docker compose down         # parar
docker compose down -v      # parar y BORRAR los datos (recarga el schema al subir)

cd backend  && npm run dev  # API en :4000
cd frontend && npm run dev  # Vite en :5173

npm test                    # suite completa desde la raíz (no necesita Docker)
npm run test:db --workspace backend   # tests contra Postgres real (necesita Docker)
```

El schema se carga solo en el primer arranque, cuando el volumen de Postgres está vacío.
Si lo modificás, hace falta `down -v` para volver a cargarlo. Ese mismo arranque crea la
base `powersync_storage` (`docker/postgres/01-powersync-storage.sql`).

---

## 12. Flujo de trabajo (spec-flow)

Nada se implementa sin una spec aprobada.

```
/spec-new <nombre>     crea specs/SPEC-XXX-<nombre>.md en status draft
      ↓
   [ una persona la revisa y pone status: approved a mano ]
      ↓
/spec-code <id>        rama feature/SPEC-XXX-<nombre>, implementación + tests
      ↓
/spec-finish <id>      suite completa, trazabilidad, rebase y PR contra dev
```

- Rama base **`dev`**; `main` es producción. El merge de `dev` a `main` es un proceso de
  release aparte, manual.
- **La aprobación de una spec es humana.** Claude nunca pone `status: approved`.
- **Todo test lleva el id COMPLETO de su spec en el nombre del bloque**, con el prefijo de
  quien la escribió:

  ```ts
  describe('Orden model — SPEC-ALE186-001', () => { ... })
  ```

  Es lo que permite que `grep SPEC-ALE186-001` encuentre la spec desde el test y al revés.
  El prefijo no es decorativo: cada uno numera su propia serie, así que sin él `SPEC-001`
  aparecería en las specs de los dos. Un test sin etiquetar es un test que el flujo pierde.
- Los tests se escriben **mientras** se implementa, no después. Antes de crear un helper
  de test nuevo, buscá si ya hay uno aplicable y reusalo o generalizalo.
- Specs chicas. Si una toca medio repositorio, partila en varias con `depends_on`.

---

## 13. Deuda conocida y pendientes

- **La marca de revisión vive dentro de `valores_anteriores`** (SPEC-ALE186-018). Lo que sube
  una cuenta dada de baja se acepta y queda marcado para el admin, pero sin migraciones no
  hay columna para eso: va como `valores_anteriores.revision`. La consulta de la auditoría
  la separa y la expone como `revision`, así que pasarla a una columna propia no cambia la
  API. Es uno de los parches que resuelve la spec de limpieza prevista para cuando haya
  migraciones, junto con `sucursales.cerrada_en` (hoy sale de la auditoría, SPEC-ALE186-014)
  y un índice UNIQUE para el nombre de sucursal (hoy se comprueba en el código, SPEC-ALE186-011).
- **La cola sube con la sesión de quien esté adentro, pasados 3 días.** Desde
  SPEC-ALE186-018, una tablet sube su cola con su propio token hasta 3 días después de que
  venza, así que queda a nombre de quien la hizo. Pasada esa ventana, el servidor responde
  401, y si después entra OTRA persona en la tablet, lo pendiente se sube con su token y el
  backend la anota a ella como quien recibió o cobró. Se aceptó así en SPEC-KRILINXI-007: la
  alternativa era perder el trabajo. Salir confirmando, en cambio, sigue borrando la base
  aunque haya cosas sin subir: el aviso de salida debería decirlo, o impedirlo.

- **El monorepo tiene DOS versiones de TypeScript, y la raíz fija una a propósito.**
  El frontend usa TypeScript 7 y el backend 5.9. Al instalar, npm hoistea a la raíz una
  sola de las dos, y `ts-api-utils` —que está en la cadena de typescript-eslint— resuelve
  su `typescript` desde ahí. Si en la raíz queda el 7, el ESLint del backend muere con
  `Cannot read properties of undefined (reading 'Intrinsic')`: **ninguna versión de
  typescript-eslint soporta todavía TypeScript 7** (la 8.70 declara `>=4.8.4 <6.1.0`).
  Por eso el `package.json` de la raíz declara `typescript: 5.9.3` — no lo borres pensando
  que sobra: es lo que mantiene vivo `npm run check`. El frontend conserva su 7 anidado y
  compila con él.
  El arreglo de verdad es que el monorepo tenga **una sola** versión de TypeScript. Mientras
  haya dos majors, este tipo de choque va a volver por otro lado.
- **Los puertos por defecto (5432 y 8080) pueden chocar** con otros contenedores en la
  máquina de cada uno. Están parametrizados en `.env` (`POSTGRES_PORT`, `POWERSYNC_PORT`)
  justamente para eso; si algo no levanta, revisá ahí antes de buscar más lejos.
  Ya pasó una vez, y el síntoma no es obvio: si tenés un **Postgres instalado en Windows**,
  ocupa el 5432 y el contenedor no puede publicar el suyo. Docker no falla — el contenedor
  arranca igual y `docker ps` lo muestra `healthy`—, pero `localhost:5432` es el Postgres
  nativo, así que el backend se conecta a la base equivocada y da un 503 sin explicación.
  Se detecta con `docker port lavanderia-postgres`: si no lista nada, es esto. Se arregla
  moviendo `POSTGRES_PORT` (y el puerto de `DATABASE_URL`) a uno libre, p. ej. 5434, y
  recreando con `docker compose up -d --force-recreate postgres`.
- **La autenticación de PowerSync usa un secreto compartido HS256**, pensado para poder
  probar el servicio antes de que exista el backend. En producción va RS256 con un
  `jwks_uri` servido por la API.
- **Corregir lo que el servidor rechazó.** SPEC-KRILINXI-007 lo guarda en `para_corregir`
  (solo local, sin columna nueva en Postgres) y lo muestra en `/para-corregir`, pero
  todavía no se puede editar y volver a enviar: hoy el empleado lee el motivo y avisa. Va en
  una spec propia (`corregir-registros`).
- **El reloj de la tablet (pedido al frontend).** `fecha_entrada`, `fecha_pago` y
  `fecha_entrega` las pone la tablet, y son las oficiales. Si su reloj está mal, quedan mal.
  SPEC-ALE186-014 rechaza en el servidor una `fecha_entrada` más de 5 minutos en el futuro,
  pero la corrección de verdad es del dispositivo: cada vez que tenga conexión, medir el
  desfase contra la hora del servidor y aplicarlo al registrar, también sin internet. El
  backend ya la expone desde SPEC-ALE186-015: `ahora` (ISO en UTC) en las respuestas de
  `login` y `renovar`, sacado de `now()` de Postgres, el mismo reloj que valida la fecha
  futura. Falta el lado de la tablet.
- **El límite de intentos del login vive en memoria** (SPEC-ALE186-016). No hay migraciones
  y una tabla nueva exigiría `down -v`. El costo: se pierde al reiniciar el servidor (quien
  estaba bloqueado queda libre) y no sirve si algún día hay **más de una instancia** del
  backend, porque cada una tendría su propio contador. Si se escala, hay que moverlo a la
  base o a algo compartido. Además, como bloquea por nombre de usuario, alguien de afuera
  puede dejar a un empleado 5 minutos sin entrar escribiendo mal su contraseña a propósito:
  por eso el bloqueo es corto.
- **No hay triggers.** El paso a `ENTREGADO` y la auditoría se resolvieron en código, en la
  misma sentencia que la escritura (sección 6, SPEC-ALE186-006 y -010). El costo: una
  escritura que alguien haga a mano en la base, o por un camino que no pase por
  `conAuditoria`, no queda auditada. La semilla del primer admin no se audita a propósito
  (no hay sesión de quien atribuirla).
