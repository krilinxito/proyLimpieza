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

Fase inicial, con los dos workspaces en pie. SPEC-KRILINXI-064 agregó `npm run demo`: la app compilada y repartida en una sola dirección pública para probarla con un túnel de ngrok (§11); el service worker ahora excluye `/api` y no toda la dirección de la API.

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
se cierra (`activa: false`) mientras tenga ropa en RECIBIDO (hasta SPEC-KRILINXI-067, también EN_PROCESO o LISTO; condición
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
SPEC-KRILINXI-028 agregó a las sync rules el bucket `atencion_admin`: el ADMIN que atiende el
mostrador baja la ropa de la sucursal que manda la tablet en el parámetro de cliente `sucursal_id`
(§7). La autorización es la fila del ADMIN activo que pide, nunca el parámetro.
SPEC-KRILINXI-040 añadió la primera lectura de órdenes por API, `GET /api/ordenes` (solo ADMIN): el
historial completo de boletas, paginado, de la más nueva a la más vieja, con el saldo de cada una
calculado en Postgres (`vw_saldos`) y filtros por fechas de entrada, sucursal, estado, texto y
"con saldo". **Sin `desde` no mira los últimos 30 días: trae todo**, así que no usa `leerPeriodo`. La
ruta va antes del `requireAuthDeLaCola`: esa sesión que acepta tokens vencidos es solo para subir lo
que escribió el mostrador (§13).
SPEC-KRILINXI-060 sumó a cada boleta de `GET /api/ordenes` el campo `retiro`: `null` mientras no se entregó, y si se entregó
`{ tipo: 'CON_BOLETA' | 'SIN_BOLETA', nombre: string | null, carnet: string | null }` (nombre y carnet solo vienen con SIN_BOLETA, que el
schema los exige). Sale del `LEFT JOIN entregas` que ya traía `precioFinal`, sin consulta nueva.
SPEC-KRILINXI-043 añadió `GET /api/estadisticas/ingresos-por-dia` (solo ADMIN): lo cobrado día por día, con el
total del día y su desglose por forma de pago, para dibujar una tendencia. Mismo contrato de período y sucursal que
las demás estadísticas (`leerPeriodo`: sin `desde`, los últimos 30 días) y la forma de `/volumen`: **todos los días
del período, también los que quedan en `"0.00"`**. Todo lo suma Postgres, y **la suma de los días da lo mismo que
`/ingresos`** para el mismo período y sucursal (lo comprueba un test contra la base real).
SPEC-KRILINXI-068 agregó **los renglones de la boleta**: la tabla `orden_items` (migración 007: `momento` INGRESO o ENTREGA,
`posicion`, `descripcion`, `cantidad` con dos decimales y `precio_unitario`, con su `sucursal_id` duplicado como pagos) y
`POST /api/orden-items` (sin edición ni borrado, idempotente y auditado). **Los renglones de INGRESO no suman más que
`precio_total`**: el model abre una transacción, bloquea la orden (`FOR UPDATE`) y recién después inserta, porque en una sola
sentencia dos renglones que llegan a la vez no se verían entre sí (409 `TOTAL_EXCEDIDO`). Los de ENTREGA son **cargos al
entregar** y se suman encima: **el precio final de una entrega lo calcula el servidor** (`precio_total` + los cargos, en el mismo
`UPDATE` que la marca ENTREGADO) y, si la tablet manda otro, responde 409 `PRECIO_FINAL_DISTINTO` sin escribir nada. Al entregar
**solo se puede sumar**: un precio final por debajo del total ya no existe (para no cobrar está el reembolso, SPEC-KRILINXI-070).
Un **EMPLEADO ya no cambia `precio_total`** por `PATCH /api/ordenes` (403): eso es del admin. El subtotal es siempre
`round(cantidad * precio_unitario, 2)` (`SUBTOTAL_SQL` en `ordenes.model.ts`, `subtotal` en `utils/money.ts` y en `lib/money`, las
tres con la misma tabla de casos) y no se guarda. `GET /api/ordenes` trae los `renglones` de cada boleta en la misma consulta, y la
auditoría ubica un renglón en la sucursal de su orden. `ESTADOS_ABIERTOS` (las boletas que no están cerradas: su ropa sigue en el local) vive en `utils/dominio.ts`, y la usan entregas, renglones y el cierre de una sucursal.

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
`/clientes`: buscar (por teléfono; desde SPEC-KRILINXI-032, mientras se escribe, por nombre, teléfono o
carnet) y dar de alta, todo en la base local. Fija el patrón de las
demás: el SQL vive en `features/<x>/api/`, un hook lo pone al alcance de la pantalla, y el
teléfono se normaliza con la misma regla que el backend. SPEC-KRILINXI-006 añadió
`/registrar-ropa` (orden y adelanto opcional; desde SPEC-KRILINXI-029 también el ADMIN mientras
atiende en una sucursal; desde SPEC-KRILINXI-034, dentro del Mostrador), el saldo en `features/pagos/saldo.ts` —el único lugar donde se calcula— y
`aDecimal`/`desdeDecimal` en `lib/money`, que es como se guardan los montos en la base local
("25.50"). Cada ruta puede declarar su propio `sinPermiso`. Para los tests: `sembrar()` carga
filas "ya sincronizadas" y `sinJerga()` revisa que no haya palabras del sistema en pantalla.
SPEC-KRILINXI-007 cerró la subida: `uploadData` manda cada cambio de la cola a su `POST` o
`PATCH` por `lib/api`. Lo rechazado (400/403/404/409/422) se copia a la tabla solo local
`para_corregir` y la cola sigue; sin conexión, 5xx o 401 se reintenta. El aviso de conexión
(`components/AvisoConexion`, con `hooks/useConexion`) está en todas las pantallas con sesión
y lleva a `/para-corregir`. Un 401 con cambios sin subir ya no borra la base local.
SPEC-KRILINXI-008 añadió `/ropa` ("Ropa en el local") y `/cobrar`, la misma pantalla: lista,
búsqueda por boleta o teléfono, detalle, avances, anular y cobrar (desde SPEC-KRILINXI-033, todo eso
vive en el Mostrador). El **estado que se muestra**
sale de `features/ordenes/estado.ts` (`estadoEfectivo`: si la orden tiene entrega en la base
local, figura ENTREGADO aunque no haya sincronizado), y los avances permitidos repiten la tabla
del backend con un test que la compara. SPEC-KRILINXI-009 añadió `/entregar`: la misma
pantalla con "Entregar la ropa" en el detalle (`accionesExtra`; hoy `entregas/components/AccionEntregar`), con o sin boleta, precio final
(desde SPEC-KRILINXI-068, cargos que se suman en vez de un precio escrito) y pago final (desde SPEC-KRILINXI-056 ya no se entrega con saldo pendiente). **El frontend nunca escribe `ordenes.estado = 'ENTREGADO'`**: lo hace el servidor, y
en la tablet se ve por `estadoEfectivo`. Con eso, el flujo del mostrador está completo
(registrar → avanzar → cobrar → entregar). Las pantallas del mostrador piden una sucursal de
trabajo: la del EMPLEADO, o la que eligió el ADMIN (SPEC-KRILINXI-029).
SPEC-KRILINXI-046 hizo que el formulario de entrega **no pida ningún monto si la boleta ya está pagada** (`orden.saldo <= 0`):
sin "Precio final", "Cuánto paga ahora" ni "¿Cómo paga?", y en su lugar el aviso "Ya está todo pagado". La entrega se guarda con el
precio de la boleta y sin pago final (`datosAEnviar` en `FormularioEntrega`). Consecuencia aceptada: en una boleta ya pagada no se
puede cargar un recargo al entregar. Con saldo pendiente, el formulario es el de siempre.
SPEC-KRILINXI-048 acortó **Registrar ropa**: el adelanto se pregunta primero ("No deja adelanto" / "Deja adelanto") y su importe y su forma de
pago aparecen solo si deja (al volver a "No deja" se vacían, y no se guarda ningún pago); "Para cuándo estará lista" suma tres atajos
(`atajosDeFecha`, con el día de Bolivia); y "Volver al mostrador sin guardar" pide confirmar si hay algo escrito (`FormularioRopa` avisa con
`alCambiarEscrito`; un cliente que ya venía de su ficha no cuenta). Un campo nuevo del formulario va también en `hayEscrito`.
SPEC-KRILINXI-047 dejó por escrito el **sistema visual** y para quién es el producto: `frontend/PRODUCT.md` (usuarios, propósito,
restricciones) y `frontend/DESIGN.md` (colores, letra, componentes y patrones, con su complemento `frontend/.impeccable/design.json`),
generados con la skill impeccable a partir del código. **No reemplazan a `src/index.css`**: los colores siguen viviendo ahí, y el
DESIGN.md los describe. Un test (`src/test/disenoDocumentado.test.ts`) lo ata al código: falla si el documento nombra un color que el
tema no tiene, o si el tema tiene un color que el documento no nombra. Un color nuevo, entonces, se agrega a `index.css` (los dos
bloques, §4) **y** al DESIGN.md. La carpeta de la skill (`.claude/skills/impeccable`) no se versiona; se instala con `npx impeccable install`.
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
SPEC-KRILINXI-024 pasó al tema la entrada a la app: el Inicio eran tarjetas de tareas (las de
`destinosDelMenu`; desde SPEC-KRILINXI-035 ya no repite el menú), el ingreso es una tarjeta centrada (`PantallaIngreso`) y "Volver al inicio" es un
`EnlaceBoton`. La regla de la paleta cruda (`CON_EL_TEMA` en `test/arquitectura.test.ts`) creció
carpeta por carpeta con la ola; desde SPEC-KRILINXI-027 cubre toda la app.
SPEC-KRILINXI-025 pasó al tema el mostrador (registrar, ropa, cobrar, entregar, clientes): el estado
de cada orden es una `Insignia` con el tono de `TONO_ESTADO` (`features/ordenes/estado.ts`, junto a
`estadoEfectivo`), el detalle agrupa en `Tarjeta` (con `nivel={3}` dentro de una sección que ya tiene
su `h2`) y los mensajes son `Aviso`. Cada dato del detalle sigue siendo un par `<dt>`/`<dd>`.
SPEC-KRILINXI-026 hizo de `/estadisticas` un **tablero**: arriba cuatro indicadores (`Indicadores`), y
cada sección con su gráfico y, debajo, el detalle de siempre. Los gráficos eran **SVG del proyecto, sin
librería** (desde SPEC-KRILINXI-063, solo las columnas y las líneas pasaron a Recharts; las barras siguen siendo así; lo vigila un test de arquitectura): sin
`viewBox` y con las posiciones en porcentajes como atributos (no son `style`), así se estiran con la
pantalla y el texto queda de su tamaño. Las cuentas viven en `escalas.ts`, puras y con su test. Ningún
dato depende del mouse: cada barra es un botón que, al tocarlo o enfocarlo, escribe su detalle, y cada
gráfico (`Grafico`) tiene nombre y una tabla `sr-only` con los mismos números, que es donde los tests
leen los valores. Los colores son `serie-1`…`serie-3` desde SPEC-KRILINXI-055 (antes eran cuatro; uno por forma de pago, validados con todas sus
parejas para daltonismo, ver la bitácora) y `antiguedad-1`…`3` en el tema.
SPEC-KRILINXI-042 hizo de `/estadisticas` un **dashboard**: debajo de los indicadores, una grilla de siete tarjetas
(`SeccionPanel`; desde SPEC-KRILINXI-065 **en una sola columna**, una debajo de otra y siempre del mismo ancho), cada una con
**un gráfico que responde una pregunta** escrita en palabras ("¿Cuánto se cobró en cada sucursal?") y su período
debajo. El detalle en listas (cada boleta, persona o cliente) va plegado en "Ver el detalle" (`Detalle`, un
`<details>`). Sumó el gráfico de forma de pago y el de clientes que más vienen. No hizo falta ningún color nuevo.
**Excepción a §8**: el total por forma de pago lo suma el frontend, en centavos enteros
(`features/estadisticas/totalesPorFormaDePago.ts`), porque `/ingresos` solo lo trae por sucursal; es la única suma
de dinero del frontend, y su test la compara con el total que suma Postgres. Cuando la API lo traiga, se borra.
SPEC-KRILINXI-044 sumó al dashboard la tarjeta "¿Cómo vino la caja día a día?" (`SeccionTendencia`): un **gráfico de
líneas del proyecto** (`graficos/Lineas.tsx`; desde SPEC-KRILINXI-063 se dibuja con Recharts, ver abajo) con lo cobrado cada día, y a elección una línea por forma de pago (tres
como mucho desde SPEC-KRILINXI-055, con los `serie-1…3` y la leyenda de siempre). Pide `GET /api/estadisticas/ingresos-por-dia` (SPEC-KRILINXI-043)
**aparte del panel** (`useIngresosPorDia`, por defecto los últimos 30 días): así el Inicio del admin, que reusa
`usePanel`, no pide de más. Cada día es un botón sobre el dibujo (tocar o enfocar escribe su detalle), los días sin cobros
se dibujan en cero sin cortar la línea, y no se suma nada en el frontend. Para los tests, `ingresosPorDiaDePrueba` e
`ingresosPorDiaDeDias` en `test/estadisticasDePrueba.ts`.
SPEC-KRILINXI-063 hizo el tablero **más vistoso e interactivo**, y con la persona a cargo se decidió **adoptar Recharts** (3.10) para los gráficos del tiempo.
La librería vive **solo en `features/estadisticas/components/graficos/`** (`Columnas` para la ropa recibida por día, `Lineas` para la caja día a día) y un test
de arquitectura lo vigila: ninguna otra pieza la importa, ni se admite otra librería. Las barras horizontales (sucursal, forma de pago, antigüedad, personas y
clientes) siguen siendo SVG propios, porque llevan texto y montos por fila. Lo que pesa: el `index` del build pasó de 482 a 857 kB (de 146 a 254 kB comprimido) y el
precache, de 8,08 a 8,44 MiB, sin archivos nuevos y lejos del tope de 5 MB por archivo. **La política de seguridad no cambió**: Recharts no escribe `style="…"` en el
HTML; mide su contenedor y le pone el tamaño con JavaScript (`element.style`), que la política deja pasar. Se comprobó en el navegador (Edge, la app compilada y su
meta de CSP): cero violaciones. El test de "nada de estilos en línea" ahora deja pasar solo lo que cuelga de `.recharts-responsive-container`. La interacción es la de
Recharts y no depende del mouse: el gráfico se enfoca con Tab, las flechas recorren los días, tocar un día lo elige, y su detalle va a la región `aria-live` de siempre
(`DetalleFlotante`) además de flotar junto al dato; cada gráfico conserva su tabla `sr-only`. El color sale de una clase del tema (`text-ropa`) y el dibujo pinta con
`currentColor`. **Una paleta propia por tarjeta**: `caja`, `ropa`, `personas` y `clientes` (un matiz cada una) y la rampa `deuda-1…3` (rosa) para lo que se debe; las
tarjetas de formas de pago siguen con `serie-1…3`, y la ropa sin recoger, con `antiguedad-1…3`. Van en los dos bloques de `index.css`, con su par de contraste en `tema.test.ts`
y en el DESIGN.md; los matices de tarjetas vecinas se validaron para daltonismo (ver la bitácora). Un gráfico nuevo con Recharts va en `graficos/`, y animar solo si
`animar()` lo dice (no con `prefers-reduced-motion`, ni en los tests).
SPEC-KRILINXI-050 puso orden en el tablero: a la vista, los cuatro indicadores y **tres tarjetas** (la caja día a día, con qué se pagó y lo
que falta cobrar); las otras cinco (por sucursal, ropa recibida, por entregar, productividad y clientes) están bajo **"Ver más estadísticas"**
(`VerMas`, un `<details>` controlado que no monta sus hijos cerrado). La productividad salió de `usePanel` a `useProductividad`: como los clientes, no se
pide hasta que se despliega; lo que alimenta los indicadores se pide siempre. Mientras llegan los datos hay un **esqueleto** (`Esqueleto`,
`EsqueletoDelTablero`) y nunca un número; una tarjeta con su propio pedido que falla lo dice ella (`AvisoDeTarjeta`), pero si falla una de las cuatro
del panel, falla el panel entero.
SPEC-KRILINXI-065 pasó el tablero a **una sola columna** (ninguna regla `lg:grid-cols-2` ni tarjeta que ocupe una fila distinta; un test de arquitectura lo vigila) y le dio a cada tarjeta con gráfico el botón
**"Agrandar"** (nombre accesible "Agrandar: Cobrado por día"; **solo `SeccionPanel` lo escribe**): abre `VistaGrande`, un diálogo (`max-w-4xl`, no toda la pantalla) que **vuelve a dibujar los mismos hijos de la
tarjeta** con `GrandeContext` en `true` (`graficos/grande.ts`, `useGrande()`). No tiene código por gráfico y **no pide nada a la API**: los datos salen de las mismas variables (un test cuenta los pedidos y la
arquitectura impide que `VistaGrande` importe la API). Se cierra con "Cerrar", Escape o tocando fuera, el foco no sale de él mientras está abierto, y al cerrar vuelve al botón "Agrandar". Cada pieza se acomoda en grande:
`Grafico` pasa el detalle a un panel junto al dibujo con el **desglose** del dato elegido (`desglose`, una línea por cosa; sigue habiendo una sola región `aria-live`) y suma **"Ver la tabla"** (la misma tabla del lector de
pantalla, a la vista); `Lineas` y `Columnas` son más altas; `Detalle` (las listas) no se dibuja. En los gráficos por día (la caja y la ropa recibida) hay además un **rango "Desde / Hasta"** dentro de los días ya cargados
(`useRangoDeDias`, `RangoDeDias`: unas fechas al revés se avisan en palabras y no cambian el gráfico, y "Ver todos los días" vuelve al período), y en la caja por forma de pago la **leyenda apaga y prende** cada serie
(botones con `aria-pressed`; una apagada dice "(apagada)" y va tachada). Toda `Seccion…` nueva declara `ampliable` (un test lo exige): en `false` mientras no haya gráfico que mostrar. Acercar un rango o apagar una serie
nunca cambia la tarjeta.
SPEC-KRILINXI-067 simplificó los **estados de la boleta**: `estado_orden` pasó a RECIBIDO, ENTREGADO, REEMBOLSADO y ANULADO (migración
`006_estados_simplificados.sql`: pasa a RECIBIDO la ropa en EN_PROCESO o LISTO, recrea el tipo y las vistas `vw_saldos` y `vw_pendientes_recoger`, que
Postgres obliga a soltar mientras cambia el tipo de la columna). Desde RECIBIDO solo se pide ANULADO por PATCH (EN_PROCESO y LISTO responden 400; POST sigue
ignorando `estado`: toda orden nace RECIBIDO); ENTREGADO y REEMBOLSADO los pone la entrega. REEMBOLSADO está declarado y pintado en rojo (`TONO_ESTADO`),
pero nada lo escribe todavía: lo hará la spec `reembolso-entrega`. El Mostrador ya no ofrece "Empezar a lavar" ni "Marcar como lista" (se borraron `AVANCES` y
`avancesDesde`): la acción principal de una boleta abierta es siempre entregar. El Inicio y el tablero hablan de "Ropa por entregar" (`porEntregar` en
`hoyEnLaSucursal`, que ahora incluye toda la ropa en el local; la atrasada sigue siendo un subconjunto; los totales de las estadísticas no cambian). Una tablet
sin sincronizar que tenga boletas guardadas como EN_PROCESO o LISTO las lee como RECIBIDO (`estadoDeLaBase`, en `features/ordenes/estado.ts`), y la auditoría vieja
las sigue diciendo en palabras (`describir.ts`). **Después del pull, `npm run migrar --workspace backend`.**
SPEC-KRILINXI-027 cerró la ola con las pantallas de gestión: Personal, Sucursales, ¿Quién hizo qué? y
Registros para corregir. Cada cuenta, sucursal, registro de la auditoría y rechazo es una `Tarjeta`; su
estado, una `Insignia` (qué tono lleva cada estado lo decide la feature, como `TONO_ESTADO`), y el
motivo de cada rechazo, un `Aviso` de error. El aviso de conexión tomó el aspecto de `Aviso` pero sigue
siendo `role="status"`. **Ninguna parte de la app usa la paleta cruda**: la regla cubre `components/`,
`pages/` y `features/`, así que una pantalla nueva nace vigilada.

SPEC-KRILINXI-029 hizo la parte de la tablet de la 028: el ADMIN elige en el Inicio "Atender en una
sucursal" y la tablet reconecta PowerSync con `params: { sucursal_id }` (`conectar` de `lib/powersync`).
La elección se guarda en el dispositivo hasta "Dejar de atender" (en la cabecera) o Salir. La
**sucursal de trabajo** sale de un solo lugar, `useSucursalDeTrabajo()` (`features/atencion/hooks/`): la
asignada para un EMPLEADO, la elegida para un ADMIN. **Ninguna pantalla lee `usuario.sucursalId` de la
sesión** (lo vigila un test de arquitectura). Las rutas del mostrador llevan `mostrador: true`: el menú
las lista solo con sucursal de trabajo, y `ConSucursalDeTrabajo` dice cómo empezar si no la hay. Dejar
de atender reconecta sin el parámetro y no borra nada: la cola sigue subiendo.

SPEC-KRILINXI-030 agregó el **tema oscuro**: `lib/tema.ts` marca `<html data-tema="claro|oscuro">` (lo
elegido con el botón de la cabecera —un ícono de luna o sol, la única excepción a "un ícono nunca va solo":
lleva `aria-label` y `title`—, guardado en la tablet, o la preferencia del sistema, seguida en vivo) e
`index.css` redefine **todos** los tokens bajo `[data-tema='oscuro']`. Ningún componente cambió: funcionan
porque pintan con los tokens. **Un color nuevo va en los dos bloques**, y `test/tema.test.ts` mide cada par
en los dos temas. En oscuro, `marca` y `peligro` son claros y `sobre-marca` es oscuro. En la misma spec, quien
atiende pasó a ser un círculo con su inicial (`components/marco/Avatar.tsx`, "Perfil" al pasar el mouse);
todavía no abre nada: el perfil es una spec pendiente.

SPEC-KRILINXI-031 pasó el estado de la conexión a una **píldora en la cabecera**
(`components/marco/PildoraConexion.tsx`): corta, en palabras, y con el detalle al tocarla. El aviso grande
(`AvisoConexion`) solo aparece si hay registros para corregir. Los textos de los dos salen de
`components/textoConexion.ts`, para que nunca digan cosas distintas.

SPEC-KRILINXI-032 agregó la **búsqueda mientras se escribe**: `components/BuscadorVivo.tsx` (genérico, patrón
combobox de ARIA, hasta 6 resultados y una acción fija como "Cliente nuevo") y, en la base local,
`buscarClientes` y `buscarRopaVivo`. **Qué es coincidir con un cliente** se decide en un solo lugar,
`features/clientes/api/busqueda.ts` (cada palabra en el nombre, parte del teléfono o el carnet), y lo usa
también la ropa. Sin tildes ni mayúsculas con `lib/texto.ts`: `plegar` (JS) y `plegarSql` (SQL) tienen que
dar lo mismo, y su test lo comprueba contra SQLite. /clientes ya lo usa. Para los tests, `test/buscador.ts`
(`elegirEnBuscador('rosa', /Rosa Quispe/)`).

SPEC-KRILINXI-033 juntó Ropa en el local, Cobrar y Entregar ropa en el **Mostrador** (`/mostrador`,
`features/mostrador/`): un solo buscador (clientes y boletas, `buscarEnMostrador`) y, al elegir, la **ficha del
cliente** con su ropa de esta sucursal; cada boleta se abre ahí con lo que su estado permite (es el mismo
`DetalleOrden`, con `AccionEntregar`). Sin buscar nada, muestra la ropa en el local. `/ropa`, `/cobrar` y
`/entregar` ya no son pantallas: llevan al Mostrador (`haciaElMostrador` en `pages/rutas.tsx`), así no se rompe
un enlace guardado. SPEC-KRILINXI-034 sumó al Mostrador el botón **Registrar ropa** (`/registrar-ropa` lleva a
`/mostrador?registrar`): el cliente se elige dentro del formulario de la ropa (`ElegirClienteDeLaRopa`), o se da
de alta ahí mismo, y **el alta, la orden y el adelanto se guardan en una sola transacción** (`ejecutarJuntas`,
con `sentenciaAltaCliente` y `sentenciaPago`): todo o nada, y la cola sube el cliente antes que su orden. Desde
la ficha de un cliente, viene elegido; al guardar, del resumen se va a su ficha con la boleta nueva.

SPEC-KRILINXI-035 cambió el **Inicio**: ya no repite el menú, dice qué hay que hacer hoy. Quien atiende ve "Hoy en
la sucursal" (`features/mostrador/components/HoyEnLaSucursal`, de la base local con `hoyEnLaSucursal`): la ropa
por entregar (desde SPEC-KRILINXI-067; antes "lista para recoger"), la atrasada (fecha estimada vencida), lo cobrado hoy por forma de pago y lo que hay para
corregir; cada boleta lleva al Mostrador (`enlaceABoleta`: `/mostrador?cliente=…&boleta=…`). El ADMIN que no
atiende ve "Atender en una sucursal" y los cuatro indicadores del tablero (`ResumenDelInicio`, online). **El día
del negocio vive en `lib/diaDelNegocio.ts`** (`hoyEnBolivia`, `diaEnBolivia`), e `instanteGuardado` lee las fechas
guardadas: las que bajan del servidor vienen **sin zona** (`2026-10-18 22:00:00`, en UTC) y `new Date()` las
leería como hora local. Los tests corren con `TZ=America/La_Paz` (`vite.config.ts`), la zona de las tablets.

SPEC-KRILINXI-037 fijó la **jerarquía visual** en `components/` (tabla en `components/README.md`): `Boton` tiene
`primario` (lleno), `secundario` (con borde), `peligro` (rojo y siempre con ícono) y `navegacion` (sin caja,
subrayado, para volver o cambiar de vista), y `tamano="compacto"` para una fila de acciones; los estilos viven en
`components/estilosBoton.ts`, compartidos con `EnlaceBoton`. `Tarjeta` informa (por defecto) o `destaca` un número,
y lo que se toca entero usa `ESTILO_TARJETA.toca` con `SenalTocable` (la flecha). **Una sola acción principal a la
vista por pantalla**: en el detalle de una boleta es el próximo avance o, si no queda, entregar. Ya lo usan el
Mostrador y el Inicio; las demás pantallas, en sus specs. Para los tests, `test/jerarquia.ts`
(`accionesPrincipales()`, `usoDe(boton)`). Las clases de Tailwind se escriben enteras, nunca armadas con `replace`:
el escáner no ve las que no están escritas.
SPEC-KRILINXI-038 puso las acciones de una boleta en una **fila de botones compactos con su ícono** (el grupo "Qué
hacer con esta ropa" en `DetalleOrden`): dos columnas en angosto, de corrido desde `sm`, Anular aparte al final y volver
fuera de la fila. Cada avance tiene su ícono en `ICONO_AVANCE`: un avance nuevo no compila sin el suyo.
SPEC-KRILINXI-049 reordenó el detalle de la boleta: la fila "Qué hacer con esta ropa" (y el formulario de cobro, que ocupa su
lugar) va **justo debajo de las Cuentas**, antes de la lista de pagos, y tiene como mucho cuatro botones: **Anular salió de la fila**
y queda solo, al final de la boleta, con su confirmación de siempre.
SPEC-KRILINXI-039 pasó Personal y Sucursales a una **grilla de tarjetas** (una por fila, dos desde 1024px), con las
acciones adentro, compactas y con ícono. Cada cuenta lleva su inicial (`Avatar decorativo`, que no se anuncia porque el
nombre ya es el título) y cada sucursal, cuántas personas trabajan ahí: `personasPorSucursal` cuenta en la base local
las cuentas activas, y `usePersonasPorSucursal` da `null` mientras lee, así nunca dice un cero falso.
SPEC-KRILINXI-051 le dio a una cuenta dada de baja el botón **"Volver a dar de alta"** (`PATCH /api/usuarios/:id` con `activo: true`, directo a
la API con `enviar()`, con su confirmación). Las tarjetas de Personal ya no marcan "Activa": la insignia es solo para la excepción, "Dada de
baja", y usuario, rol y sucursal van como pares `<dt>`/`<dd>`. En la misma spec, la etiqueta "Qué ropa deja" pasó a **"Qué deja"** (formulario de
Registrar ropa y `pendientes/correccion.ts`, que tienen que decir lo mismo).
SPEC-KRILINXI-052 le dio carácter propio a la app: la marca pasó del azul genérico a un **turquesa de agua limpia** (`marca`, `marca-fuerte`,
`marca-suave` en los dos temas de `index.css`, con sus pares en `tema.test.ts`), y la tarjeta `destaca` ya no lleva franja a la izquierda, sino el
borde de la marca completo. El `theme-color` de `index.html` y de `vite.config.ts` es un valor suelto que hay que mantener igual a `--color-marca`. Los
avisos de información siguen azules, y las series de los gráficos no cambiaron.
SPEC-KRILINXI-053 pasó **todos los textos de la app al tuteo neutro** ("Elige", "Escribe", "Prueba", "Revisa"), tanto en la pantalla como en los mensajes de
error de la API, que la pantalla muestra tal cual. Se acabó el voseo: `backend/tests/unit/textosEnTuteo.test.ts` recorre el código fuente de los dos lados y
falla si encuentra una forma de su lista. Una forma nueva que se cuele se agrega a esa lista.
SPEC-KRILINXI-054 pulió tres piezas compartidas: el ingreso tiene un botón **"Mostrar contraseña"** (solo cambia el `type` del campo; nunca se guarda), la `Paginas` de
todas las listas es **un solo bloque chico** (botones compactos y letra de renglón), y la **cabecera del marco se acomoda en pantalla chica** (<640px) en dos
filas, con `order` y un corte de renglón que solo existe en angosto, sin cambiar el orden del DOM (**la cabecera ya no se parte en dos filas: ver SPEC-KRILINXI-066**). Un test de arquitectura vigila que nadie arme su propia barra de páginas.
SPEC-KRILINXI-066 hizo **compactas la cabecera y la paginación en el celular** (<640px; desde `sm` no cambia nada). La cabecera es de **un solo renglón bajo**: el menú, dónde se trabaja ("Administración", "Sucursal Centro"; el nombre "Lavandería" se esconde en el celular porque juntos se pisaban, y
sin sesión se ve siempre), la conexión (un punto de color más su texto corto, sin ícono) y el círculo de quien atiende. Ese círculo es ahí un botón ("Opciones de Rosa Quispe") que
abre un panel con **el tema, "Dejar de atender" y Salir** (`components/marco/MenuPerfil.tsx`; la tercera excepción a "un ícono nunca va solo", con su `aria-label`): se cierra con Escape, tocando
fuera o al cambiar de pantalla, devuelve el foco al círculo y **no se cierra al tocar Salir**, porque su confirmación vive dentro del panel. **Cada pieza existe una sola vez en el DOM**: lo que
cambia entre celular y pantalla ancha es qué clase la esconde (`hidden` / `sm:contents`), así no se repite para el lector de pantalla y los tests (jsdom no aplica el CSS) la ven siempre; `BarraSesion`
ya no dibuja el círculo, lo compone `Marco`. Sin sesión el tema sigue suelto en la cabecera. La `Paginas` muestra en el celular **una flecha por botón** (el nombre "Anteriores"/"Siguientes" sigue
para el lector de pantalla) y el contador "Página N de M" siempre; los botones miden 48px aunque se vean chicos.
SPEC-KRILINXI-055 **quitó la transferencia como forma de pago**: `metodo_pago` tiene tres valores (EFECTIVO, QR y TARJETA), por la migración
`005_quitar_transferencia.sql` (recrea el tipo; los cobros que ya eran transferencia pasaron a EFECTIVO con el mismo monto). La API rechaza con 400 una
transferencia nueva. Las series de los gráficos son tres. Como la línea base de `context/lavanderia_schema.sql` no se edita y sigue diciendo cuatro, los
tests de dominio (`dominio.test.ts`, de los dos lados) leen la línea base **más** las migraciones: un `CREATE TYPE` posterior pisa al anterior.
**Después del pull, `npm run migrar --workspace backend`.**
SPEC-KRILINXI-056 hizo que **la ropa solo se entregue con la boleta pagada por completo**: `POST /api/entregas` responde 409 `SALDO_PENDIENTE` (con la boleta y lo que falta) si lo
cobrado no cubre el precio final, y lo comprueba **dentro del mismo `UPDATE`** que marca ENTREGADO (`models/entregas.model.ts`), así que un rechazo no escribe nada. Como el pago final
y la entrega suben como dos pedidos, la tablet los escribe en una sola transacción con **el pago primero** (`registrarEntrega`): la cola los sube en ese orden y el servidor cuenta
el pago al recibir la entrega. En la pantalla, `Entregar` se apaga hasta que lo que se paga ahora cubre lo que falta, y el resumen ya no tiene "Queda debiendo". Un recargo al entregar
se cobra en el mismo acto. Riesgo conocido: una entrega sin internet cuyo pago el servidor rechaza (o una escrita por una versión anterior, entrega antes que pago) vuelve como 409 y
va a **Para corregir**.
SPEC-KRILINXI-057 ordenó **Registrar ropa en dos pasos dentro del mismo `FormularioRopa`**: sin cliente elegido solo se ve el buscador (sin los datos de la boleta ni "Guardar"); con uno elegido, o dado de alta ahí
mismo, la boleta, con un único "Guardar" al final. El botón de la tarjeta de cliente nuevo dice **"Atrás"**, y volver a elegir cliente no pierde lo escrito de la boleta (su estado vive en el formulario, no en los
pasos). Dentro del detalle de una boleta del Mostrador hay un botón secundario **"Nueva boleta de este cliente"** (fuera de la fila de acciones, que sigue en cuatro como mucho) que abre Registrar ropa con ese cliente ya elegido.
SPEC-KRILINXI-058 hizo que **el visto sea de verdad**: cada campo de Registrar ropa muestra un visto cuando está bien (`CampoTexto correcto`), y cada tarjeta, una marca en la esquina (`Tarjeta estado`: visto si todo está bien, equis si
algún campo ya mostró un error, nada si está vacía o a medio llenar). Sale de `revisarRopa` (`useRevisionEnVivo`), que por dentro es **la misma validación del guardado**, y un error recién se muestra al salir del campo o al intentar guardar. Para eso se
endurecieron las reglas de contenido, **en el formulario y en el servidor** (`lib/formatos.ts` y `backend/src/utils/formatos.ts`, probados con la misma tabla `context/formatos.casos.json`): el **número de boleta** lleva letras, números y guion, con al menos un
número; el **teléfono**, solo números (con espacios o guiones al escribir), 7 u 8; el **carnet** (opcional), el número con su extensión si la tiene (`1234567 LP`); y el nombre y el carnet no pasan de lo que entra en la base (150 y 30). Un cliente de antes con
un teléfono de otro formato puede cambiar su nombre sin tocar el teléfono. "Qué deja" admite **varias líneas** (`CampoTextoLargo`) y los saltos se respetan donde se muestra (desde SPEC-KRILINXI-068, en Registrar ropa son renglones; el campo largo queda en Para corregir). Una tablet con una versión vieja que suba un formato que ahora no vale ve ese registro en "Para corregir".
El **anillo de foco** (`foco`) pasó de naranja a **índigo** en los dos temas: el naranja se leía como un error en el campo donde estaba el cursor; un test vigila que su matiz no caiga en la zona del rojo/naranja.
SPEC-KRILINXI-059 mejoró la **PWA instalable**: el Inicio ofrece instalarla (`AvisoInstalar`): un botón "Instalar en este celular" donde el navegador lo permite (Chrome y Edge), y los dos pasos de Safari en iPhone, donde no existe el botón. Solo aparece si hay algo que ofrecer. El
navegador avisa una sola vez y temprano (`beforeinstallprompt`), antes de que monte React, así que lo escucha `pwa/instalacion.ts` desde `main.tsx` y guarda el evento hasta que alguien toque el botón. El manifest ahora tiene `id` y los dos colores en el turquesa de la marca
(`theme_color` y `background_color`, que un test ata a `--color-marca`). **Los íconos son del color de la marca y se generan con un comando**, `node frontend/scripts/generar-iconos.mjs` (sin librerías; el color sale de `index.css`): al cambiar la marca, se corren de nuevo. La CSP no cambió.
Con **una boleta abierta** el Mostrador deja de mostrar "Registrar ropa" y el buscador (las boletas no son rutas aparte: cargan en la misma pantalla, pero ahí ya no se está "en el mostrador"); vuelven al volver a la ficha. Volver a tocar "Mostrador" en el menú **vuelve al principio del mostrador** (`MenuPrincipal` deja una marca en el estado de la dirección y la pantalla la lee con `useReinicioDeRuta`; con algo escrito en Registrar ropa, pregunta antes). Volver al mostrador
es una **flechita arriba a la izquierda** (`components/BotonAtras`, la segunda excepción a "un ícono nunca va solo"), no un botón al final de la página. Desde 1200px sale al hueco izquierdo del contenido, junto al título; en angosta queda arriba, en su renglón. No se
creó ruta nueva por boleta: siguen `/registrar-ropa` y `/mostrador?registrar`.
SPEC-KRILINXI-041 agregó el **Historial de boletas** (`/boletas`, `features/historial/`), en el menú para todos, y **cada uno
ve lo que le corresponde** (`useModoDelHistorial`, que sale de `useSucursalDeTrabajo`): quien atiende, su sucursal de
trabajo de los **últimos 30 días**, de la base local y también sin internet (`listarHistorialLocal`, que reusa
`SELECT_ORDENES` y `armar` de `ropaLocal`: el estado que se ve, el saldo y el buscador son los de siempre); el ADMIN que no
atiende, el **historial completo** de todas las sucursales, pedido a `GET /api/ordenes` (SPEC-KRILINXI-040) con
`usePedidoOnline`, paginado, y sin internet dice "El historial completo necesita conexión". Los dos arman la misma
`BoletaListada`. Tocar una boleta de la sucursal de trabajo la abre en el Mostrador (`enlaceABoleta`); la del admin se abre de
solo lectura, sin acciones (no tiene la ropa en su tablet). Si se eligen fechas, valen esas aun si pasan de los 30 días. El
texto del buscador solo filtra cuando alcanza (`alcanzaParaBuscar`, SPEC-KRILINXI-032), y en la API espera una pausa antes de
pedirse. Para los tests, `test/historialDePrueba.ts` arma respuestas válidas de `GET /api/ordenes`.
En la misma spec, **ninguna lista larga se muestra de golpe** (§9): `usePaginado` parte las que ya están en memoria
(la ropa en el local y la de un cliente, lo de "Hoy en la sucursal", Personal, Sucursales, los registros para
corregir, saldos, ropa sin recoger y productividad) y `useTamanoDePagina` fija el `por_pagina` de las que pagina la
API (historial, auditoría y clientes de las estadísticas). El tamaño depende del ancho del dispositivo
(`lib/tamanoDePagina.ts`), y si la tablet se gira la lista se ajusta y vuelve a la primera página. Para los tests,
`test/pantalla.ts` (`conAnchoDePantalla(500)`) pone una pantalla angosta.

SPEC-KRILINXI-060 muestra **quién retiró la ropa** en el detalle de una boleta entregada, con el par "Retiró": el nombre y el carnet si fue sin
boleta, "Con la boleta" si no, y nada si no se entregó. En el Mostrador sale de la base local (`SELECT_ORDENES` trae las columnas de la
entrega); en el historial del admin, del campo `retiro` de la API. Las dos fuentes arman el mismo `Retiro` (`features/ordenes/retiro.ts`, que
también lo redacta con `textoDelRetiro`).

SPEC-KRILINXI-061 hizo que **/clientes muestre algo antes de buscar**: los clientes por la fecha de su última boleta, la más reciente
primero (`listarRecientes` en `features/clientes/api`, una sola consulta; los que no tienen boleta, al final por su alta; el `id` desempata), de la base
local y paginados del tamaño de la pantalla (20 en una ancha, §9). Escribir en el buscador esconde la lista (`alCambiarEscrito` de `BuscadorVivo`) y
vaciarlo la devuelve. Cada cliente lleva "Ver sus boletas" (solo con sucursal de trabajo), que abre `/clientes/boletas?cliente=<id>`
(`features/historial/components/BoletasDelCliente`, ruta del mostrador, sin botón en el menú): todas sus boletas de la sucursal de trabajo,
paginadas, cada una hacia el Mostrador. La "última boleta" es la que la tablet conoce, o sea las de su sucursal de trabajo.

SPEC-KRILINXI-062 agregó a `GET /api/auditoria` el filtro `cliente_id` (UUID; otro valor, 400): devuelve las acciones sobre el cliente (alta y
ediciones) y sobre sus órdenes, pagos y entregas. Se resuelve en la misma consulta (`ids_del_cliente` en `models/auditoria.model.ts`, cruzado por
`registro_id`, que tiene índice) y se combina con los demás filtros y con la paginación; la forma de la respuesta no cambió. En `/quien-hizo-que`,
"Buscar con más detalle" suma "¿De qué cliente?" (el buscador vivo sobre la base local, con "Quitar el cliente"), y con uno elegido cada ropa, cobro o
entrega dice "— de <nombre>" (la tablet del admin no tiene esos registros para nombrarlos; el nombre sale del filtro).

SPEC-KRILINXI-068 cambió **Registrar ropa**: "Qué deja" y "Precio (Bs)" se volvieron **renglones** ("Prenda 1", "Prenda 2"…, cada uno
un grupo con "Qué es", "Cuántas" —que arranca en 1— y "Precio de cada una (Bs)"), con su subtotal y el **total calculado**; ya no se
escribe el total a mano. La descripción de la boleta se arma sola ("2 Camisa, 1 Edredón"), así el buscador y el historial no cambiaron.
La orden, sus renglones y el adelanto se guardan en la misma transacción, la orden primero. **Al entregar** ya no hay "Precio final":
"Agregar un cargo" suma renglones de ENTREGA y el precio final es el de la boleta más ellos; la tablet guarda **cargos, pago y entrega,
en ese orden**. La parte pura vive en `features/ordenes/renglones.ts` (validar, sumar, describir; los errores de cada campo van por la
clave del renglón, `renglon:<clave>:cantidad`), el SQL en `ordenes/api/renglonesLocal.ts`, y la pieza que los escribe es
`CamposDeRenglones` (la usan Registrar ropa y la entrega); `ListaDeRenglones` los muestra en el detalle del Mostrador y en el del
historial (una boleta de antes, sin renglones, muestra su descripción). En **Para corregir** ya no se corrige un precio: un renglón
rechazado se corrige con sus tres datos, y una entrega se vuelve a guardar con el precio final que da la tablet en ese momento. Para
los tests, `test/renglones.ts` (`escribirPrenda(1, { que: 'Camisa', precio: '10' })`, `agregarCargo(…)`).

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
       · sus renglones (qué prenda, cuántas, a qué precio cada una): precio_total es su suma,
         y descripcion, su resumen (SPEC-KRILINXI-068)
       · fecha_estimada_salida
       · estado inicial: RECIBIDO
  └─ opcionalmente un PAGO de tipo ADELANTO

La ropa sale:    RECIBIDO → ENTREGADO
                 (o REEMBOLSADO si sale sin cobrarse, o ANULADO, antes de salir; desde SPEC-KRILINXI-067 no hay pasos intermedios)

El cliente vuelve a recoger, a la misma sucursal donde dejó la ropa
  └─ se registra la ENTREGA
       · CON_BOLETA: trae el papel
       · SIN_BOLETA: no lo trae → nombre y carnet de quien retira son OBLIGATORIOS
       · precio_final = precio_total + los cargos al entregar (renglones de ENTREGA: un recargo
         por almacenamiento, etc.). Solo se suma: nunca se entrega por menos del total
  └─ PAGO de tipo PAGO_FINAL, cobrado ANTES de entregar: la ropa solo sale con la boleta pagada por completo

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

**Versiones de Node y npm** (SPEC-KRILINXI-045) — **Node 24 (LTS) con el npm 11 que trae**, para todo el equipo:
`engines` de la raíz dice `node >=24 <25` y `npm >=11 <12`, `.npmrc` tiene `engine-strict=true` y `.nvmrc` dice `24`.
Con otra versión, `npm install` **falla** (`EBADENGINE`, con lo que se requiere y lo que hay) en vez de instalar
igual. Cómo tener la versión: con nvm, `nvm install 24 && nvm use` (lee `.nvmrc`); en Windows sin nvm,
`winget install OpenJS.NodeJS.LTS`. Se comprueba con `node --version` (v24.x) y `npm --version` (11.x). Por qué importa:
cada versión de npm normaliza `package-lock.json` distinto, y el lock cambiaba según quién corriera `npm install`
(ver §13). Un test (`backend/tests/unit/versionesDelEntorno.test.ts`) vigila que `package.json`, `.npmrc`, `.nvmrc` y el
lock digan lo mismo.

**Backend** — Node + Express + `pg` (SQL directo, sin ORM) + JWT + cors, con nodemon
en `npm run dev`.

**Frontend** — React + Vite + TypeScript + Tailwind + axios, empaquetado como **PWA**
(`vite-plugin-pwa`, SPEC-KRILINXI-011: manifest para instalarla en la tablet y un service
worker propio en `src/pwa/`), con el SDK web de PowerSync para la base local y **Recharts** para los gráficos del tiempo (SPEC-KRILINXI-063, solo en `estadisticas/components/graficos/`). Los WASM de
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
                usuarios/ sucursales/ atencion/ mostrador/ historial/
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
`text-peligro-texto`, no `bg-sky-700`. Un color nuevo se agrega al tema, **en el bloque claro y en el
oscuro** (SPEC-KRILINXI-030), con su par de contraste en `test/tema.test.ts`. Un aviso es un `Aviso`, no un `<p>` con colores a mano.

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

- **Bucket `sucursal`** — las `ordenes`, `entregas`, `pagos` y `orden_items` (los renglones de la boleta, con lista
  explícita de columnas, SPEC-KRILINXI-068) de la sucursal del usuario.
- **Bucket `atencion_admin`** (SPEC-KRILINXI-028) — lo mismo, para el ADMIN que atiende el
  mostrador: la sucursal sale del parámetro de cliente `sucursal_id` (`request.parameters()`), que
  la tablet manda al conectarse. Ese parámetro lo controla la tablet, así que **no autoriza nada**:
  la consulta exige `id = request.user_id() AND rol = 'ADMIN' AND activo = true`, y sin parámetro
  el bucket no existe. Un empleado no lo recibe nunca, mande lo que mande. Por estar atada a
  `request.user_id()`, PowerSync no la marca como peligrosa: **no lleva
  `accept_potentially_dangerous_queries`**, que solo callaría el aviso si alguien rompiera esa
  condición (lo vigila `backend/tests/unit/syncRules.test.ts`).
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
  validar con el validador que trae el propio contenedor (ver la bitácora de SPEC-ALE186-024), y
  ver qué buckets recibe cada cuenta con el motor de reglas (ver la bitácora de SPEC-KRILINXI-028).
- **`auditoria` no se sincroniza a ningún dispositivo.** Se consulta por API, solo admin.
- **El admin no descarga el histórico**, porque su dashboard es online (sección 8). La
  excepción es cuando atiende el mostrador: baja la ropa de esa sucursal (`atencion_admin`).

Una limitación de PowerSync que explica una rareza del schema: las consultas de datos
**no admiten JOINs ni subconsultas**. Por eso `entregas`, `pagos` y `orden_items` llevan su propio
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
  sucursal de su orden. Y `/ingresos-por-dia` (SPEC-KRILINXI-043): lo cobrado en cada día del
  período, con el desglose por forma de pago; el día de un cobro es el de Bolivia.
  Aparte de las estadísticas, el admin pide online el historial de boletas, `GET /api/ordenes`
  (SPEC-KRILINXI-040): mismo criterio (no tiene esa ropa en la tablet), pero sin período por
  defecto.
- **Las fechas se miran en la hora de Bolivia** (`ZONA_NEGOCIO = 'America/La_Paz'`, en
  `utils/periodo.ts` desde SPEC-ALE186-012, junto con `leerPeriodo` y `horaDelNegocio`). Las columnas `TIMESTAMP` guardan la hora de la sesión de
  Postgres, que en el servidor es UTC: sin convertir, un cobro de las 21:00 caería en el día
  siguiente. `desde`/`hasta` son días de Bolivia, y "hoy" también (`hoyEnElNegocio()`).
  **Para filtrar por período se usa `enElPeriodo(columna, …)`** (SPEC-ALE186-021), nunca
  `horaDelNegocio(columna)::date BETWEEN …`: la segunda aplica una función a la columna en
  cada fila y Postgres no puede buscar en su índice. `horaDelNegocio` queda para lo que se
  MUESTRA (el `SELECT`, el `GROUP BY` por día), donde no estorba.
- **Los montos se suman en Postgres y salen como texto** (`"125.50"`), incluidos los totales
  por sucursal y el general. El frontend no suma: muestra. **Una excepción, declarada**
  (SPEC-KRILINXI-042): el total por forma de pago de todas las sucursales juntas, que `/ingresos` no trae, se suma en
  el frontend en centavos enteros (`totalesPorFormaDePago.ts`) hasta que la API lo dé.
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

Cómo se ve la app (colores, letra, componentes) está en `frontend/DESIGN.md`, y para quién es, en `frontend/PRODUCT.md`
(SPEC-KRILINXI-047). Leelos antes de pulir una pantalla.

Requisitos concretos, no buenas intenciones:

- **Botones y texto grandes.** Se usa de pie, en un mostrador, muchas veces con prisa.
- **El idioma es el del negocio, no el del sistema.** "Registrar ropa", no "Crear orden".
  "Cobrar", no "Insertar pago". Nada de "sincronizar", "caché" o "token" en pantalla.
- **Confirmación explícita antes de cualquier acción irreversible**, diciendo qué va a
  pasar: "¿Anular la orden 001234? Esta acción no se puede deshacer."
- **El estado de conexión está siempre visible y en palabras, pero discreto** (SPEC-KRILINXI-031):
  una píldora en la cabecera dice "Con internet" o "Sin internet · 3 por guardar", y al tocarla
  despliega la frase completa ("Trabajando sin internet — 3 registros se guardarán cuando vuelva la
  conexión"). Nunca un ícono suelto que haya que interpretar. Solo cuando pide una acción —hay
  registros para corregir— aparece además el aviso grande arriba del contenido, con el enlace.
- **Los errores dicen qué hacer**, en español y sin códigos: "Ese número de boleta ya
  está usado en esta sucursal. Revisa el papel y vuelve a escribirlo." Siempre en tuteo neutro, sin voseo (SPEC-KRILINXI-053).
- Pocos campos por pantalla y un solo camino claro para cada tarea.
- **Ninguna lista larga se muestra de golpe** (SPEC-KRILINXI-041). Toda lista que puede crecer —boletas, ropa,
  cuentas, registros— se pagina, con una barra de páginas en palabras que se ve siempre ("Página 1 de 1" si cabe todo), y cuántas filas entran depende del ancho
  del dispositivo (6 en un celular, 10 en una tablet vertical, 20 en una pantalla ancha, de `lib/tamanoDePagina.ts`).
  El buscador completa la paginación, no la reemplaza. Un test de arquitectura obliga a que una lista nueva elija.

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

DEMO_URL_PUBLICA=https://<dominio>.ngrok-free.app npm run demo   # demo para el cliente (ver abajo)
```

La **línea base** del schema (`context/lavanderia_schema.sql`) se carga sola en el primer
arranque, cuando el volumen de Postgres está vacío; ese mismo arranque crea la base
`powersync_storage` (`docker/postgres/01-powersync-storage.sql`). Desde SPEC-ALE186-019 ese
archivo **no se vuelve a editar**: todo cambio al schema es una migración en
`backend/migraciones/NNN_nombre.sql` (cómo escribirla: `backend/migraciones/README.md`), y se
aplica con `npm run migrar --workspace backend` sobre la base que ya existe, sin borrar datos.
**Después de cada `git pull`, corré `npm run migrar`**: si falta alguna, el backend no arranca
y dice cuántas. `down -v` sigue sirviendo para empezar de cero, pero borra todo.

### La demo para el cliente con ngrok (SPEC-KRILINXI-064)

Antes de hostear la app, el cliente puede probarla desde su equipo o su celular con **un solo túnel de ngrok**.
`npm run demo` compila el frontend con la dirección pública y levanta `vite preview` (puerto 4173), que además reparte
los pedidos: `/api/*` al backend (:4000) y `/powersync/*` a PowerSync (:8080, sin el prefijo). Así el navegador ve **un solo
origen**: no hay CORS que abrir (el pedido del mismo origen se atiende sin la cabecera), la política de seguridad sigue siendo
`'self'` más esa dirección, y la PWA se puede instalar y abrir sin internet, que exige HTTPS. Las reglas viven en
`frontend/src/pwa/demo.ts`; `scripts/demo/demo.mjs` solo las corre en orden. El servidor acepta únicamente el dominio de la
demo (y localhost) como `Host`: cualquier otro recibe 403. Es una **demo con datos de prueba, no un hosting**.

**1. Instala ngrok (una vez).** En Windows: `winget install ngrok.ngrok`. Cierra y abre la terminal y comprueba con `ngrok version`: tiene que ser **3.20 o más** (las cuentas gratis rechazan agentes más viejos con `ERR_NGROK_121`; se actualiza con `ngrok update`).

**2. Autentícalo (una vez).** Crea una cuenta gratis en ngrok.com, copia tu *authtoken* del panel (Getting Started → Your Authtoken)
y corre `ngrok config add-authtoken <TU_TOKEN>`. En el panel, en *Domains*, reclama tu dominio gratis (algo como
`algo-algo.ngrok-free.app`): esa será la dirección de la demo, y no cambia entre sesiones.

**3. Prepara los datos de demostración.** Con `docker compose up` y `npm run migrar --workspace backend` hechos, usa una base
**aparte** de la de trabajo (otra `DATABASE_URL`, o `docker compose down -v` para empezar de cero) y crea una sucursal y un admin de
demostración **con una contraseña propia, que no uses en ningún otro lado**:
`SEED_ADMIN_PASSWORD=<contraseña-de-la-demo> SEED_SUCURSAL="Sucursal Demo" npm run seed --workspace backend`.
Después levanta el backend (`cd backend && npm run dev`).

**4. Pon la dirección en tu `.env`** (una vez): `DEMO_URL_PUBLICA=https://TU-DOMINIO.ngrok-free.app`.

**5. Levanta la demo con un solo comando.** Desde la raíz: `npm run demo`. Compila la app, avisa si el backend o PowerSync no
responden, levanta el servidor de la app (puerto 4173) **y abre el túnel de ngrok él mismo**. Sin la dirección, falla diciendo qué
falta; sin ngrok instalado, también, y dice cómo instalarlo. Variantes: `DEMO_URL_PUBLICA=… npm run demo` (sin tocar el `.env`) y
`npm run demo -- --sin-ngrok` (si prefieres abrir el túnel tú: `ngrok http --domain=TU-DOMINIO.ngrok-free.app 4173`).

**6. Abre la dirección** `https://TU-DOMINIO.ngrok-free.app` en el navegador o en el celular del cliente, e ingresa con el admin de
demostración. Si ngrok muestra una página de aviso antes de la app, es la del plan gratuito: toca *Visit Site*.

**7. Apaga todo al terminar.** `Ctrl+C` en la terminal de `npm run demo` (cierra el servidor y el túnel), y borra la base de demostración. El
túnel abierto es una puerta a tu computadora: no lo dejes prendido.

**CORS:** no hace falta tocar `CORS_ORIGENES` con este camino, porque la app y la API comparten dirección. Si algún día la API se
publica por separado, esa dirección va en `CORS_ORIGENES`, separada por comas. Si cambias el dominio, **vuelve a correr
`npm run demo`**: la dirección queda compilada dentro de la app.

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

- **`package-lock.json` se commitea solo con Node 24 y npm 11** (SPEC-KRILINXI-045, ver §4). Cada versión de npm
  normaliza el lock a su manera —npm 11.19, por ejemplo, borra las 26 líneas `"peer": true` de los `@esbuild/*`—, y
  antes de fijar la versión el lock cambiaba en los PRs sin que ninguna dependencia hubiera cambiado. Con `engine-strict`
  eso ya no pasa por accidente. Si `git status` te muestra el lock modificado sin que hayas tocado dependencias, no lo
  commitees: revisá `node --version` y `npm --version`, volvé al lock con `git checkout package-lock.json` y
  reinstalá con la versión acordada. Cambiar de versión (a Node 26, a npm 12) es una decisión del equipo y una spec: se
  cambian `engines`, `.nvmrc` y el lock **juntos**, en el mismo PR.
  Una advertencia que hoy sale y no se trató: npm 11.19 avisa que `bcrypt`, `better-sqlite3` y `esbuild` tienen scripts de
  instalación "no cubiertos por `allowScripts`". Es solo un aviso (todo funciona); aprobarlos explícitamente es una spec aparte.

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
  cambio de estado rechazado no se corrige ahí, se rehace desde el Mostrador.
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
- **Los renglones de la boleta** (SPEC-KRILINXI-068, hecho): la migración 007 crea `orden_items` y las sync rules la bajan en
  los buckets `sucursal` y `atencion_admin`. **Después del pull, `npm run migrar --workspace backend` y `docker compose restart
  powersync`**. Una tablet con la versión anterior que entregue con un "Precio final" escrito a mano distinto del total más los
  cargos ve esa entrega en Para corregir (409 `PRECIO_FINAL_DISTINTO`); y un EMPLEADO ya no puede cambiar `precio_total` (403).
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
- **El ADMIN que atiende baja la ropa de una sucursal** (SPEC-KRILINXI-028 en las sync rules,
  SPEC-KRILINXI-029 en la tablet, hecho). Para recibirla, la tablet del ADMIN conecta PowerSync con
  `params: { sucursal_id }`; sin ese parámetro no baja nada, como antes. **Después del pull,
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
