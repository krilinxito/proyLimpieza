---
id: SPEC-001
spec: specs/SPEC-001-backend-bootstrap.md
explica: []
---

# SPEC-001 — Esqueleto del backend y dependencias

## Qué se construyó

El backend todavía no hace nada del negocio: no sabe qué es una orden ni quién es un
cliente. Lo que hay ahora es el local vacío con la luz encendida — el servidor arranca,
contesta, se conecta a la base y avisa cuando no puede.

Lo importante de esta spec no es lo que hace, sino las tres decisiones que deja fijadas y
que todas las specs siguientes van a copiar sin volver a discutirlas: **cómo se responde un
error**, **cómo cruza el dinero la frontera de la base** y **dónde va cada archivo**.

## Cómo funciona, paso a paso

Seguimos una petición real: alguien abre `http://localhost:4000/api/health`.

**1. Antes de que exista el servidor, se lee el entorno.**
`src/server.ts:2` importa `createApp`, y esa cadena de imports termina llegando a
`src/config.ts:46`, donde se ejecuta `readConfig(process.env)`. Eso pasa **al importar el
módulo**, no cuando llega la petición: si falta `DATABASE_URL`, el proceso muere ahí mismo
con un mensaje que dice qué hacer (`src/config.ts:31`). Es a propósito. Un servidor que
arranca sin saber a qué base conectarse solo falla más tarde y peor, en medio de un
mostrador con gente esperando.

El `.env` que lee está en la **raíz del repositorio**, no en `backend/` — mirá el
`path.resolve(currentDir, '../../.env')` de `src/config.ts:12`. Es el mismo archivo que usan
`docker-compose.yaml` y el frontend.

**2. Se arma la aplicación.**
`src/app.ts:12` construye la app Express y le va enchufando piezas en orden:
`cors()`, `express.json()`, el router de la API en `/api`, y al final las dos piezas de
error. Ese orden **es** el comportamiento, no un detalle de estilo — lo explicamos abajo en
Fundamentos.

**3. La ruta.**
`/api/health` entra por `src/routes/index.ts:11` (`apiRouter.use('/health', healthRouter)`)
y de ahí a `src/routes/health.routes.ts`, que solo dice "un GET en `/` lo atiende
`getHealth`". Los archivos de rutas no tienen lógica: son el índice del libro, no el libro.

**4. El controller orquesta.**
`src/controllers/health.controller.ts:7` pregunta `await estaDisponible()`. No sabe SQL, no
sabe qué es un pool: solo sabe a quién preguntarle y qué responder según la respuesta.

**5. El model habla con la base.**
`src/models/health.model.ts:14` ejecuta `SELECT 1` contra el pool. Es la consulta más barata
posible: no lee ninguna tabla, así que lo único que comprueba es lo que nos importa —que hay
una conexión viva y que Postgres contesta.

**6. La respuesta.**
Si la base contestó, el controller devuelve `{ estado: 'ok', baseDeDatos: 'conectada' }` con
200. Si no, **lanza** un `ApiError` de 503 (`src/controllers/health.controller.ts:11`). No
arma la respuesta de error él mismo: la lanza y sigue de largo.

**7. Quién recoge lo lanzado.**
El `throw` sube por la cadena hasta `errorHandler` (`src/middleware/errorHandler.ts:26`),
que lo traduce a JSON con el formato uniforme. Si el error era un `ApiError`, respeta su
status y su código; si era cualquier otra cosa —un `TypeError`, un fallo de `pg`—, lo
registra en el log del servidor y al cliente le manda un 500 genérico, **nunca** el stack.

El recorrido completo, en una línea:

```
server.ts → app.ts → routes/index.ts → routes/health.routes.ts
          → controllers/health.controller.ts → models/health.model.ts → db/pool.ts → Postgres
                                            ↘ (si falla) middleware/errorHandler.ts
```

## Dónde encaja en la arquitectura

El `CLAUDE.md` (sección 5) declara MVC estricto con dos reglas, y esta spec las materializa
por primera vez para que las siguientes tengan de dónde copiar:

| Capa | Su trabajo | Lo que NO le toca |
|---|---|---|
| `routes/` | Declarar endpoints y su middleware | Cualquier lógica |
| `controllers/` | Validar entrada, llamar models, armar la respuesta HTTP | **Escribir SQL** |
| `models/` | Acceso a datos, SQL parametrizado | **Tocar `req` o `res`** |
| `services/` | Lógica que no cabe en un solo model | (vacía todavía) |
| `middleware/` | Lo transversal: errores, y más adelante auth | Conocer un recurso concreto |
| `db/` | El pool y la frontera de tipos con Postgres | Lógica de negocio |
| `utils/` | Helpers puros y compartidos | Depender de Express o de `pg` |

