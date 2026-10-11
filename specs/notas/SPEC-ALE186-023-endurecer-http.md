---
id: SPEC-ALE186-023
spec: specs/SPEC-ALE186-023-endurecer-http.md
explica:
  - auditar dependencias (produccion contra desarrollo
  - cabeceras de seguridad (helmet)
  - cors (politica del mismo origen)
  - datos personales en los logs (lista blanca de campos)
  - parche contra mayor)
  - tiempo limite de una consulta (statement_timeout)
---

# SPEC-ALE186-023 — Endurecer la API HTTP antes de producción

## Qué se construyó

Para quien usa la app, nada cambia. Son cinco cerrojos que la revisión del backend del
2026-10-09 encontró abiertos, y que importan el día que la API esté en internet:

1. Una dependencia con una vulnerabilidad crítica, actualizada.
2. La API solo atiende pedidos del navegador que vengan de la dirección de la app (CORS).
3. Cabeceras de seguridad estándar en cada respuesta (`helmet`).
4. Un tiempo límite para cada consulta a la base, para que una trabada no se lleve la API entera.
5. Los errores se registran sin los datos de los clientes.

## Cómo funciona, paso a paso

**Un pedido del frontend, de punta a punta.** La tablet abre la app en
`http://localhost:5173` y pide `POST /api/clientes`:

1. Antes del `POST`, el navegador manda una **consulta previa** (`OPTIONS`) con
   `Origin: http://localhost:5173`, para preguntar si puede.
