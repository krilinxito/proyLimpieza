---
id: SPEC-KRILINXI-007
spec: specs/SPEC-KRILINXI-007-cola-subida.md
explica:
  - fallas pasajeras y permanentes (reintentar o apartar)
  - tabla interna como señal de cambio (ps_crud)
  - tabla solo local para lo rechazado
---

# SPEC-KRILINXI-007 — Subir lo registrado y avisar qué falta guardar

## Qué se construyó

Lo que se registra en la tablet ahora **llega al servidor** cuando hay conexión. Arriba de
cada pantalla, una frase dice si hay internet y cuántos registros faltan guardar. Si el
servidor rechaza algo (una boleta repetida, por ejemplo), no se pierde: aparece
"1 registro no se pudo guardar", que lleva a una lista con el motivo.

Y una protección nueva: si la sesión vence mientras la tablet estuvo sin internet, la app ya
no borra la ropa que quedó sin subir.

## Cómo funciona, paso a paso

Seguimos una orden con la boleta `001234` que el servidor rechaza porque otro dispositivo de
la misma sucursal ya la había usado.

1. **La orden está en la cola.** Se escribió con `registrarRopa` (SPEC-KRILINXI-006), así que
   PowerSync la anotó como un `PUT` de `ordenes`. El aviso ya la contaba: `observarEstado`
   (`lib/powersync/control.ts:79`) escucha cambios en las tablas **y en `ps_crud`**, la
   tabla interna de la cola (`:102`).
2. **Vuelve la conexión.** PowerSync llama a `uploadData`, que es `subirCola`
   (`conector.ts:110` → `:85`). Pide la transacción más vieja (`:86`) y la recorre.
3. **De operación a petición.** `aPeticion` (`:42`) busca la tabla en `RECURSOS` (`:14`):
   un `PUT` de `ordenes` es `POST /ordenes` con `{ id, ...opData }`. Lo manda
   `api.request` (`:90`), el mismo cliente de toda la app, que pone el token de la API.
4. **El servidor dice 409.** `lib/api` lo traduce a un `ErrorApi` con
   `codigo: 'BOLETA_DUPLICADA'` y el mensaje para el mostrador. `esRechazo` (`:55`) lo
   reconoce porque 409 está en `RECHAZOS` (`:29`).
5. **Se guarda, no se tira.** `guardarParaCorregir` (`:60`) copia la tabla, el id, los datos
   y el mensaje en `para_corregir`, una tabla **solo local** (`schema.ts:92`, `:106`).
   Después la transacción se da por terminada (`conector.ts:96`) y la cola sigue con lo
   que venga detrás.
6. **El aviso se entera.** Ese `INSERT` dispara `onChange` y `observarEstado` recalcula:
   `paraCorregir: 1`. `useConexion` (`hooks/useConexion.ts:19`) se lo pasa a `AvisoConexion`
   desde `App.tsx:12`, y aparece el enlace a `/para-corregir` (`AvisoConexion.tsx:46`).
7. **La lista.** `PantallaParaCorregir` usa `useParaCorregir`, que llama a
   `listarParaCorregir` (`paraCorregirLocal.ts:83`). `describir` (`:38`) convierte
   `{numero_boleta: "001234"}` en "Ropa con la boleta 001234", y debajo va el mensaje del
   servidor tal cual.

**El otro camino, sin conexión o con el servidor caído:** en el paso 4, `ErrorSinConexion` o
un 5xx no son rechazos. `subirCola` relanza el error (`:92`), la transacción **no** se
completa, y PowerSync reintenta más tarde con la cola intacta.

**Y el 401:** `lib/api` avisa a `SesionProvider`, que cierra la sesión con motivo
`'rechazada'` (`SesionProvider.tsx:73`). Si `hayCambiosSinSubir()` (`control.ts:68`) da
`true`, solo desconecta (`SesionProvider.tsx:56-57`). La base queda, y al volver a ingresar
se abre la misma y la subida sigue. Con la cola vacía, borra como antes (`:62`).

## Dónde encaja en la arquitectura