**Qué se rompe si se saltan.** Un model que recibe `req` deja de poder testearse sin
levantar un servidor entero, y deja de poder reusarse desde un service o desde un script.
Un controller con SQL adentro esconde una consulta donde nadie la busca, y el día que haya
que cambiarla aparecen tres copias distintas. No son reglas de gusto: son las que hacen que
un test como `tests/unit/config.test.ts` pueda existir en tres líneas.

Una pieza aparte: **`app.ts` está separado de `server.ts`** a propósito. `app.ts` arma la
aplicación y la devuelve; `server.ts` es el único que llama a `listen()`. Por eso los tests
pueden pedir una app entera y hacerle peticiones **sin ocupar ningún puerto** — mirá
`tests/helpers/api.ts`. Si estuviera todo junto, cada test tendría que levantar un servidor
real y pelearse por el 4000.

## Fundamentos

### Middleware, y por qué el orden es el comportamiento

Express atiende una petición pasándola por una **fila de funciones**, en el orden en que se
registraron con `app.use()`. Cada una puede responder y cortar la fila, o dejarla pasar a la
siguiente. Eso es un middleware: una función que se mete en medio del camino.

En `src/app.ts:12` la fila termina así:

```ts
app.use('/api', apiRouter);   // ¿alguna ruta contesta?
app.use(notFoundHandler);     // nadie contestó → 404
app.use(errorHandler);        // alguien lanzó un error → respuesta uniforme
```

Si pusieras `notFoundHandler` **antes** del router, todas las peticiones serían 404: la fila
se cortaría antes de llegar a las rutas. No hay ninguna configuración que arregle eso; el
orden de las líneas es la configuración.

### El manejador de errores tiene cuatro parámetros, y no es un capricho

`errorHandler` (`src/middleware/errorHandler.ts:26`) recibe `(err, req, res, next)`. Un
middleware normal recibe `(req, res, next)`. Express **cuenta los argumentos de la función**
para saber cuál es cuál: con tres sería un middleware más y los errores quedarían sin
atender, sin ningún aviso.

Por eso el cuarto parámetro está declarado como `_next` aunque no se use: sacarlo rompería
el manejo de errores entero.

### `throw` en vez de armar la respuesta de error a mano

El controller no escribe la respuesta de error: lanza un `ApiError`
(`src/utils/ApiError.ts:39`) y se olvida. Un solo lugar —el `errorHandler`— decide cómo se
ve un error en toda la API.

La alternativa sería que cada controller hiciera su `res.status(409).json({...})`. Con tres
recursos ya habría tres formatos ligeramente distintos, y el frontend necesitaría un `if`
por endpoint. El formato uniforme de la sección 10 del `CLAUDE.md` solo se sostiene si hay
un único sitio que lo escribe.

El shape tiene dos campos con dos públicos distintos, y conviene no mezclarlos:

```json
{ "error": { "codigo": "BOLETA_DUPLICADA", "mensaje": "Ese número ya está usado..." } }
```

- **`codigo`** es para el código del frontend. Estable, en mayúsculas, no se traduce ni se
  muestra. Es lo que permitirá distinguir un choque de número de boleta de cualquier otro
  conflicto sin leer el texto.
- **`mensaje`** es para la persona del mostrador. Sección 9: en español, sin códigos, y
  diciendo qué hacer. Se muestra tal cual.

### Pool de conexiones

Abrir una conexión a Postgres cuesta milisegundos y memoria en el servidor. Si cada consulta
abriera la suya, la base se ahogaría con veinte personas usando el sistema.

Un **pool** mantiene unas pocas conexiones abiertas y las presta: `pool.query(...)` toma una
libre, la usa y la devuelve. Se crea **una sola vez** para todo el proceso
(`src/db/pool.ts:29`) y todos los models importan esa misma. Crear un `Pool` por consulta es
peor que no tener pool.

### La frontera de tipos con la base: `setTypeParser`

Postgres manda todo por el cable como texto, y la librería `pg` lo convierte a tipos de
JavaScript. Esas conversiones se pueden cambiar, y `src/db/pool.ts:21` cambia dos:

- **`NUMERIC` → string.** Es dinero. Convertirlo a `number` sería meterlo en punto flotante,
  que es exactamente lo que el proyecto prohíbe (ver abajo).
- **`DATE` → string `'YYYY-MM-DD'`.** Por defecto `pg` devuelve un objeto `Date` en la zona
  horaria del servidor, y una fecha **sin hora** que pasa por una zona horaria se corre un
  día. `fecha_estimada_salida` es un `DATE`: que llegue tal cual está escrito.

