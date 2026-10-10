---
id: SPEC-ALE186-019
spec: specs/SPEC-ALE186-019-migraciones-schema.md
explica:
  - candado de sesion (pg_advisory_lock)
  - migracion de schema
  - transaccion explicita (begin commit rollback)
---

# SPEC-ALE186-019 — Migraciones del schema sin borrar datos

## Qué se construyó

Hasta ahora, para cambiar una tabla había que editar `context/lavanderia_schema.sql` y borrar
la base entera (`docker compose down -v`). Con los datos de las sucursales eso no se puede
hacer nunca. Desde esta spec, cada cambio es un archivo numerado en `backend/migraciones/`, y
`npm run migrar --workspace backend` lo aplica sobre la base que ya existe, sin tocar los
datos. Si a la base le falta alguna migración, el servidor no arranca y dice qué correr.

**Después de cada `git pull`: `npm run migrar --workspace backend`.**

## Cómo funciona, paso a paso

Alguien agrega `backend/migraciones/001_agregar_columna_revision.sql` y corre `npm run migrar`.

1. **El comando** (`backend/src/db/migrar.ts`) abre una conexión propia a la base
   (`pg.Client`, no el pool de la API) y llama a `migrar`.
2. **Primero la carpeta** (`leerMigraciones`, `backend/src/db/migraciones.ts:66`). Lista los
   `.sql`, los ordena y comprueba que cada nombre sea `NNN_nombre.sql` y que ningún número se
   repita. Si algo está mal, frena antes de tocar la base.
3. **El candado** (`:136`): `SELECT pg_advisory_lock(...)`. Si otro `migrar` está corriendo
   sobre la misma base, este se queda esperando acá.
4. **La tabla de control.** `migraciones_aplicadas` se crea si no existe. Las pendientes son
   las de la carpeta que no están anotadas ahí.
5. **Cada migración en su propia transacción** (`:149`): `BEGIN`, el SQL del archivo, el
   `INSERT` de su nombre en la tabla de control, `COMMIT`. Si el SQL falla, `ROLLBACK`: no
   queda nada de ella, ni su anotación, y `migrar` corta con `MigracionFallidaError` (`:157`),
   que dice qué archivo falló y qué dijo Postgres. Las anteriores quedaron confirmadas.
6. **Se suelta el candado**, pase lo que pase.

Cuando arranca el servidor, `server.ts:10` llama a `chequeoDeArranque` (`migraciones.ts:173`):
compara la carpeta con la tabla de control y, si falta alguna, termina con el mensaje. Si la
tabla todavía no existe (una base anterior a esta spec), `yaAplicadas` lo detecta por el
código de error `42P01` (`:109`) y cuenta todas como pendientes.

## Dónde encaja en la arquitectura

- **`src/db/` es la capa de la base** (§5): ahí estaban el pool y la semilla, y ahora el runner.
  No es un model: no lee ni escribe datos del negocio, cambia la forma de la base.
- **La línea base y las migraciones se suman.** Una base nueva carga la línea base (Docker, la
  primera vez) y después corre `migrar`. Una vieja solo corre `migrar`. Las dos terminan
  iguales, siempre que nadie edite la línea base: por eso dice "CONGELADA" en su cabecera.
- **La suite `test:db` usa el mismo runner** (`tests/db/preparar.ts`). Una migración que no
  aplica limpio sobre la línea base rompe la suite antes de llegar a desarrollo.

## Fundamentos

**Migración de schema.** El schema es la forma de la base: tablas, columnas, índices. Una
migración es un cambio a esa forma, escrito como un archivo que se aplica **una vez** y en un
**orden fijo**. El sistema tiene tres piezas, y las tres hacen falta:
- **Los archivos numerados:** el número fija el orden. La 002 puede suponer lo que hizo la 001.
- **La tabla de control:** cada base sabe qué tiene aplicado. Sin ella, correr todo de nuevo
  fallaría ("la columna ya existe") o, peor, duplicaría datos.
- **La regla de no editar lo aplicado:** si la 001 ya corrió en producción y alguien la
  cambia, producción nunca ve el cambio, porque la 001 figura como aplicada. Un error se
  corrige con una 002.