```
pantallas ──escriben──▶ SQLite local ──cola (ps_crud)──▶ subirCola ──lib/api──▶ backend
                             ▲                               │ rechazo
                             └──── para_corregir ◀───────────┘
```

- **`lib/powersync/`** es lo único que habla con el SDK (CLAUDE.md §5 y el test de
  arquitectura de la 004). Por eso ahí viven la subida, la tabla solo local y el cálculo del
  estado. Afuera solo se ven `observarEstado`, `desconectar` y `hayCambiosSinSubir`.
- **`lib/powersync/conector.ts` usa `lib/api`**, y no axios directo: así el token, el
  timeout y la traducción de errores son los mismos de toda la app, y el 401 de una subida
  dispara el mismo cierre de sesión que el de cualquier pantalla.
- **`components/AvisoConexion`** es compartido y **puro**: recibe tres números por props
  (la regla de SPEC-KRILINXI-002). Quien los saca de la base es `hooks/useConexion`, que es
  transversal porque el aviso está en todas las pantallas. Ninguna feature es su dueña.
- **`features/pendientes/`** sigue el patrón de la 005: `api/` con el SQL, un hook y un
  componente que solo usa el hook. Lee `para_corregir`, pero no la escribe: eso es de la
  subida.

## Fundamentos

### Reintentar o apartar: errores que se arreglan solos y errores que no

**Qué es.** Cuando algo falla al subir, hay dos tipos de falla, y la cola trata cada uno
distinto:

- **Pasajeras**: sin internet, servidor caído (5xx), sesión vencida (401). Reintentando más
  tarde, el mismo dato sube. Se **relanza** el error y PowerSync reintenta.
- **Permanentes**: el servidor entendió y dijo que no (400, 403, 404, 409, 422). Reintentar
  da la misma respuesta para siempre. Se **aparta** el dato y se sigue.

**Por qué importa.** La cola es una fila india: PowerSync no pasa a la transacción siguiente
hasta que la actual se completa. Si una permanente se tratara como pasajera, una sola
boleta repetida trabaría **para siempre** todo lo que viene detrás: los cobros, las
entregas y los clientes de toda la tarde. Al revés, si una pasajera se tratara como
permanente, un corte de wifi de diez segundos mandaría a "para corregir" registros que
estaban perfectos.

**En el código.** `RECHAZOS` (`conector.ts:29`) es la línea que separa los dos tipos. El
401 queda afuera a propósito: no dice que el dato esté mal, sino que la sesión no vale. Con
una sesión nueva, el mismo dato sube sin tocarlo. Los tests prueban cada caso, y una
mutación (agregar 500 a `RECHAZOS`) hace fallar el de "con un 500".

### Por qué el rechazo necesita su propia tabla

Si a un rechazo se le hace `complete()` sin más, PowerSync lo da por resuelto y, en la
siguiente sincronización, **reemplaza la base local por lo que dice el servidor**. El
servidor no tiene esa orden, así que la orden desaparece de la tablet. Para el empleado, la
ropa que registró simplemente ya no está, y nada le dice por qué.

`para_corregir` es la copia que sobrevive a esa limpieza. Es `localOnly` (`schema.ts:106`):
no baja por las sync rules y lo que se escribe en ella no entra a la cola, porque si
entrara, el `INSERT` del rechazo intentaría subirse y fallaría también. El test "guardar
para corregir no vuelve a entrar en la cola" vigila justo eso.

### Una tabla interna como señal de cambio (`ps_crud`)

`observarEstado` necesita enterarse de dos cosas: que se **escribió** algo (sube el
pendiente) y que se **subió** algo (baja el pendiente). La primera es fácil: escuchar las
tablas del negocio. La segunda no pasa en ninguna tabla nuestra. La subida borra filas de
`ps_crud`, la tabla donde PowerSync guarda la cola.