El primero coincide con el comportamiento por defecto de `pg`. Está escrito igual: una
decisión escrita se puede leer y discutir, una heredada se cambia sin que nadie se entere.

### El dinero no se toca con floats

El `number` de JavaScript es punto flotante binario, y no puede representar `0.1` exacto:

```js
0.1 + 0.2 === 0.30000000000000004   // true
```

Da igual que el error sea diminuto. Sumado sobre miles de pagos, el saldo de una orden deja
de cuadrar y nadie sabe por qué. La solución de siempre en contabilidad es trabajar con la
unidad más chica —el **centavo**— como número **entero**: los enteros en JS son exactos
hasta 9.007.199.254.740.991, y el máximo de un `NUMERIC(10,2)` son 9.999.999.999 centavos.
Entra de sobra.

Eso es todo `src/utils/money.ts`: `parse('12.50') → 1250`, se suma con enteros, y
`formatear(1250) → '12.50'` a la vuelta.

Un detalle deliberado: `parse` **rechaza** `'0.30000000000000004'`
(`src/utils/money.ts:36`). Si un float se coló en algún lado, es mejor un error ruidoso en
el momento que un descuadre silencioso tres semanas después.

### Módulos ESM y la extensión `.js` en los imports

Vas a ver `import { createApp } from './app.js'` en un archivo `.ts` donde el archivo
vecino es `app.ts`. No es un error.

Node ejecuta módulos ESM y exige la extensión en los imports relativos. TypeScript no
reescribe rutas: compila `app.ts` a `app.js`, así que la ruta que hay que escribir es la del
**resultado**, no la del fuente. Es lo que configura `"module": "NodeNext"` en
`backend/tsconfig.json`, y es lo que hace que el mismo código corra con `tsx`, con `vitest` y
con `node dist/` sin trucos distintos para cada uno.

Regla práctica: **imports relativos siempre terminan en `.js`**; los paquetes de
`node_modules` (`express`, `pg`) van sin extensión, como siempre.

### Workspaces de npm

El `package.json` de la raíz no tiene código: declara `"workspaces": ["backend"]`. npm trata
las subcarpetas como paquetes de un mismo proyecto, instala todo con un `npm install` desde
la raíz y deja un solo `node_modules` compartido.

Lo que gana el equipo es que `npm test` desde la raíz corre la suite completa
(`npm run test --workspaces --if-present`). Cuando exista `frontend/`, se agrega a esa lista
y `npm test` lo incluye sin tocar nada más — el `--if-present` está justamente para que la
raíz no falle mientras un workspace todavía no tiene ese script.

### Dobles de prueba (mocks)

`tests/http/health.test.ts` prueba el controller **sin Postgres levantado**: reemplaza el
model entero por una función falsa que devuelve lo que el test decida.

```ts
vi.mock('../../src/models/health.model.js', () => ({ estaDisponible: vi.fn() }));
```

La pregunta que responde ese test es "¿qué contesta el controller si la base está caída?", y
para eso apagar Postgres de verdad sería absurdo. **Se sustituye la pieza vecina para poder
provocar la situación que se quiere probar.** Es lo que hace que la suite corra en cualquier
máquina, en cualquier orden y en segundos.

Que esto sea posible es consecuencia directa de la regla de arquitectura: el model se puede
reemplazar porque el controller solo lo conoce por su función, no por el pool ni por el SQL.

### Funciones puras para lo que hay que testear

`readConfig(env)` (`src/config.ts:27`) recibe el entorno **como argumento** en vez de leer
`process.env` por dentro. Por eso `tests/unit/config.test.ts` puede pasarle `{}` y comprobar
el mensaje de error en una línea, sin ensuciar el proceso ni reimportar módulos.

Es un patrón que conviene repetir: **lo que hay que testear, que reciba lo que necesita en
vez de ir a buscarlo.** La línea siguiente, `export const config = readConfig(process.env)`,
es la que va a buscarlo — una sola vez, en el borde.

**Ya explicado antes:**

Nada: es la primera bitácora del proyecto.

## Decisiones y por qué

**ESLint además de `tsc`.** El criterio 5 pide que un `any` explícito rompa la verificación,
y **`tsc` no puede hacer eso**: `strict` impide que el compilador *infiera* `any`, pero no
existe ninguna opción que prohíba escribirlo. Esa mitad la sostiene la regla
`@typescript-eslint/no-explicit-any` en `backend/eslint.config.js`. Las dos cosas juntas son
`npm run check`.

