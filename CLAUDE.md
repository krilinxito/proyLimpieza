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
mayúsculas ni espacios (desde SPEC-ALE186-020, un índice único de la base), y una sucursal no
se cierra (`activa: false`) mientras tenga ropa en RECIBIDO, EN_PROCESO o LISTO (condición
dentro de la sentencia que escribe). Una sucursal cerrada no recibe personal nuevo.
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
la posterior. El momento del cierre es `sucursales.cerrada_en`. Toda `fecha_entrada` más de 5
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
SPEC-ALE186-019 agregó **migraciones**: `context/lavanderia_schema.sql` es la línea base
congelada, y los cambios de schema son archivos `backend/migraciones/NNN_nombre.sql` que aplica
`npm run migrar --workspace backend`, en orden, sin borrar datos. **Después de cada `git pull`,
corré `npm run migrar`**: si a la base le falta alguna, el backend no arranca y dice qué correr.
Nunca edites la línea base ni una migración ya aplicada: se corrige con una nueva.
SPEC-ALE186-020 usó las primeras cuatro para quitar los parches de cuando no había migraciones:
la marca de revisión es la columna `auditoria.revision`, el momento del cierre es
`sucursales.cerrada_en` (la pone la misma sentencia que cierra, y la borra la que reabre; una
cerrada sin fecha no acepta ropa), el nombre único de sucursal es el índice
`uq_sucursales_nombre` (el model traduce su 23505 a 409) y `auditoria.registro_id` tiene índice.

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
SPEC-KRILINXI-010 renueva la sesión sin pedir la contraseña: cada vez que PowerSync pide
credenciales, `features/auth/renovacion.ts` mira el `exp` del `tokenPowerSync` y, si le quedan
menos de 2 minutos (o no se lee), cambia el par en `/renovar` con el token de la API —una sola
renovación aunque lleguen varios pedidos—. Sin internet lanza y PowerSync reintenta, sin tocar la
sesión; solo un 401 vuelve a pedir el ingreso. El aviso de Salir dice cuántos registros sin
guardar se perderían.

SPEC-KRILINXI-011 hizo de verdad la PWA: con `vite-plugin-pwa` y un service worker propio
(`frontend/src/pwa/sw.ts`), después de una primera visita con conexión la app abre sin
internet en cualquier pantalla. Se precachea todo el build, también los WASM de PowerSync, y
nunca la API ni PowerSync. Una versión nueva se aplica al recargar o volver a abrir, sin
recargar sola, y no toca la sesión ni la base local. El service worker solo existe en
`npm run build`: en `npm run dev` y en los tests no se registra.