Sin `ps_crud` en la lista de `onChange`, el aviso seguiría diciendo "guardando 3
registros…" después de guardarlos. No es teoría: se comprobó sacándolo, y el test "cuando
la subida vacía la cola, el pendiente vuelve a cero" falló. Que el nombre de una tabla
interna del SDK esté en nuestro código es un acople. Por eso está comentado en
`control.ts`, y el test es lo que avisaría si una versión nueva del SDK la renombra.

**Ya explicado antes:**

- **Cola de subida (crud queue)**, **offline-first (bajada y subida)** y **sync rules y buckets** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)
- **Idempotencia** y **entrega al menos una vez** → SPEC-ALE186-002 y SPEC-ALE186-003 (por qué el reintento de un `POST` es seguro)
- **Formato de error uniforme** → SPEC-ALE186-001; **interceptores de axios** → SPEC-KRILINXI-003
- **Hook como puerta a los datos** → SPEC-KRILINXI-005
- **Prueba de mutación** → SPEC-KRILINXI-003

## Decisiones y por qué

- **403 y 422 también son rechazos**, aunque la spec nombraba 400, 404 y 409: tampoco
  cambian al reintentar. La lista está en un solo lugar (`RECHAZOS`).
- **Las operaciones sin endpoint se apartan, no se descartan** (`OperacionNoAdmitida`).
  Hoy ninguna pantalla borra ni edita pagos, así que es una red: si algún día alguien
  escribe un `DELETE`, aparece en `/para-corregir` en vez de perderse.
- **Un 401 con la cola llena desconecta sin borrar.** Al volver a ingresar, la cola sube con
  la sesión de **quien entre**. Si es otra persona, el backend la anota como quien recibió o
  cobró, porque lo toma de la sesión. Se aceptó así: la alternativa era perder el trabajo.
  Quedó anotado en CLAUDE.md §13.
- **Salir confirmando sigue borrando**, aunque haya cosas sin subir. La spec no lo pedía,
  pero es el mismo riesgo por otro camino. Está en §13 como candidato.
- **"Con internet" significa "conectado al servicio de sincronización".** Si hay wifi pero
  el servicio está caído, el aviso dice "Trabajando sin internet". Para quien está en el
  mostrador el efecto es el mismo: lo registrado espera.
- **El aviso usa `role="status"`**: un lector de pantalla lo anuncia cuando cambia, sin
  interrumpir.

## Los tests

- **Reusados:** `baseLocalDePrueba` con `sembrar`, `simularApi`, `cuerpoError`,
  `renderEnRuta` y `sinJerga` (de la 006).
- **Ampliado:** `controlFalso` tiene `observarEstado` (por defecto: con internet, nada
  pendiente), `desconectar` y `hayCambiosSinSubir` (por defecto `false`). Para el caso de
  la cola llena: `baseLocal.hayCambiosSinSubir.mockResolvedValue(true)`.
- **Helper local** `prepararSubida(responder)` en `conector.test.ts`: arma la base real, el
  servidor falso y devuelve `subir()`, `cola()` y `paraCorregir()`. Si `corregir-registros`
  necesita lo mismo, conviene moverlo a `test/`.
- **De punta a punta:** `PantallaParaCorregir.test.tsx` escribe una orden, la sube contra un
  409 y recién entonces abre la App. Prueba que el rechazo llega a la pantalla sin atajos.
- **Mutaciones hechas:** sacar `complete()` (fallan 9 tests), agregar 500 a `RECHAZOS`
  (falla 1), sacar `ps_crud` (falla 1) y quitar el motivo `'rechazada'` (falla 1).

## Si mañana tenés que tocar esto

- **Un endpoint nuevo** (por ejemplo, editar entregas) es una línea en `RECURSOS` o en
  `EDITABLES` de `conector.ts`, más su test en `conector.test.ts`.
- **`corregir-registros`** tiene que leer `para_corregir.datos`, dejar editar el campo del
  problema, volver a escribir la fila en su tabla (que entra a la cola de nuevo) y borrar la
  fila de `para_corregir`.
- Si una versión nueva de PowerSync cambia el nombre de `ps_crud`, el síntoma va a ser un
  aviso que no baja de "guardando…". El test de `control.test.ts` lo detecta.