**Postgres decide el estado, no un `if` en el controller.** El health check pregunta a la
base de verdad (`SELECT 1`) en vez de responder "ok" siempre. Un endpoint de salud que no
comprueba nada es peor que no tenerlo: da una respuesta tranquilizadora y falsa.

**503 y no 500 cuando la base no responde.** 500 dice "el servidor está roto"; 503 dice "no
disponible ahora mismo". Es la diferencia entre un bug y una base apagada, y quien mira los
logs a las siete de la tarde agradece la distinción.

**`nodemon` sobre `tsx`, no `tsx watch`.** El `CLAUDE.md` (sección 4) especifica nodemon en
`npm run dev`. Se respeta, con `tsx` como ejecutor por debajo (`backend/nodemon.json`):
nodemon vigila y reinicia, tsx entiende TypeScript. `tsx watch` solo habría hecho lo mismo
con una pieza menos, pero no valía la pena contradecir una convención escrita por eso.

**El `.env` sigue siendo uno solo, en la raíz.** La alternativa era un `backend/.env`
propio. Tres copias del mismo secreto JWT es la forma más rápida de que dejen de coincidir
—y si el del backend y el de PowerSync se separan, los tokens dejan de validar sin ningún
mensaje que lo explique.

## Los tests

No había ninguno: este es el primer test del proyecto. Así que en vez de escribir cuatro
tests sueltos, se creó **`backend/tests/helpers/api.ts`**, que es lo que va a reusar cada
spec de aquí en adelante:

- **`testApi()`** — un cliente HTTP contra la app real, sin abrir ningún puerto. El punto de
  partida de cualquier test de endpoint.
- **`expectApiError(res, { status, codigo })`** — comprueba de una sola vez que una
  respuesta de error cumple el formato uniforme: el status, el `codigo`, que haya un
  `mensaje` de texto, y que **no haya nada más** (ni stack, ni nombres de tablas). Es el
  guardián del contrato de la sección 10, y evita que cada spec reescriba las mismas cuatro
  aserciones con criterios ligeramente distintos.
- **`appThatThrows(error)`** — una app mínima cuya única ruta lanza el error que le pases,
  para probar el manejador central sin depender de ningún endpoint real.

Así lo va a usar la spec de órdenes, sin escribir nada nuevo:

```ts
const res = await testApi().post('/api/ordenes').send({ numero_boleta: '001234' });
expectApiError(res, { status: 409, codigo: 'BOLETA_DUPLICADA' });
```

También hay un test poco habitual, `tests/unit/estructura.test.ts`, que comprueba que las
siete carpetas de la sección 5 existen y que `routes/index.ts` deja previstos los recursos
siguientes. Testear carpetas suena raro, pero la separación por capas es una decisión de
arquitectura: si alguien borra `services/` conviene que salte en la suite y no en una
revisión de PR.

## Si mañana tenés que tocar esto

Empezá por `src/app.ts`: en doce líneas se ve el orden completo de la fila de middlewares, y
desde ahí se navega a cualquier pieza.

Tres cuidados:

1. **El orden de `app.use()`** en `app.ts`. El 404 y el `errorHandler` van siempre al final,
   en ese orden. Meter algo después del `errorHandler` es meterlo donde nunca se ejecuta.
2. **Los cuatro parámetros del `errorHandler`.** Quitar `_next` porque "no se usa" apaga el
   manejo de errores de toda la API sin ningún aviso.
3. **Nunca `Number()` sobre un monto.** Todo lo que venga de una columna `NUMERIC` pasa por
   `utils/money.ts`. Si te hace falta una operación nueva sobre dinero, va ahí adentro, no en
   el controller que la necesitó.

Para agregar un recurso nuevo: una línea en `src/routes/index.ts` (ya está el hueco
comentado), su `*.routes.ts`, su `*.controller.ts` y su `*.model.ts`. Y el test, con
`testApi()`.

**Si `/api/health` te da 503 y jurarías que Postgres está arriba**, mirá esto antes que
nada:

```
docker port lavanderia-postgres
```

Si no lista nada, el contenedor **no está publicando el puerto** aunque `docker ps` lo
muestre `healthy`. Pasa cuando hay un Postgres instalado en Windows ocupando el 5432:
Docker no da error, pero `localhost:5432` es el Postgres nativo y el backend termina
hablando con la base equivocada. Se arregla moviendo `POSTGRES_PORT` y el puerto de
`DATABASE_URL` a uno libre (5434) y recreando con
`docker compose up -d --force-recreate postgres`. Está anotado en la sección 13 del
`CLAUDE.md`.