2. `helmet()` (`backend/src/app.ts:25`) agrega a la respuesta sus cabeceras
   (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`…) y quita
   `X-Powered-By`.
3. `cors({ origin: … })` (`app.ts:32`) mira si ese origen está en la lista. La lista sale de
   `config.corsOrigenes`, que `leerCorsOrigenes` (`backend/src/config.ts:37`) armó al
   arrancar desde `CORS_ORIGENES`. Si no hay variable, fuera de producción vale
   `http://localhost:5173`. Como está en la lista, responde
   `Access-Control-Allow-Origin: http://localhost:5173`, y el navegador manda el `POST`.
4. El controller llama al model, que usa el `pool`. El pool se creó con
   `opcionesDelPool` (`backend/src/db/pool.ts:52`), que al conectar le pide a Postgres
   `statement_timeout = 10000`. Si la consulta tardara más de 10 s, **Postgres** la corta
   (error `57014`) y la conexión vuelve al pool.
5. Si algo falla sin control, el `errorHandler` responde el 500 genérico de siempre y
   escribe en el log `paraElLog(err)` (`backend/src/middleware/errorHandler.ts:69`), no el
   error entero.

**El mismo pedido desde otra página web** (`https://pagina-cualquiera.com`): en el paso 3 el
origen no está en la lista y la respuesta sale **sin** `Access-Control-Allow-Origin`. El
servidor no rechaza nada: es el **navegador** el que, al no ver la cabecera, no deja que esa
página lea la respuesta.

## Dónde encaja en la arquitectura

- **`config.ts`** sigue siendo el único lugar que lee el entorno (`readConfig` recibe `env`
  como argumento, SPEC-ALE186-001). Las variables nuevas se validan ahí, al arrancar: un
  `DB_STATEMENT_TIMEOUT_MS=diez` frena el servidor con un mensaje claro, en vez de fallar en
  la primera consulta.
- **`app.ts`** solo arma la cadena de middlewares. El orden importa: `helmet` y `cors` van
  **antes** de las rutas, así sus cabeceras salen en toda respuesta, incluidos el 404 y el
  500. `createApp` recibe la lista de orígenes como opción, para que los tests prueben otra
  lista sin tocar el `.env`.
- **`db/pool.ts`** expone `opcionesDelPool` como función pura, así el test unitario mira qué
  se pide sin conectarse.
- **`errorHandler`** decide qué ve el cliente (el 500 genérico, ya desde SPEC-ALE186-001) y,
  desde ahora, también qué ve el log.

## Fundamentos

### CORS: una protección del navegador, no del servidor

Un navegador no deja que una página lea respuestas de **otro origen** (otro dominio, puerto o
protocolo) salvo que ese otro origen lo permita. Es la *política del mismo origen*. CORS es la
forma en que el servidor dice "a este origen sí": la cabecera `Access-Control-Allow-Origin`.

¿Qué pasaba con `cors()` sin opciones? La API respondía "a cualquiera, sí". Entonces una página
maliciosa abierta en la tablet del mostrador podía llamar a la API desde el navegador y leer
las respuestas. Con la lista, el navegador se lo impide.

Lo que CORS **no** hace: frenar a curl, a Postman o a otro servidor. Esos no son navegadores,
no aplican la política, y ni siquiera mandan `Origin`. Por eso
`tests/http/seguridad.test.ts` comprueba que un pedido sin `Origin` se atiende igual. Contra
esos clientes protege la autenticación (el token), no CORS. Confundirlos lleva a creer que
CORS "cierra la API". No la cierra: solo le dice al navegador a quién dejar leer.

### Cabeceras de seguridad (`helmet`)

Son instrucciones que el servidor le da al navegador sobre cómo tratar la respuesta:

- `X-Content-Type-Options: nosniff`: "no adivines el tipo; si digo JSON, es JSON". Evita que
  un navegador ejecute como script algo que no lo era.
- `X-Frame-Options: SAMEORIGIN`: "no me metas en un iframe de otra página". Evita que alguien
  superponga la app invisible sobre otra para robar clics.
- Sin `X-Powered-By: Express`: no regalarle a un atacante qué software buscar.

`helmet()` pone una docena de estas con valores sensatos. Para una API JSON casi todas son
"por las dudas", pero cuestan una línea (`app.ts:25`).

### Tiempo límite de una consulta (`statement_timeout`)

El pool presta conexiones (ver "pool de conexiones", SPEC-ALE186-001). Si una consulta se
traba, por ejemplo esperando un bloqueo que nunca se suelta, su conexión queda prestada para
siempre. Con unas pocas trabadas, el pool se vacía y **toda** la API deja de responder,
aunque el resto esté sano: una falla chica se vuelve una caída total.

`statement_timeout` se lo pide el pool a **Postgres** al conectar, y lo hace cumplir la base:
pasado el tiempo, cancela la consulta (`57014`) y la conexión se libera. Lo comprueba
`tests/db/seguridad.db.test.ts` con `pg_sleep(2)` y un límite de 200 ms: la consulta falla en
menos de 1,5 s y la conexión sirve para la siguiente. `connectionTimeoutMillis` es el
complemento del lado de Node: si no se consigue conexión (la base caída), el pedido falla en
vez de esperar para siempre.

### Los logs también guardan datos personales: lista blanca de campos

Un log se lee, se copia, se manda por chat para pedir ayuda y se guarda por meses, con menos
cuidado que la base. Un error de Postgres trae en `detail` los valores de la fila. Comprobado
en esta spec con una base de verdad: `Key (tel)=(71234567) already exists.` Escribir el error
entero ponía teléfonos y carnets ahí.

`paraElLog` (`errorHandler.ts:43`) copia una **lista blanca** de campos (`CAMPOS_SEGUROS`,
`errorHandler.ts:27`: nombre, mensaje, código, restricción, tabla, stack) en vez de borrar los
peligrosos. La diferencia importa: con una lista negra, si `pg` agrega mañana un campo nuevo
con datos, se cuela sin que nadie lo note. Con una lista blanca, lo nuevo no sale hasta que
alguien decida que es seguro. El test lo prueba con un campo inventado (`parametros`). Con
código, restricción y tabla alcanza para saber **qué** falló; **con qué valores** se ve en
la base, que tiene permisos.

### Auditar dependencias: producción, desarrollo y el tamaño de la subida

`npm audit` cruza las versiones instaladas con una base de vulnerabilidades conocidas. Dos
preguntas antes de actuar:

- **¿Viaja a producción?** `npm audit --omit=dev` mira solo lo que el servidor ejecuta. Vitest
  o nodemon con una vulnerabilidad son un riesgo en la máquina de quien desarrolla, no en el
  servidor. Por eso el criterio de esta spec es `--omit=dev`, que dio 0.
- **¿Qué tan grande es el arreglo?** `npm audit fix` solo aplica subidas que no rompen nada
  (acá, `proxy-addr` 2.0.7 → 2.0.8: cambia el último número, el de "parche"). Lo que queda
  pedía `--force`, que instala Vitest 5: un número mayor nuevo, que puede romper los tests de
  los dos workspaces. Eso se decide en una spec propia, no de pasada.

Como el `package-lock.json` es compartido con el frontend, antes de commitear se revisó qué
paquetes cambió: todos subidas de parche. Por las dudas se corrieron también los tests del
frontend.

**Ya explicado antes:**

- **Pool de conexiones** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **UPDATE dinámico con lista blanca** (la misma idea, aplicada a columnas) → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Fuerza bruta y límite de intentos** → SPEC-ALE186-016 (`specs/notas/SPEC-ALE186-016-login-limite-intentos.md`)

## Decisiones y por qué

- **`CORS_ORIGENES` con valor por defecto fuera de producción.** Si fuera obligatoria siempre,
  después del pull el backend de krilinxito no arrancaría hasta que tocara su `.env`. En
  producción sí es obligatoria: "si falta, aceptar a cualquiera" es justo el agujero que se
  cierra. Comprobado con el `.env` real de este repo, que no la tiene: arranca con
  `http://localhost:5173`.
- **Se descartó el punto del 409 de teléfono duplicado** de la revisión. El nombre que
  revela ya está en la tablet de cualquier empleado (el bucket `global` sincroniza todos los
  clientes), y el endpoint exige sesión. La exposición real es el bucket, y va en
  `sync-global-activos`.
- **10 s de `statement_timeout`.** La consulta más pesada del sistema (las estadísticas de un
  período largo) tarda milisegundos con los índices de SPEC-ALE186-021. 10 s está muy lejos de
  cortar algo legítimo y muy cerca de liberar una conexión trabada. Se puede cambiar por
  `.env` sin tocar código.

## Los tests

- `tests/unit/config.test.ts`: un bloque nuevo, SPEC-ALE186-023, con la lista de orígenes, el
  valor por defecto según `NODE_ENV`, la falla en producción y la validación de los
  milisegundos.
- `tests/unit/pool.test.ts`: que el pool reciba los dos tiempos de la config.
- `tests/http/seguridad.test.ts`: CORS (origen permitido, ajeno, el `OPTIONS` previo y sin
  `Origin`), las cabeceras de `helmet`, y el log sin el teléfono. Todo sobre `/api/no-existe`:
  las cabeceras se ponen antes de las rutas, así que no hace falta base de datos.
- `tests/db/seguridad.db.test.ts`: Postgres corta la consulta lenta, la conexión se recupera,
  y el pool de la app conecta con el límite de la config.
- **Reusados:** `appThatThrows` y `expectApiError` (`tests/helpers/api.ts`). `createApp`
  ahora acepta `corsOrigenes`: es la forma de probar otra lista sin tocar el entorno, y la
  próxima spec que necesite variar la app puede seguir el mismo patrón.

## Si mañana tenés que tocar esto

- El frontend en otro puerto o dominio: agregalo a `CORS_ORIGENES` (separado por comas). El
  síntoma de olvidarlo es un error de CORS en la consola del navegador, no en el backend.
- Si una consulta legítima empieza a cortarse por el tiempo límite, primero mirá su plan
  (`EXPLAIN`, SPEC-ALE186-021). Subir `DB_STATEMENT_TIMEOUT_MS` es el último recurso.
- Si un error necesita más datos en el log, agregá el campo a `CAMPOS_SEGUROS` solo si nunca
  puede traer datos de una persona.
