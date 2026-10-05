---
id: SPEC-ALE186-008
spec: specs/SPEC-ALE186-008-estadisticas-cobros.md
explica:
  - agrupar sobre una lista fija (values + left join)
  - funciones de ventana
  - zona horaria del negocio (at time zone)
---

# SPEC-ALE186-008 — Estadísticas de cobros: ingresos, saldos y ropa sin recoger

## Qué se construyó

Las tres primeras respuestas del panel del administrador:
- **cuánto se cobró**, por sucursal y por forma de pago;
- **quién debe plata**, cuánto y desde hace cuánto;
- **qué ropa sigue en el local** sin que nadie la venga a buscar.

Solo las ve el ADMIN, y son lo único del sistema que se lee de la API y no de la base local
de la tablet. Las cuentas las hace Postgres. Las fechas se miran en hora de Bolivia, así que
el total de un día coincide con la caja de ese día.

## Cómo funciona, paso a paso

El caso: el administrador abre el panel y pide los saldos pendientes de la sucursal Centro
en junio:

```
GET /api/estadisticas/saldos?desde=2025-06-01&hasta=2025-06-30&sucursal_id=2222…
Authorization: Bearer <token de un ADMIN>
```

1. **La ruta exige ADMIN.** `src/routes/estadisticas.routes.ts:11` pone `requireAuth` y
   `requireRol('ADMIN')` delante de los tres endpoints. Un EMPLEADO recibe 403 sin llegar
   al controller. Ese es el control de acceso que pide CLAUDE.md §8: no alcanza con
   esconder el botón.

2. **El controller resuelve el período.** `getSaldos`
   (`src/controllers/estadisticas.controller.ts:75`) llama a `leerPeriodo` (`:52`):
   - valida las dos fechas con `esFechaCalendario`, la misma de órdenes;
   - si faltaran, usaría "hoy" y los 29 días anteriores;
   - comprueba que `desde` no sea posterior a `hasta` (`:57`);
   - valida que `sucursal_id` sea un UUID.
   Además le pasa al model **qué día es hoy en Bolivia**, con `hoyEnElNegocio()` (`:26`).

3. **El model arma las consultas.** `saldos` (`src/models/estadisticas.model.ts:214`)
   corre dos consultas en paralelo (`Promise.all`, `:217`) sobre la misma base
   (`SALDOS_DEL_PERIODO`, `:199`):
   - parte de `vw_saldos`, que ya sabe cuánto debe cada orden: el precio final si hubo
     entrega, el total si no, menos lo pagado;
   - la cruza con `ordenes` (`:207`) porque la vista no tiene fecha, y la fecha hace falta
     para filtrar por período y contar los días;
   - la primera consulta devuelve **la lista** de órdenes, de la más vieja a la más nueva;
   - la segunda, **los tres tramos** de antigüedad con su cantidad y su total, y el total
     general (ver Fundamentos).

4. **La fecha, en hora de Bolivia.** Para saber si una orden "entró en junio", el model no
   mira `fecha_entrada` cruda. Primero la convierte con `diaLocal` (`:37-38`).

5. **La respuesta.** El controller agrega `desde` y `hasta` y responde. Los montos llegan
   como texto con dos decimales (`"70.00"`), y las cantidades y los días como números.

## Dónde encaja en la arquitectura

Es la excepción que declara CLAUDE.md §8 a "todo se lee de la base local": un endpoint
`GET` que la pantalla consulta online. Las capas son las de siempre:

- **La ruta** decide quién entra. Nada más.
- **El controller** traduce la query string a un `Periodo` y decide qué día es hoy. **No
  suma nada.** Ni siquiera el total general, que sería un `reduce` tentador sobre las
  sucursales que ya tiene en la mano.
- **El model** hace todas las cuentas en SQL. Lo único que hace en TypeScript es
  **reacomodar**: agrupar las filas por sucursal y completar con `"0.00"` los métodos de
  pago sin cobros (`metodosEnCero`, `:79`).

Por qué tan estricto con dónde se suma: la regla del dinero (CLAUDE.md §6) prohíbe tocar
montos con floats, y la manera más simple de cumplirla en un endpoint de solo lectura es
que JavaScript nunca tenga un monto como número. Postgres suma `NUMERIC`, que es exacto, y
`pg` lo entrega como texto. Un test contra la base real comprueba que `0.10 + 0.20` da
`"0.30"`.

**Lo que no se tocó:** las vistas. `vw_pendientes_recoger` trae el nombre de la sucursal y
no su id, y `vw_saldos` no tiene fecha. Las dos se cruzan con `ordenes` por id (`:207` y
`:301`). Cambiar una vista obliga a todos a recrear su base (CLAUDE.md §11).

