---
id: SPEC-ALE186-007
spec: specs/SPEC-ALE186-007-tests-base-real.md
explica:
  - aislar los datos de prueba
  - global setup
  - nombres que no pueden ir como parametro
  - test de integracion
---

# SPEC-ALE186-007 — Tests contra una base real

## Qué se construyó

Una segunda suite de tests para el backend, que corre contra el Postgres de Docker en vez
de contra un doble. Se usa con `npm run test:db --workspace backend`. La suite de siempre
(`npm test`) no cambió: sigue corriendo sin Docker.

Lo primero que prueba es lo que en SPEC-ALE186-005 y 006 solo se había comprobado a mano:
que un cobro no se cuela sobre una orden que se está anulando, y que una entrega no deja una
orden ENTREGADO sin su entrega. Para las specs que vienen (estadísticas, auditoría) deja el
camino hecho.

## Cómo funciona, paso a paso

Sigamos qué pasa al escribir `npm run test:db` con Docker levantado.

1. **El script elige la otra configuración.** `backend/package.json:13` corre
   `vitest run --config vitest.db.config.ts`. Vitest no lee `vitest.config.ts` (la de
   siempre, que además excluye `tests/db/**` en su línea 9).

2. **La configuración decide a qué base conectarse.** `vitest.db.config.ts:11` llama a
   `entornoDePrueba()` (`tests/db/entorno.ts:36`). Esa función:
   - lee el `.env` de la raíz (`entorno.ts:16`), igual que el backend;
   - toma DATABASE_URL, por ejemplo `…/lavanderia`, y arma `…/lavanderia_test`
     (`entorno.ts:47`);
   - arma también la URL de `postgres`, la base de mantenimiento (`entorno.ts:56`).

3. **Antes de cualquier test, se recrea la base.** `vitest.db.config.ts:19` registra
   `tests/db/preparar.ts` como *global setup*. Vitest lo corre una vez
   (`preparar.ts:32`):
   - se conecta a `postgres`, con 5 segundos de límite (`:37`). Si Postgres no responde,
     corta la corrida con un mensaje en español que dice que hay que levantar Docker;
   - borra `lavanderia_test` y la vuelve a crear (`:47-48`);
   - le carga `context/lavanderia_schema.sql` entero (`:58`), el mismo que usa Docker.

4. **Los tests corren con la URL de la base de pruebas.**
   `vitest.db.config.ts:27` pone `DATABASE_URL` en `lavanderia_test` para los procesos que
   ejecutan los tests. El pool de la aplicación (`src/db/pool.ts:38`) se conecta a
   `config.databaseUrl` como siempre: **el código de `src/` no sabe que está en un test**,
   y por eso lo que se prueba es exactamente lo que corre en producción.

5. **Un test, por ejemplo la carrera de pagos** (`tests/db/pagos.db.test.ts:77`):
   - `escenario()` (`tests/helpers/baseReal.ts:76`) crea una sucursal, un empleado y un
     cliente de verdad, y `crearOrden` (`:87`) una orden en LISTO;
   - `mientrasSeAnula` (`:138`) abre **otra conexión**, empieza una transacción (`:144`) y
     pasa la orden a ANULADO **sin confirmar**;
   - con esa transacción abierta llama a `pagos.crear`, el model real. Espera medio segundo
     (`:155`) y anota si el cobro sigue esperando (`:156`);
   - confirma la anulación (`:158`), y recién ahí el cobro termina.
   El test exige que el cobro **haya esperado**, que termine en `orden-anulada` y que no
   haya ningún pago.

6. **Al terminar cada archivo**, `tests/db/alCerrar.ts` cierra el pool para no dejar
   conexiones colgadas en Postgres.

## Dónde encaja en la arquitectura

Ahora hay dos suites en el backend, con trabajos distintos. La regla está escrita en
CLAUDE.md, sección 4:

- **`npm test`, con dobles.** Prueba lo que se decide en TypeScript. Un test de controller
  reemplaza el model; un test de model reemplaza el pool y mira qué SQL arma. Es rápida, no
  necesita nada instalado y la corre todo el equipo, incluida quien solo toca el frontend.
- **`npm run test:db`, contra Postgres.** Prueba lo que solo la base puede garantizar.
  Llama a los **models** directamente, no a la API por HTTP. La capa HTTP ya está bien
  cubierta con dobles, y lo que estos tests buscan está debajo: en la sentencia SQL.