SPEC-KRILINXI-013 cerró `/para-corregir`: cada registro rechazado se **corrige** (el formulario
arranca con lo que se había enviado y valida con las reglas de su pantalla de origen) o se
**descarta** con confirmación. Un alta se vuelve a escribir con `INSERT OR REPLACE` y **el mismo
id**, así lo que dependía de ella (el adelanto de una orden) le sigue apuntando; una edición, con
`UPDATE` y solo lo que cambió. La escritura y el borrado de `para_corregir` van juntos en
`ejecutarJuntas` de la base local. La parte pura vive en `features/pendientes/correccion.ts`.
SPEC-KRILINXI-014 agregó "Cambiar datos" en la tarjeta del cliente (nombre y teléfono): se
escribe solo lo que cambió, y si no cambió nada no se escribe, porque un `UPDATE` que deja todo
igual igual encola un PATCH vacío. `validarCliente` (`features/clientes/api/clientesLocal.ts`)
es la única validación del cliente: la usan el alta, la edición y la corrección.
SPEC-KRILINXI-015 hizo `/estadisticas` (solo ADMIN): ingresos, saldos y ropa sin recoger,
pedidos a la API con `lib/api` (`features/estadisticas/api/estadisticasApi.ts`, que comprueba
cada respuesta contra el contrato de SPEC-ALE186-008). Sin internet dice "Las estadísticas
necesitan conexión" y no muestra ningún número; carga sola al volver (evento `online`). Por
defecto, los ingresos son los de **hoy** en Bolivia y saldos y sin recoger, **todo lo
pendiente** (`DESDE_SIEMPRE`), porque esas dos filtran por `fecha_entrada`. Las sucursales del
filtro sí salen de la base local, y un test de arquitectura vigila que nada más de la feature
la toque. Para los tests, `test/estadisticasDePrueba.ts` arma respuestas válidas y
`simularEstadisticas()` las sirve; el servidor falso ahora anota los `parametros` de la query.
SPEC-KRILINXI-016 completó el panel con el volumen por día, lo que hizo cada persona (una fila
por sucursal del registro) y los clientes atendidos, paginados aparte. Sin fechas elegidas, esas
tres miran los **últimos 30 días**. Lo que se pide online pasa por `usePedidoOnline`
(hoy en `src/hooks/`): cargando, sin conexión, error, la recarga con `online` y el
descarte de la respuesta vieja, en un solo lugar.
SPEC-KRILINXI-017 agregó `/personal` y `/sucursales` (solo ADMIN): las listas se leen de la base
local y las altas, ediciones, bajas y cierres van **directo a la API** con `enviar()` de `lib/api`
(hecho, rechazado o sin conexión), nunca por la cola: llevan la contraseña (ver §6). Sin red, los
botones se deshabilitan (`hooks/useEnLinea`); después de guardar, el aviso dice que la lista puede
tardar unos segundos en mostrarlo. El teléfono de una cuenta no baja a la tablet: al editar arranca
vacío. Una sucursal cerrada se puede volver a abrir. `usePedidoOnline` vive en `src/hooks/`.
SPEC-KRILINXI-018 agregó `/quien-hizo-que` (solo ADMIN): la auditoría, pedida online con
`usePedidoOnline`, paginada, con "Solo lo que hay que revisar" a la vista y el resto de los filtros
en "Buscar con más detalle". Cada registro se dice en palabras (`features/auditoria/describir.ts`);
clientes, personal y sucursales se nombran con la base local, pero ropa, cobros y entregas solo por su
tipo: el admin no los tiene en la tablet. Sin fechas, los últimos 30 días. Con eso, todo lo que hace el
backend tiene su pantalla en el frontend.
SPEC-KRILINXI-019 estabilizó la suite del frontend (mitad de los núcleos, modo lento `LENTO_MS`, §4)
y arregló en `PantallaRopa` una búsqueda que una lectura vieja podía pisar. SPEC-KRILINXI-020 agregó la
política de seguridad del contenido al build (§4). SPEC-KRILINXI-021 resolvió en `/para-corregir` el cliente
dado de alta en dos tablets: "Es el mismo cliente" pasa su ropa (y sus cobros) al cliente que ya existe,
en una transacción. `buscarPorTelefono` excluye al propio cliente dentro de la consulta.

