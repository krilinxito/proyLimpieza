---
id: SPEC-ALE186-022
spec: specs/SPEC-ALE186-022-bcrypt-costo-tests.md
explica:
  - default que falla hacia lo seguro
  - recargar un modulo con otra configuracion en un test (resetModules y doMock)
  - test intermitente (flaky) y como diagnosticarlo
---

# SPEC-ALE186-022 — bcrypt con costo bajo solo en los tests

## Qué se construyó

Para el negocio, nada cambia. Las contraseñas de verdad se siguen guardando con bcrypt costo
10, igual que antes. Lo que cambió:

- **El costo vive en un solo lugar** (`backend/src/utils/contrasenas.ts`). Antes estaba
  escrito dos veces, en el alta de usuarios y en la semilla del admin.
- **En los tests, el costo baja a 4.** Cada login de prueba pasa de ~51 ms a ~1 ms.
- **El hash señuelo del login** se arma con el mismo costo que los hashes reales.

Y una lección de diagnóstico, que es lo más valioso de esta spec. Está más abajo, en
"Un test intermitente: cómo se diagnosticó (y en qué nos equivocamos)".

## Cómo funciona, paso a paso

**Al arrancar el proceso**, se carga `utils/contrasenas.ts`:

1. `costeBcrypt(config.nodeEnv)` (`contrasenas.ts:30`) decide el costo. Da 4 solo si
   `NODE_ENV` es exactamente `"test"`, y 10 en cualquier otro caso: `production`,
   `development`, vacío, sin definir, o un typo como `"Test"`. Las configs de Vitest
   (`vitest.config.ts`, `vitest.db.config.ts`) son las únicas que ponen `test`.
2. El resultado queda en `COSTE_BCRYPT` (`contrasenas.ts:34`), una sola vez por proceso.
3. Con ese costo se arma `HASH_SENUELO` (`contrasenas.ts:48`), el hash de un texto al azar
   que nadie conoce. Se usa `hashSync` porque pasa una sola vez, al arrancar; en producción
   cuesta unos 50 ms.

**Un admin da de alta a una empleada** (`POST /api/usuarios`):

4. El controller valida y llama a `hashearContrasena(contrasena)`
   (`backend/src/controllers/usuarios.controller.ts:178`), que hace
   `bcrypt.hash(contrasena, COSTE_BCRYPT)`.
5. Lo que se guarda en `usuarios.password_hash` lleva el costo escrito adentro: `$2b$10$…`
   en producción, `$2b$04$…` en los tests.

**Ella entra** (`POST /api/auth/login`):

6. `verificarContrasena` (`backend/src/controllers/auth.controller.ts:39`) llama a
   `bcrypt.compare(contrasena, hash ?? HASH_SENUELO)`. `compare` **lee el costo del hash
   guardado**, no el del servidor. Por eso una cuenta guardada con costo 10 entra igual en un
   servidor que corre con 4, y bajar o subir el costo nunca deja a nadie afuera: solo afecta
   a las contraseñas que se guarden de ahí en adelante.
7. Si el usuario no existe, compara contra el señuelo y descarta el resultado. Como el
   señuelo tiene el mismo costo que los hashes reales, "no existe" tarda lo mismo que
   "contraseña equivocada", y el tiempo de respuesta no delata quién tiene cuenta.

## Dónde encaja en la arquitectura

- **`utils/contrasenas.ts`** es un helper compartido (CLAUDE.md §5: `utils/` es para
  helpers). Lo usan dos controllers y la semilla, y ninguno de los tres sabe qué costo hay.
  Si cada uno escribiera su costo, tarde o temprano dos cuentas quedarían con costos
  distintos sin que nadie lo decidiera.
- **No toca `req` ni `res`, ni SQL.** Recibe una contraseña y devuelve un hash; guardarlo
  es trabajo del model.
- **Lee el entorno a través de `config`** (`backend/src/config.ts`), que es el único lugar
  que lee `process.env`. Por eso el test de "producción" puede reemplazar la config sin
  tocar el proceso (ver Fundamentos).

## Fundamentos

### Un default que falla hacia lo seguro

`costeBcrypt` no pregunta "¿es producción?", sino "¿es exactamente un test?". Parece lo
mismo y no lo es:

- Si preguntara `nodeEnv === 'production' ? 10 : 4`, un servidor desplegado sin
  `NODE_ENV`, o con `NODE_ENV=prod`, guardaría todas las contraseñas con costo 4 sin que nadie
  lo notara. Ese error sale **barato en seguridad**: hashes 64 veces más fáciles de atacar.
- Preguntando por `test` exacto, cualquier error de configuración da costo 10. El peor caso
  es que unos tests vayan más lentos. Ese error sale **caro en tiempo**, que se nota y se
  arregla.

La regla general: cuando una opción relaja una protección, que se active solo con un valor
explícito y exacto, y que todo lo demás caiga en lo protegido. El test
`tests/unit/contrasenas.test.ts` recorre a propósito los valores que podrían colarse:
`'Test'`, `'testing'`, `' test'`, `''` y `undefined`.

### Volver a cargar un módulo con otra configuración, en un test

`COSTE_BCRYPT` y `HASH_SENUELO` se calculan **al cargar** el módulo. Bajo Vitest valen 4. ¿Cómo
se prueba que en producción valen 10, sin desplegar nada? Con dos herramientas de Vitest
(`tests/unit/contrasenas.test.ts`, el último test):

1. `vi.resetModules()` vacía la caché de módulos: el próximo `import` vuelve a ejecutar el
   archivo desde cero.