Lo que **no** le toca a la suite nueva: repetir lo que ya prueban los dobles. Si un caso se
puede probar sin base, va en `npm test`. Cada test de `tests/db/` tarda medio segundo o
más; uno de `tests/unit/`, milisegundos.

Las piezas de `tests/db/` (`entorno`, `preparar`, `alCerrar`) son infraestructura de la
suite, no tests. Los tests son los `*.db.test.ts`, que es lo que incluye la configuración
(`vitest.db.config.ts:16`).

## Fundamentos

### Test de integración

Un **test unitario** prueba una pieza aislada: lo que no es esa pieza se reemplaza por un
doble que responde lo que el test le dice. Un **test de integración** prueba varias piezas
reales juntas. Acá: el model, el driver `pg` y Postgres.

Los dos son necesarios porque cada uno ve lo que el otro no. El test unitario de pagos
(`tests/unit/pagos.model.test.ts`) comprueba que el SQL **contiene** `FOR SHARE`. No puede
comprobar que `FOR SHARE` frene una anulación, porque el doble del pool no tiene filas, ni
bloqueos, ni otra conexión. Solo devuelve lo que el test encoló. Si mañana alguien escribe
`FOR SHARE` en un lugar donde Postgres lo ignora, el unitario sigue en verde.

El de integración (`tests/db/pagos.db.test.ts:77`) no mira el SQL: abre una anulación real
y observa si el cobro espera. Se comprobó que sirve con una prueba de mutación: sin
`FOR SHARE`, ese test falla. Lo mismo con la atomicidad de la entrega: con
`ON CONFLICT DO NOTHING` agregado, `tests/db/entregas.db.test.ts:54` falla mostrando la
orden en ENTREGADO.

El costo es que necesita Docker y es más lenta. Por eso va en una suite aparte y no
reemplaza a la otra.

### Aislar los datos de prueba: una base que se recrea

Un test que escribe en una base comparte estado con todo lo que haya ahí. Si se usara la
base de desarrollo:
- los tests verían las órdenes que uno cargó a mano y podrían chocar con ellas (una boleta
  repetida, un teléfono ya usado);
- dejarían basura que después aparece en la app;
- una corrida cortada a la mitad dejaría datos que hacen fallar la siguiente.

Las soluciones habituales son tres. Esta spec eligió la tercera:

1. **Envolver cada test en una transacción y deshacerla al final.** Es la más rápida, pero
   no sirve acá: la prueba de una carrera necesita **dos conexiones** y datos
   **confirmados**, y lo que hace una transacción sin confirmar no lo ve ninguna otra
   conexión.
2. **Borrar lo que cada test creó.** Es frágil: si el test falla a la mitad, el borrado
   puede no correr, y hay que acordarse de borrar en el orden correcto de las claves
   foráneas.
3. **Una base propia, recreada desde el schema en cada corrida** (`tests/db/preparar.ts`).
   Arranca siempre vacía y con el schema **actual**, y la de desarrollo no recibe ni una
   conexión.

Dentro de una corrida, los tests no se pisan porque `baseReal.ts` crea todo con valores
únicos nuevos: cada test tiene su propia sucursal, así que sus boletas no pueden chocar
con las de otro, aunque corran en paralelo.

### Global setup

Vitest corre cada archivo de test en un proceso de trabajo (*worker*), y varios en
paralelo. Un **global setup** (`globalSetup`, `vitest.db.config.ts:19`) es código que corre
**una sola vez**, en el proceso principal, antes de que arranque cualquier worker. Es el
lugar para preparar algo que comparte toda la corrida, como la base de pruebas.

No sirve un `beforeAll` dentro de un test: correría una vez **por archivo**, y dos archivos
en paralelo se borrarían la base el uno al otro.

Lo opuesto es `setupFiles` (`:21`): corre **en cada archivo**, dentro de su worker. Por eso
el cierre del pool va ahí (`tests/db/alCerrar.ts`), porque cada archivo tiene su propio
pool.

### Nombres que no pueden ir como parámetro

El proyecto tiene una regla firme: nunca concatenar valores en una consulta, siempre `$1`
(CLAUDE.md, sección 5). Pero `DROP DATABASE $1` no existe: los parámetros sirven para
**valores** (un id, un monto), no para **nombres** (de una base, una tabla o una columna).
El nombre tiene que ir escrito en el texto del SQL (`preparar.ts:47`).

