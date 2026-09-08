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

Fase inicial. `frontend/` todavía no existe. `backend/` tiene el esqueleto que dejó
SPEC-ALE186-001: arranca, se conecta a Postgres, responde `GET /api/health` y tiene suite de
tests — pero ningún endpoint del negocio. Además existen el modelo de datos
(`context/lavanderia_schema.sql`) y el entorno Docker. El desarrollo avanza spec a spec
con el flujo de la sección 12.

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

El cliente vuelve a recoger
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
el frontend. Un solo runner, un solo `npm test`.

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

**Los triggers son para lo que debe ser autoritativo del servidor** — auditoría, o marcar
`ordenes.estado = 'ENTREGADO'` al registrarse una entrega. Toda validación de la que el
empleado necesite respuesta inmediata va en TypeScript: un trigger no existe en el
dispositivo y su efecto no se ve hasta que sincroniza.

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
- **Bucket `global`** — `clientes` (un cliente puede dejar en una sucursal y recoger en
  otra), más `sucursales` y `usuarios` **sin `password_hash`**, con lista explícita de
  columnas.
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
  Todos aceptan `desde`, `hasta` y `sucursal_id` opcional.
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

npm test                    # suite completa desde la raíz
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

- **Las sync rules no comprueban `activo`.** El bucket `sucursal` filtra por
  `request.user_id()` pero no mira `usuarios.activo`, así que dar de baja a un empleado no
  le corta la sincronización mientras su token siga vivo. Falta `AND activo = true` en los
  `parameters` de `docker/powersync/sync-rules.yaml`. Es una línea y es la que hace efectiva
  la baja lógica.
- **Qué hacer con la cola de un usuario revocado.** Al reconectar, un dispositivo dado de
  baja puede traer trabajo real sin subir — ropa que entró de verdad, de clientes que van a
  volver a buscarla. Rechazarlo entero pierde ese trabajo. La decisión tomada es
  **aceptarlo y marcarlo para que el admin lo revise**, nunca descartarlo en silencio. El
  mecanismo se cierra en la spec de PowerSync.

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
- **Marcar una orden como "pendiente de corrección"** cuando el servidor rechaza su
  `numero_boleta` se resuelve en el cliente, sobre la cola de subida de PowerSync, no con
  una columna nueva en la base. El mecanismo concreto se cierra en la spec de PowerSync.
- **No hay triggers todavía.** Auditoría y el paso automático a `ENTREGADO` están
  decididos (sección 6) pero sin implementar.