SPEC-KRILINXI-022 abrió la ola estética con el **tema**: los colores, la letra de base (18px) y la
fuente (Atkinson Hyperlegible, propia, sin pedir nada afuera) viven en `src/index.css` (`@theme`), y un
test calcula el contraste de cada texto sobre su fondo. `components/` pinta solo con el tema (lo vigila
un test de arquitectura) y suma `Aviso`, `Tarjeta`, `Insignia` e `Icono` (ver `components/README.md`).
Las pantallas pasaron al tema en las specs siguientes de la ola (024 a 027).
SPEC-KRILINXI-023 armó el **marco** de todas las pantallas (`pages/Marco.tsx`, una ruta de diseño
que `App.tsx` pone por encima de las demás): cabecera con el negocio, la sucursal, quién atiende y
Salir; el menú, que en pantalla ancha (desde 1024px) es una barra lateral y en chica un botón
"Menú" que abre un cajón; el aviso de conexión; y un pie con la sucursal y la versión de
`frontend/package.json`. El marco es dueño del único `<main>`: `Pantalla` es solo el `h1` y el
contenido. Los destinos salen de `RUTAS` (`destinosDelMenu`), y cada ruta del menú declara su
`icono` y su `descripcion`. Como el menú nombra las mismas pantallas que el Inicio, **un test que
busca un enlace o un texto de una pantalla lo busca dentro de `getByRole('main')`** o por su rol.
SPEC-KRILINXI-024 pasó al tema la entrada a la app: el Inicio son tarjetas de tareas (las de
`destinosDelMenu`, con su ícono y su `descripcion`; el nombre accesible de cada una es solo el
título), el ingreso es una tarjeta centrada (`PantallaIngreso`) y "Volver al inicio" es un
`EnlaceBoton`. La regla de la paleta cruda (`CON_EL_TEMA` en `test/arquitectura.test.ts`) creció
carpeta por carpeta con la ola; desde SPEC-KRILINXI-027 cubre toda la app.
SPEC-KRILINXI-025 pasó al tema el mostrador (registrar, ropa, cobrar, entregar, clientes): el estado
de cada orden es una `Insignia` con el tono de `TONO_ESTADO` (`features/ordenes/estado.ts`, junto a
`estadoEfectivo`), el detalle agrupa en `Tarjeta` (con `nivel={3}` dentro de una sección que ya tiene
su `h2`) y los mensajes son `Aviso`. Cada dato del detalle sigue siendo un par `<dt>`/`<dd>`.
SPEC-KRILINXI-026 hizo de `/estadisticas` un **tablero**: arriba cuatro indicadores (`Indicadores`), y
cada sección con su gráfico y, debajo, el detalle de siempre. Los gráficos son **SVG del proyecto, sin
librería** (`features/estadisticas/components/graficos/`, lo vigila un test de arquitectura): sin
`viewBox` y con las posiciones en porcentajes como atributos (no son `style`), así se estiran con la
pantalla y el texto queda de su tamaño. Las cuentas viven en `escalas.ts`, puras y con su test. Ningún
dato depende del mouse: cada barra es un botón que, al tocarlo o enfocarlo, escribe su detalle, y cada
gráfico (`Grafico`) tiene nombre y una tabla `sr-only` con los mismos números, que es donde los tests
leen los valores. Los colores son `serie-1`…`serie-4` (uno por forma de pago, validados con todas sus
parejas para daltonismo, ver la bitácora) y `antiguedad-1`…`3` en el tema.
SPEC-KRILINXI-027 cerró la ola con las pantallas de gestión: Personal, Sucursales, ¿Quién hizo qué? y
Registros para corregir. Cada cuenta, sucursal, registro de la auditoría y rechazo es una `Tarjeta`; su
estado, una `Insignia` (qué tono lleva cada estado lo decide la feature, como `TONO_ESTADO`), y el
motivo de cada rechazo, un `Aviso` de error. El aviso de conexión tomó el aspecto de `Aviso` pero sigue
siendo `role="status"`. **Ninguna parte de la app usa la paleta cruda**: la regla cubre `components/`,
`pages/` y `features/`, así que una pantalla nueva nace vigilada.

SPEC-KRILINXI-012 corrige el reloj de la tablet: `lib/reloj` guarda el desfase con la hora
del servidor que traen `login` y `renovar`, y `horaOficial()` es de donde salen
`fecha_entrada`, `fecha_pago` y `fecha_entrega`, también sin internet. Ningún archivo de
`features/` lee el reloj por su cuenta (lo vigila un test de arquitectura).

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

**Frontend** — React + Vite + TypeScript + Tailwind + axios, empaquetado como **PWA**
(`vite-plugin-pwa`, SPEC-KRILINXI-011: manifest para instalarla en la tablet y un service
worker propio en `src/pwa/`), con el SDK web de PowerSync para la base local. Los WASM de
PowerSync pesan hasta 2,5 MB: el tope del precache está en 5 MB por archivo en
`vite.config.ts`, y el test del build (`src/pwa/build.test.ts`) falla si alguno queda afuera.

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

**La suite del frontend usa la mitad de los núcleos** (`maxWorkers: '50%'` en
`frontend/vite.config.ts`, SPEC-KRILINXI-019). Cada test de pantalla abre su propio SQLite y monta la
App; con un proceso por núcleo, la primera lectura de la base local a veces pasaba el segundo de
espera de `findBy…` y fallaba la mitad de las corridas completas sin que nada estuviera mal.
**Para buscar una carrera**, `LENTO_MS=200 npx vitest run` (en `frontend/`), varias veces: demora al
azar cada consulta y cada aviso de la base de prueba, así que un test que afirma con `getBy…` algo que
todavía no llegó falla en alguna corrida, en vez de una vez cada tanto. Si la traza pasa por `waitFor`
es tiempo, no carrera; con valores altos (400) aparecen falsos positivos de ese tipo. Si un test falla de vez en cuando, **guardá la salida completa antes de
reintentar** (`npx vitest run > salida.txt 2>&1`): el mensaje de error es la mitad del diagnóstico.
Para comprobar que la suite está estable, 10 corridas seguidas (desde `frontend/`, unos 6 minutos; con
`LENTO_MS=200` delante, en modo lento): `for i in $(seq 1 10); do npx vitest run > corrida-$i.txt 2>&1 ||
echo "falló la $i"; done`. Que no imprima nada es la señal de que pasaron todas.