2. `vi.doMock('../../src/config.js', …)` hace que ese nuevo import reciba una config de
   mentira con `nodeEnv: 'production'`.

El módulo se vuelve a cargar "creyendo" que está en producción, y el test mira el prefijo de
sus hashes (`$2b$10$`). Así no hace falta medir tiempos, que dependen de la máquina: el
costo está escrito en el propio hash, y es exacto. El `afterEach` deshace las dos cosas, para
que el resto de los tests no herede la config falsa.

### Un test intermitente: cómo se diagnosticó (y en qué nos equivocamos)

Un test **intermitente** (*flaky*) es el que a veces pasa y a veces falla sin que cambie el
código. Es peor que no tener el test: a la quinta vez que falla "por nada", el equipo deja de
creerle, y el día que falle por un error real nadie lo va a mirar.

El recorrido de esta spec, tal como fue:

1. En el `/spec-finish` de la SPEC-ALE186-021 falló un test de login de la base real. Solo,
   pasaba.
2. **Primera hipótesis: bcrypt.** Para reproducirlo, se corrió `test:db` mientras corrían
   los tests del frontend. Falló seguido, y los tests que fallaban hacían logins: tenía
   sentido. Esta spec se escribió sobre esa hipótesis.
3. **Se implementó, y bajo la misma carga siguió fallando**, ahora en un test que solo hace
   3 operaciones bcrypt (unos 150 ms) y que tardó más de 15 s. Eso bcrypt no lo explica.
4. **Se miró dónde se iba el tiempo.** Vitest imprime el desglose al final:
   `transform 160s, collect 813s, tests 238s`. El tiempo no se iba en los tests: se iba en
   **cargar y compilar los archivos**. Todo estaba lento por igual, porque las dos suites de
   Vitest juntas saturaban la CPU, y Postgres en Docker competía por la misma CPU.
5. **Se midió el caso que importa:** `test:db` sola, 6 veces seguidas. Pasó 6 de 6, en ~15 s.

La lección: **la forma de reproducir un problema puede crear otro.** "Correr las dos suites
juntas" producía timeouts por una razón distinta a la del fallo original, y la hipótesis se
"confirmó" con datos de un experimento que medía otra cosa. Lo que la desmontó fueron dos
preguntas:

- **¿El síntoma tiene el tamaño de la causa?** 150 ms de trabajo no pueden tardar 15 s.
- **¿Dónde se va el tiempo de verdad?** El desglose de Vitest.

Por eso el criterio 6 se reescribió: mide `test:db` sola, y CLAUDE.md §4 dice que no se corre
junto a otra suite.

La causa exacta del primer fallo, el del paso 1, no quedó confirmada. Esa vez no corrían dos
suites juntas, y lo más probable es que la máquina estuviera ocupada con otra cosa. Si vuelve
a pasar con `test:db` sola, ese es el momento de investigarlo de nuevo, con el desglose de
Vitest en la mano.

**Ya explicado antes:**

- **Hash de contraseña con bcrypt** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Límite de 72 bytes de bcrypt** → SPEC-ALE186-009 (`specs/notas/SPEC-ALE186-009-usuarios-admin.md`)
- **Dobles de prueba (mocks)** → SPEC-ALE186-001; **mock parcial de un módulo** → SPEC-ALE186-003

## Decisiones y por qué

- **Costo 4 y no "sin bcrypt" en los tests.** Saltarse bcrypt haría que los tests de login
  probaran otro código que el de producción. Con costo 4 corre exactamente el mismo camino;
  solo cambia cuántas vueltas da.
- **El señuelo se genera al arrancar**, en vez de ser un hash fijo escrito en el código.
  Escrito a mano, su costo quedaba desatado del de los hashes reales (estaba fijo en 10), y
  bajo los tests la protección de tiempos dejaba de ser cierta.
- **No se limitó el paralelismo de `test:db`.** Atacaría la saturación de una situación que
  no es la de uso normal, a cambio de una suite más lenta siempre.

## Los tests

- **Unitarios** (`tests/unit/contrasenas.test.ts`):
  - el costo para cada `NODE_ENV`, incluidos los valores que podrían colarse;
  - el costo de los hashes y del señuelo bajo Vitest;
  - y "en producción", recargando el módulo con otra config.
- **Contra la base real** (`tests/db/contrasenas.db.test.ts`):
  - lo que guarda la API en los tests tiene costo 4;
  - una cuenta con costo 10 sembrada a mano entra igual;
  - un usuario inexistente recibe el mismo 401 que una contraseña equivocada.
- **Reusados:** `crearUsuario`, `crearSucursal` (`baseReal.ts`), `comoAdmin` y
  `cuerpoDeAltaUsuario` (`helpers/usuarios.ts`). No hizo falta ningún helper nuevo.
- **Verificación a mano (criterio 6):** `npm run test:db` sola, 6 corridas seguidas el
  2026-10-11: 120/120 cada vez, entre 15 y 18 s, sin timeouts.

## Si mañana tenés que tocar esto

- Para hashear una contraseña nueva en cualquier lugar: `hashearContrasena`. Nunca
  `bcrypt.hash` con un número escrito a mano.
- Subir el costo de producción (por ejemplo a 12, si los servidores son más rápidos) es
  cambiar `COSTE_PRODUCCION`. Las cuentas existentes siguen entrando con su costo viejo; las
  contraseñas nuevas y las cambiadas quedan con el nuevo.
- Si un test de `test:db` falla por tiempo: primero, qué más corría en la máquina; segundo, el
  desglose `transform / collect / tests` que imprime Vitest.