Cuando eso es inevitable, la defensa es no dejar pasar nada que no sea un nombre. Por eso
`entorno.ts:25` acepta solo letras, números y guion bajo, y rechaza cualquier otro
carácter antes de que llegue al SQL. Sin esa validación, un DATABASE_URL raro podría
terminar ejecutando algo más que un `DROP`. Es la misma idea de la "lista blanca" del
UPDATE dinámico de SPEC-ALE186-003: lo que no se puede parametrizar, se elige de un
conjunto cerrado.

**Ya explicado antes:**

- **Dobles de prueba (mocks)** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **A qué altura va el doble de prueba** y **UPDATE dinámico con lista blanca** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)
- **Bloqueo de fila (FOR SHARE)** → SPEC-ALE186-005 (`specs/notas/SPEC-ALE186-005-pagos-api.md`)
- **Atomicidad de una sentencia** → SPEC-ALE186-006 (`specs/notas/SPEC-ALE186-006-entregas-api.md`)
- **Factory de datos de prueba** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)

## Decisiones y por qué

- **Suite aparte y no un flag dentro de `npm test`.** Si `npm test` necesitara Docker,
  quien trabaja solo en el frontend tendría que levantarlo para correr la suite desde la
  raíz, o se acostumbraría a ver tests en rojo "porque no hay base". Un test que falla
  siempre por el entorno es un test que nadie mira.
- **El nombre de la base sale de DATABASE_URL** (`<nombre>_test`) y no de una variable nueva
  en el `.env`. Una variable más es una más que configurar en cada máquina y que puede
  quedar desactualizada. Así, si a alguien ya le funciona `npm run dev`, le funciona
  `test:db`.
- **Los tests llaman a los models, no a la API.** La parte HTTP ya está cubierta con
  dobles. Pasar por HTTP solo sumaría lentitud y la necesidad de tokens, sin probar nada
  nuevo de la base.
- **Medio segundo para decidir que algo "esperó"** (`baseReal.ts`, `ESPERA_PARA_DECIDIR_MS`).
  Si un cobro no esperó, termina en milisegundos, y medio segundo deja mucho margen. Si
  algún día da falsos positivos en una máquina lenta, ese es el número a subir.
- **El `package-lock.json` no viaja en este PR.** `npm install` lo había modificado
  (solo marcas `"peer"`, sin cambios de versión) y se descartó: no era parte de la spec.

## Los tests

- **Creado:** `tests/helpers/baseReal.ts`. Es el equivalente "de verdad" de las factories
  en memoria. Las de `ordenes.ts` o `pagos.ts` arman un objeto; estas insertan una fila. La
  pieza que más se va a reusar es `escenario()`, porque casi todo necesita una sucursal, un
  empleado y un cliente. La que no tenía equivalente es `mientrasSeAnula`, que convierte
  una prueba de concurrencia en una línea. Las estadísticas la van a usar así:

  ```ts
  const esc = await escenario();
  await crearOrden(esc, { precioTotal: '30.00' });
  await crearOrden(esc, { precioTotal: '15.50', estado: 'ANULADO' });
  // … y comprobar que la suma de ingresos de esa sucursal da lo que tiene que dar.
  ```

- **Reusados:** ninguno de los helpers existentes servía tal cual, porque todos están
  pensados para dobles. Los tests nuevos sí usan los models reales (`pagos.crear`,
  `entregas.crear`) sin tocarlos.
- **Verificado además, a mano:**
  - dos corridas seguidas pasan sin limpiar nada;
  - la base de desarrollo tiene las mismas filas antes y después;
  - sin Postgres, la corrida corta al empezar con el mensaje en español (`ECONNREFUSED` en
    el detalle);
  - `npm test` sigue con sus 338 tests y no incluye ninguno de `tests/db/`.

## Si mañana tenés que tocar esto

- **Para agregar un test contra la base:** creá `tests/db/<cosa>.db.test.ts`. El sufijo
  `.db.test.ts` es lo que lo mete en esta suite. Armá los datos con `baseReal.ts`, y
  etiquetá el `describe` con el id de tu spec.
- **Si cambia el schema**, no hay que hacer nada: la próxima corrida lo carga.
- **Si `test:db` falla al empezar**, leé el mensaje. Casi siempre es Docker apagado, o el
  puerto de CLAUDE.md §13: si `localhost:5432` es un Postgres de Windows, la base de
  pruebas se crearía **ahí**. Revisá `docker port lavanderia-postgres`.
- **No uses `beforeAll` para preparar la base.** Eso va en `preparar.ts`; el porqué está
  arriba, en "Global setup".