**La app compilada trae una política de seguridad del contenido (CSP)** (SPEC-KRILINXI-020,
`frontend/src/pwa/csp.ts`): un `<meta>` que el build pone en `index.html`, y que en `npm run dev` no
existe. Solo permite archivos del propio sitio y conexiones a `VITE_API_URL` y `VITE_POWERSYNC_URL`;
nada en línea ni `eval` (el WASM de PowerSync no lo necesitó). Tres consecuencias para quien programa:
- **Nada de `style={…}`**: el navegador lo ignora en la tablet sin avisar. Para algo variable, una
  clase de una lista escrita entera (`COLOR_METODO` en `graficos/colores.ts`) o un atributo de SVG
  (`width="42%"`, como los gráficos de SPEC-KRILINXI-026). Un test de arquitectura lo vigila.
- **Un servicio externo nuevo** (otra API, un mapa, una fuente de Google) va en `directivas()` de
  `csp.ts`, o el navegador lo bloquea.
- **Antes de un release, la prueba a mano en un navegador** (jsdom no aplica la CSP): `npm run build
  && npx vite preview --port 4173`, abrir `http://localhost:4173` en Chrome con alguien adentro, y en
  las herramientas del navegador (pestaña Consola) no tiene que haber ningún error de "Content
  Security Policy". Después, en la pestaña Red, "Sin conexión", recargar: la app tiene que abrir.

**`test:db` se corre sola, nunca a la vez que otra suite** (SPEC-ALE186-022). Corre sus
archivos en paralelo contra el Postgres de Docker; si al mismo tiempo corren los tests del
frontend, que usan todos los núcleos, la CPU se satura, Vitest tarda más en cargar los
archivos que en correr los tests, y algunos pasan el límite de 15 s ("Test timed out"). No es
un error del código: corrida sola pasa en ~15 s. Si un test falla por tiempo, primero mirá qué
más estaba corriendo en la máquina. En los tests, bcrypt usa costo 4 en vez de 10
(`utils/contrasenas.ts`, solo con `NODE_ENV=test`), así que los logins de prueba no pesan.

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
  features/     ordenes/ clientes/ entregas/ pagos/ auth/ pendientes/ estadisticas/
                usuarios/ sucursales/
                cada una con components/ hooks/ api/ types.ts
  components/   UI compartida: botones, inputs, modales de confirmación, avisos, tarjetas,
                insignias e íconos. Pinta solo con los colores del tema (SPEC-KRILINXI-022).
                marco/: las piezas de la cabecera, el menú y el pie (SPEC-KRILINXI-023).
  lib/          api (el único cliente HTTP), powersync/ (schema local, conector), env,
                money, dominio.
  hooks/        Transversales: useConexion, useSession, useEnLinea, usePedidoOnline.
  pwa/          El service worker y su registro (SPEC-KRILINXI-011).
  pages/        Composición de rutas: el registro (`rutas.tsx`) y el marco (`Marco.tsx`), que
                junta los datos y se los pasa a `components/marco/`.