## Fundamentos

### La zona horaria del negocio: AT TIME ZONE

Las columnas de fecha del proyecto son `TIMESTAMP` **sin zona**: guardan una hora "de
reloj", sin decir de qué reloj. Ya se explicó por qué el backend las escribe siempre en la
zona de la sesión de Postgres (SPEC-ALE186-003, "timestamp sin zona horaria"). En este
servidor esa zona es UTC.

Para guardar alcanza. Para **agrupar por día**, no. Bolivia está cuatro horas detrás de UTC,
así que un cobro de las 21:00 del lunes en La Paz queda guardado como `01:00` del martes.
Si el panel preguntara "¿cuánto se cobró el lunes?" mirando la columna cruda, ese cobro
aparecería el martes, y el total del lunes no coincidiría con lo que contó la cajera.

`diaLocal` (`estadisticas.model.ts:37-38`) lo resuelve en dos pasos de `AT TIME ZONE`, que
en Postgres hace cosas distintas según qué le des:

```sql
(fecha_pago AT TIME ZONE current_setting('TimeZone'))   -- 1
            AT TIME ZONE 'America/La_Paz'               -- 2
```

1. A un `TIMESTAMP` sin zona le dice "esta hora estaba en la zona de la sesión", y lo
   convierte en un **instante absoluto** (`timestamptz`).
2. A un instante absoluto le pide "¿qué hora marcaba el reloj en La Paz?", y devuelve otra
   vez una hora de reloj, ahora de Bolivia.

Después, `::date` da el día de Bolivia. El primer paso usa `current_setting('TimeZone')` y
no `'UTC'` escrito a mano porque lo que hay que deshacer es lo que hizo **la sesión**. Si el
servidor de producción estuviera en otra zona, `'UTC'` fijo daría mal sin avisar.

"Hoy" tiene el mismo problema del lado de JavaScript: `new Date().toISOString()` es UTC, y
entre las 20:00 y la medianoche de Bolivia diría que ya es mañana. `hoyEnElNegocio`
(`estadisticas.controller.ts:26`) le pide a `Intl.DateTimeFormat` la fecha en
`America/La_Paz`. El test `tests/db/estadisticas.db.test.ts:52` prueba el caso exacto del
cobro de las 21:00, y una prueba de mutación lo confirmó: con la conversión quitada, ese
test y otros tres fallan.

### Funciones de ventana: totales sin perder el detalle

`GROUP BY` resume: de muchas filas de pagos deja una por grupo. El problema es que la
respuesta necesita **tres niveles a la vez**: por método, por sucursal y el total general.
Con solo `GROUP BY` harían falta tres consultas, o sumar los niveles de arriba en
JavaScript, que es justo lo que no se quiere.

Una **función de ventana** (`… OVER (…)`) calcula sobre un conjunto de filas **sin
colapsarlas**: cada fila conserva su detalle y además recibe el resultado del cálculo.

```sql
SELECT p.sucursal_id, p.metodo,
       SUM(p.monto)                                         AS total_metodo,
       SUM(SUM(p.monto)) OVER (PARTITION BY p.sucursal_id)  AS total_sucursal,
       SUM(SUM(p.monto)) OVER ()                            AS total_general
  FROM pagos p … GROUP BY p.sucursal_id, p.metodo
```

`SUM(SUM(p.monto))` parece raro, pero se lee de adentro hacia afuera:
- el `SUM` de adentro es el del `GROUP BY`: el total de cada (sucursal, método);
- el de afuera, con `OVER`, suma esos totales ya agrupados;
- `PARTITION BY p.sucursal_id` lo hace por sucursal, y `OVER ()`, sin partición, sobre
  todo.

Cada fila sale con los tres niveles, calculados por Postgres en una sola consulta
(`estadisticas.model.ts:98-99`). Los tramos de antigüedad usan lo mismo para el total y la
cantidad general.

### Agrupar sobre una lista fija: VALUES + LEFT JOIN

La spec pide que los tres tramos aparezcan **siempre**, aunque no tengan ninguna orden. Un
`GROUP BY tramo` solo devuelve los tramos que tienen filas: si nadie debe hace más de un
mes, el tramo `MAS_DE_30_DIAS` simplemente no viene, y la pantalla tendría que inventarlo.

La solución es partir de la lista fija y pegarle los datos:

```sql
FROM (VALUES (1, 'HASTA_7_DIAS'), (2, 'DE_8_A_30_DIAS'), (3, 'MAS_DE_30_DIAS')) AS t(posicion, tramo)
LEFT JOIN base ON (CASE … END) = t.tramo
```