Es lo mismo que hacen herramientas como Flyway, Liquibase o `node-pg-migrate`. Acá el runner es
propio (unas 100 líneas sobre `pg`) para no sumar una dependencia y porque las migraciones son
SQL plano.

**Transacción explícita (`BEGIN` / `COMMIT` / `ROLLBACK`).** Hasta ahora el proyecto logró la
atomicidad metiendo todo en **una sola sentencia** (un CTE, SPEC-ALE186-006). Una migración no
cabe en una sentencia: puede ser un `CREATE TABLE`, un `UPDATE` que copia datos y un
`CREATE INDEX`, más el `INSERT` en la tabla de control. `BEGIN` abre una transacción: todo lo
que sigue, en **esa misma conexión**, queda en suspenso hasta el `COMMIT`, que lo confirma de
una vez, o el `ROLLBACK`, que lo descarta entero. Postgres permite hasta `CREATE TABLE` y
`ALTER TABLE` dentro de una transacción (no todas las bases lo hacen), así que una migración
que falla a la mitad no deja una tabla creada a medias. Lo prueba
`tests/db/migraciones.db.test.ts`, con un archivo cuya primera sentencia funciona y la segunda no.

**Candado de sesión (`pg_advisory_lock`).** Es un candado que Postgres guarda por número, no
por fila ni por tabla: sirve para coordinar procesos que se ponen de acuerdo en usar el mismo
número. El que lo pide primero lo obtiene; el siguiente que pide **el mismo** número espera
hasta que el primero lo suelte. Acá, con dos `migrar` a la vez (dos servidores arrancando, dos
personas en la misma base), el segundo espera, y cuando entra ve que no queda nada pendiente.
Es **de sesión**: lo tiene la conexión que lo pidió. Por eso `migrar` usa un `pg.Client`
propio y no el pool, que reparte las consultas entre varias conexiones: el candado quedaría en
una y las migraciones correrían en otra. El test de concurrencia
(`migraciones.db.test.ts:113`) lo prueba con una migración que tarda medio segundo.

**Ya explicado antes:**

- **Atomicidad de una sentencia** → SPEC-ALE186-006 (`specs/notas/SPEC-ALE186-006-entregas-api.md`): la de un solo statement; la de acá es la de varios.
- **Pool de conexiones** → SPEC-ALE186-001: por qué el candado no puede usar el pool.
- **Códigos de error de Postgres (SQLSTATE)** → SPEC-ALE186-003: el `42P01`.
- **Global setup** → SPEC-ALE186-007: dónde la suite aplica las migraciones.

## Decisiones y por qué

- **El servidor no aplica las migraciones solo.** Sería cómodo, pero un cambio de schema en
  producción tiene que ser una decisión de alguien, y dos servidores arrancando a la vez
  intentarían aplicarlas los dos. El candado lo resolvería, pero la decisión sigue siendo de
  una persona.
- **Una carpeta inválida no aplica nada**, ni siquiera las migraciones que estaban bien: un
  orden que nadie eligió es peor que no avanzar.
- **Las migraciones no llevan `BEGIN` ni `COMMIT` adentro:** el runner ya envuelve cada una.
  Está escrito en `backend/migraciones/README.md`.

## Los tests

- **Creado: `baseDescartable()`** en `backend/tests/helpers/baseDescartable.ts`. Crea una base
  propia en el mismo servidor (con o sin la línea base) y la borra al terminar. Las
  migraciones crean tablas y escriben la tabla de control; sobre la base compartida
  ensuciarían a los demás tests, que corren en paralelo. **La próxima spec (`deuda-schema`) lo
  va a usar** para probar sus migraciones con datos de verdad: cargar la línea base, meter
  filas "viejas", migrar y mirar que se hayan copiado bien.
- Cada test arma su propia carpeta de migraciones en el temporal del sistema (`mkdtemp`). Así
  prueba casos que nunca deberían existir en el repo: una migración rota, un nombre mal
  escrito, una que tarda.
- **Probado a mano también:** el servidor arranca con la base al día y termina con código 1 y
  el mensaje cuando falta una migración. `server.ts` no tiene test propio, y el mensaje sale
  de `chequeoDeArranque`, que sí lo tiene.