```

**Los colores salen del tema** (`src/index.css`, `@theme`; SPEC-KRILINXI-022): `bg-marca`,
`text-peligro-texto`, no `bg-sky-700`. Un color nuevo se agrega al tema con su par de contraste en
`test/tema.test.ts`. Un aviso es un `Aviso`, no un `<p>` con colores a mano.

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

**La excepción: lo que escribe el admin va directo a la API** (SPEC-KRILINXI-017). El alta de
una cuenta y el cambio de contraseña llevan la contraseña, y la cola es una tabla del SQLite de la
tablet: pasar por ahí la dejaría guardada en el dispositivo hasta subir. Además el admin trabaja con
conexión (§8) y necesita que el servidor diga que no al momento (un usuario repetido, una sucursal con
ropa adentro). Por eso `/personal` y `/sucursales` leen de la base local pero escriben con `enviar()`
de `lib/api`, y un test de arquitectura vigila que esas dos features nunca escriban en la base local.
Lo que escriben aparece en la lista cuando PowerSync lo baja, unos segundos después.

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
igual de atómico y, cuando se decidió, el proyecto no tenía migraciones —un trigger nuevo
habría obligado a todos a recrear su base con `down -v`. Desde SPEC-ALE186-019 un cambio de
schema es una migración, pero la regla de hacerlo en el model, en la misma sentencia, sigue. La auditoría sigue el mismo camino
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
- **Son dos tokens con dos plazos** (SPEC-ALE186-025). El de la **API** dura esos días
  (`JWT_EXPIRES_IN`): es el que se presenta al volver la conexión para subir la cola y pedir
  tokens nuevos sin contraseña. El de **PowerSync** dura menos de 24 h (`PS_JWT_EXPIRES_IN`,
  12 h por defecto), porque PowerSync 1.25 rechaza los más largos (`PSYNC_S2104`, límite fijo en
  su código). Que venza pronto no afecta el trabajo sin internet, donde no se usa ningún token:
  solo hace falta para bajar datos, y eso ya requiere conexión. Al volver la conexión, si está
  vencido, la app pide un par nuevo a `/renovar` con el de la API.
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
  `usuarios` **sin `password_hash`**, con lista explícita de columnas. Desde SPEC-ALE186-024
  solo se entrega a **cuentas activas**, igual que `sucursal`: su consulta `parameters` es
  `SELECT FROM usuarios WHERE id = request.user_id() AND activo = true`, **sin columnas** a
  propósito (cada columna sería un parámetro del bucket, y PowerSync exige que todas las `data`
  lo usen: "Query must cover all bucket parameters").
- **Después de cambiar `sync-rules.yaml`, reiniciar PowerSync** (`docker compose restart
  powersync`): lee las reglas solo al arrancar. No se pierde nada: arma la versión nueva en una
  ranura de replicación aparte y cambia cuando termina. Antes de reiniciar, el archivo se puede
  validar con el validador que trae el propio contenedor (ver la bitácora de SPEC-ALE186-024).
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
  **Para filtrar por período se usa `enElPeriodo(columna, …)`** (SPEC-ALE186-021), nunca
  `horaDelNegocio(columna)::date BETWEEN …`: la segunda aplica una función a la columna en
  cada fila y Postgres no puede buscar en su índice. `horaDelNegocio` queda para lo que se
  MUESTRA (el `SELECT`, el `GROUP BY` por día), donde no estorba.
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
- **No hay configuración de Prettier**, pero el código sigue un estilo: comillas simples y líneas de
  hasta 120 columnas. Si formateás con Prettier, pasale `--single-quote --print-width 120` y solo a
  los archivos que tocaste: con sus valores por defecto reescribe archivos enteros.
- **Ningún secreto en el repositorio.** Todo por `.env`, con `.env.example` versionado y
  al día.

---

## 11. Comandos

```bash
cp .env.example .env        # solo la primera vez (y generá el secreto JWT)

docker compose up           # Postgres (negocio + storage de PowerSync) + PowerSync
docker compose down         # parar
docker compose down -v      # parar y BORRAR los datos (recarga la línea base al subir)

npm run migrar --workspace backend    # aplica las migraciones pendientes (después de cada pull)

cd backend  && npm run dev  # API en :4000
cd frontend && npm run dev  # Vite en :5173