- `VALUES` arma una tabla de tres filas en el momento (`LOS_TRES_TRAMOS`, `:146`).
- `LEFT JOIN` conserva las tres aunque no encuentren pareja. Un tramo vacío queda con
  `COUNT(base.orden_id) = 0` y `COALESCE(SUM(…), 0) = 0.00`.
- La columna `posicion` existe para ordenar los tramos de menor a mayor; ordenar por el
  texto los pondría en orden alfabético.

Un detalle de esto: hay que contar `COUNT(base.orden_id)` y no `COUNT(*)`. En un
`LEFT JOIN` sin pareja hay igual una fila (con `NULL` en las columnas de `base`), y
`COUNT(*)` la contaría como 1.

**Ya explicado antes:**

- **Timestamp sin zona horaria** y **mock parcial de un módulo** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Test de integración** y **aislar los datos de prueba** → SPEC-ALE186-007 (`specs/notas/SPEC-ALE186-007-tests-base-real.md`)
- **Dinero en centavos enteros** y **punto flotante** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Autenticación vs autorización (401 y 403)** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)

## Decisiones y por qué

- **El controller decide qué día es hoy y se lo pasa al model** (`:77`), en vez de que el
  SQL use `CURRENT_DATE`. Así los días y los tramos de un test no dependen del reloj: el
  test fija `HOY = '2025-06-30'` y sabe exactamente cuántos días tiene cada orden. De
  paso, "hoy" se calcula en un solo lugar, ya en hora de Bolivia.
- **`fechaEntrada` sale en hora de Bolivia** (`'YYYY-MM-DD HH:MM:SS'`), no como está
  guardada. El panel la muestra a una persona que piensa en hora local, y es la misma hora
  con la que se cuentan los días. Ojo: los `POST` de órdenes y pagos devuelven la fecha
  como está guardada (UTC). Si el frontend llega a mostrar las dos, que no las mezcle.
- **Tramos fijos y no un histograma de días**, como dice la spec: "más de un mes" se lee de
  un vistazo. Los límites (7 y 30) tienen su propio test.
- **Sin paginación.** Son cientos de filas con tres sucursales. Si hace falta, se agrega un
  `limite` opcional sin romper el contrato.
- **El filtro de fecha no usa índice.** Convertir la columna antes de compararla impide que
  Postgres use `idx_pagos_fecha`. Con el volumen de tres sucursales no se nota. Si algún
  día pesa, la salida es convertir los **límites** `desde`/`hasta` a UTC y comparar la
  columna cruda.

## Los tests

- **Contra la base real** (`tests/db/estadisticas.db.test.ts`, 12 tests): las sumas por
  sucursal y por método, los decimales exactos, el cobro de las 21:00, el filtro por
  sucursal, los saldos con y sin entrega, los límites exactos de los tramos y la ropa sin
  recoger. Más uno **de punta a punta por HTTP**, que comprueba que el contrato llega con
  sus tipos: montos como texto, días y cantidades como números. Esto último importa:
  `COUNT` en Postgres devuelve `bigint`, que `pg` entrega como texto, y por eso el SQL lo
  pasa a `::int`.
- **Con dobles** (`tests/http/estadisticas.test.ts`, 23 tests): quién entra (401 y 403),
  el período por defecto, las validaciones y la forma de cada respuesta. Para el período
  por defecto se fija el reloj con `vi.useFakeTimers({ toFake: ['Date'] })`: solo `Date`,
  porque si se falsean todos los timers, supertest se queda esperando los suyos.
- **Helper extendido, no duplicado:** `tests/helpers/baseReal.ts` (SPEC-ALE186-007) ganó
  `fechaEntrada` en `crearOrden`, y `crearPago` y `crearEntrega`. Las fechas se pasan como
  las manda el dispositivo (ISO con zona) y pasan por `timestamptz` igual que en los
  models, así que quedan guardadas como en producción. `estadisticas-volumen` los va a
  usar tal cual.
- **Aislamiento:** cada test filtra por su propia sucursal o usa una ventana de fechas que
  ningún otro test usa (2021 para el caso "todas las sucursales"). Corren en paralelo con
  los de pagos y entregas sin contar los datos de ellos.

## Si mañana tenés que tocar esto

- **Para un endpoint nuevo de estadísticas** (volumen, productividad): copiá el patrón de
  `saldos`. Toda fecha pasa por `diaLocal`, "hoy" llega del controller, las sumas van en
  SQL y los tests van en `tests/db/`.
- **Si cambia la forma de una respuesta, cambiaste el contrato** de la pantalla de
  krilinxito: avisale, y actualizá la spec y el test de forma de `tests/http/`.
- **No uses `CURRENT_DATE` ni `NOW()` para "hoy"** en estas consultas: son del reloj del
  servidor, en UTC.