npm test                    # suite completa desde la raíz (no necesita Docker)
npm run test:db --workspace backend   # tests contra Postgres real (necesita Docker)
```

La **línea base** del schema (`context/lavanderia_schema.sql`) se carga sola en el primer
arranque, cuando el volumen de Postgres está vacío; ese mismo arranque crea la base
`powersync_storage` (`docker/postgres/01-powersync-storage.sql`). Desde SPEC-ALE186-019 ese
archivo **no se vuelve a editar**: todo cambio al schema es una migración en
`backend/migraciones/NNN_nombre.sql` (cómo escribirla: `backend/migraciones/README.md`), y se
aplica con `npm run migrar --workspace backend` sobre la base que ya existe, sin borrar datos.
**Después de cada `git pull`, corré `npm run migrar`**: si falta alguna, el backend no arranca
y dice cuántas. `down -v` sigue sirviendo para empezar de cero, pero borra todo.

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

- **La cola sube con la sesión de quien esté adentro, pasados 3 días.** Desde
  SPEC-ALE186-018, una tablet sube su cola con su propio token hasta 3 días después de que
  venza, así que queda a nombre de quien la hizo. Pasada esa ventana, el servidor responde
  401, y si después entra OTRA persona en la tablet, lo pendiente se sube con su token y el
  backend la anota a ella como quien recibió o cobró. Se aceptó así en SPEC-KRILINXI-007: la
  alternativa era perder el trabajo. Salir confirmando, en cambio, sigue borrando la base
  aunque haya cosas sin subir; desde SPEC-KRILINXI-010 el aviso de salida lo dice, con el
  número de registros que se perderían, pero no lo impide.

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
- **Corregir lo que el servidor rechazó: lo que queda.** Desde SPEC-KRILINXI-013 se corrige y
  se vuelve a guardar desde `/para-corregir`, y desde SPEC-KRILINXI-021 también el cliente dado de
  alta en dos tablets ("Es el mismo cliente": su ropa pasa al que ya existe). Queda un caso: un
  cambio de estado rechazado no se corrige ahí, se rehace desde "Ropa en el local".
- **El reloj de la tablet.** `fecha_entrada`, `fecha_pago` y `fecha_entrega` las pone la
  tablet y son las oficiales. Desde SPEC-KRILINXI-012 salen de `horaOficial()`
  (`frontend/src/lib/reloj.ts`): el reloj de la tablet más el desfase medido con el `ahora` de
  `login` y `renovar` (SPEC-ALE186-015), guardado en el dispositivo y aplicado también sin
  internet. Lo que queda: una tablet que nunca se conectó con el reloj ya mal no tiene con qué
  corregirse hasta su primer login, y un reloj que cambia mucho entre dos conexiones (alguien
  lo mueve a mano) arrastra ese error hasta la próxima renovación. Para eso sigue el rechazo
  del servidor a una `fecha_entrada` más de 5 minutos en el futuro (SPEC-ALE186-014).
- **El límite de intentos del login vive en memoria** (SPEC-ALE186-016). Se hizo antes de
  las migraciones, cuando una tabla nueva exigía `down -v`; desde SPEC-ALE186-019 moverlo a la
  base es posible, pero solo hace falta si hay más de una instancia. El costo: se pierde al reiniciar el servidor (quien
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

- **La auditoría no dice qué boleta** (SPEC-KRILINXI-018). `GET /api/auditoria` trae la tabla y el
  id del registro, y el admin no tiene en su tablet la ropa, los cobros ni las entregas, así que
  `/quien-hizo-que` dice "Registró ropa · Centro" sin el número de boleta. El arreglo es del backend:
  que cada registro traiga un resumen (boleta y cliente), armado en la misma consulta. Va en una spec
  propia (`auditoria-resumen`); el frontend solo tendría que mostrarlo.
### Revisión del backend (2026-10-09)

Una revisión de seguridad, confidencialidad y escalabilidad del backend no encontró
vulnerabilidades graves en el código (SQL siempre parametrizado, bcrypt, rol verificado en el
servidor, sin `password_hash` fuera de la base, errores 500 sin detalles). Lo pendiente, ya
repartido en specs del roadmap del backend:

- **Antes de producción:** `proxy-addr` (dentro de Express) tiene una vulnerabilidad crítica
  que hoy no aplica porque no usamos `trust proxy`, pero sí aplicará detrás de un proxy
  (resuelto en SPEC-ALE186-023, junto con CORS, `helmet`, los tiempos límite del pool y los logs
  sin datos de las filas). El backend se conecta a Postgres como
  superusuario: debería tener un usuario propio sin privilegios y sin `UPDATE`/`DELETE` sobre
  `auditoria`. API y PowerSync comparten el secreto de los tokens (va RS256). No hay HTTPS ni
  respaldos de la base (dependen del hosting).
- **Escalabilidad:** resuelto. El índice que faltaba en `auditoria.registro_id` lo agregó
  SPEC-ALE186-020, SPEC-ALE186-021 hizo que los filtros por "día de Bolivia" busquen en los
  índices de fecha, y SPEC-ALE186-023 le puso tiempos límite al pool.
- **Confidencialidad:** resuelto. El bucket `global` solo baja a cuentas activas
  (SPEC-ALE186-024), y los logs de errores ya no llevan los valores de las filas
  (SPEC-ALE186-023: solo mensaje, código, restricción, tabla y stack).
- **Herramientas de desarrollo:** `npm audit` todavía marca Vitest (`tinypool`, `@vitest/mocker`)
  y `nodemon` (`braces`). No viajan a producción —`npm audit --omit=dev` del backend da 0—, pero
  arreglarlas exige Vitest 5. **El frontend ya lo usa (5.0); falta el backend, que sigue en la 3.2**:
  va en una spec propia del backend.

### Avisos para el frontend

Cambios del backend, hechos o en camino, que el frontend tiene que tener en cuenta. Quien
implemente una spec de las de abajo actualiza su línea cuando la mergee.

- **Después de cada `git pull`, `npm run migrar --workspace backend`** (SPEC-ALE186-019, hecho).
  Si a la base le falta una migración, el backend no arranca.
- **El reloj de la tablet** (SPEC-ALE186-015 en el backend, SPEC-KRILINXI-012 en el frontend,
  hecho): la tablet mide su desfase con el `ahora` de `login` y `renovar` y lo aplica a las
  fechas que registra. Si se cambia el nombre o el formato de `ahora`, hay que avisar al
  frontend: sin él, la tablet se queda con el último desfase que midió y deja de recalibrarse,
  sin decir nada.
- **CORS restringido** (SPEC-ALE186-023, hecho): la API acepta pedidos del navegador solo desde
  los orígenes de `CORS_ORIGENES` en el `.env`. Si no está, vale `http://localhost:5173`, así que
  con el frontend en su puerto de siempre no hay que hacer nada. Si corre en otro puerto o
  dominio, hay que agregarlo ahí (separado por comas), o el navegador bloqueará las llamadas con
  un error de CORS en la consola. En producción la variable es obligatoria.
- **Sync rules del bucket `global`** (SPEC-ALE186-024, hecho): ya no baja clientes, sucursales
  ni usuarios a una cuenta dada de baja. Para las activas no cambia nada. **Después del pull,
  `docker compose restart powersync`**, para que lea las reglas nuevas.
- **Renovar el token de PowerSync** (SPEC-ALE186-025 en el backend, SPEC-KRILINXI-010 en el
  frontend, hecho). `login` y `renovar` devuelven el `tokenPowerSync` con 12 h de vida y el
  `token` de la API con 3 días; la tablet renueva el par sola en `fetchCredentials` cuando al de
  PowerSync le quedan menos de 2 minutos, y pide la contraseña solo si `/renovar` responde 401.
- **Usuario de la base sin privilegios** (spec `usuario-base-app`, pendiente): va a cambiar el
  usuario de `DATABASE_URL` en el `.env`. Habrá que actualizar el `.env` de cada uno.
- **Tokens de PowerSync con RS256** (spec `powersync-rs256`, pendiente): el backend va a firmar
  con una clave privada y PowerSync va a verificar con la pública. Habrá variables nuevas en el
  `.env` y un cambio en `docker/powersync/powersync.yaml`; cada uno tendrá que generar sus
  claves y reiniciar PowerSync.
- **Del frontend, no del backend:** la sesión vive en `localStorage`, así que un XSS en el
  frontend podría robar el token. Desde SPEC-KRILINXI-020 la app compilada trae una
  Content-Security-Policy (ver §4). Lo que queda: va como `<meta>` porque no hay servidor web en el
  repo, y un `<meta>` no admite `frame-ancestors` (que otra página meta la app en un marco) ni
  avisos de violación. **Cuando haya un servidor de producción, la política pasa a una cabecera
  HTTP** con esas dos directivas.
