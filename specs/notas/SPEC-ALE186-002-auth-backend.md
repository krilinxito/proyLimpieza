---
id: SPEC-ALE186-002
spec: specs\SPEC-ALE186-002-auth-backend.md
explica:
  - ampliacion de tipos de una libreria
  - ataque de temporizacion
  - audiencia de un token (aud)
  - autenticacion vs autorizacion (401 y 403)
  - base64url y clave en bytes
  - enumeracion de usuarios
  - factory de datos de prueba
  - hash de contrasena con bcrypt
  - idempotencia
  - json web token (jwt)
---

# SPEC-ALE186-002 — Autenticación, usuarios y semilla inicial

## Qué se construyó

La puerta de entrada al sistema. Una empleada escribe su usuario y su contraseña, y a
partir de ahí el backend sabe quién está pidiendo cada cosa y desde qué sucursal. Antes
de esta spec, cualquiera que llegara a la API era un desconocido con los mismos permisos
que todos los demás.

También se creó la **semilla**, que es lo que hace que el sistema se pueda usar por
primera vez: sin ella no hay ningún usuario, y sin usuarios no hay forma de entrar a
crear el primero.

## Cómo funciona, paso a paso

### Un login que sale bien

María escribe `maria` y su contraseña en el mostrador. El navegador manda:

```
POST /api/auth/login   { "username": "maria", "password": "..." }
```

1. **`src/routes/index.ts:12`** — el registro central manda todo lo que empieza por
   `/api/auth` al router de autenticación. Este archivo no tiene lógica: solo dice quién
   atiende qué.

2. **`src/routes/auth.routes.ts:9`** — la ruta declara que `POST /login` lo atiende
   `postLogin`, **sin ningún middleware delante**. Es la única puerta abierta del sistema,
   y tiene que serlo: quien viene a pedir un token todavía no tiene ninguno.

3. **`src/controllers/auth.controller.ts:51`** — `leerCredenciales` mira el cuerpo de la
   petición. Llega como `unknown` —lo mandó un cliente, podría ser cualquier cosa, incluso
   nada— y sale como dos strings con contenido, o no sale: si falta alguno, tira un 400 y
   el controller no llega a consultar la base.

4. **`src/models/usuarios.model.ts:75`** — `buscarPorUsername` es la primera y única vez
   que se toca Postgres en todo el login. El username viaja como `$1`, jamás pegado dentro
   del texto de la consulta. Es el único sitio de todo el proyecto que trae la columna
   `password_hash`.

5. **`src/controllers/auth.controller.ts:35`** — `verificarContrasena` compara lo que
   escribió María contra el hash guardado. Nunca se comparan contraseñas: se comparan
   hashes (ver *Fundamentos*).

6. **`src/controllers/auth.controller.ts:84`** — recién ahora se mira `activo`. El orden
   importa y está explicado en *Decisiones*.

7. **`src/utils/jwt.ts:48`** — `emitirCredenciales` firma **dos** tokens: el de esta API,
   que lleva rol y sucursal, y el de PowerSync, que va pelado y solo dice quién es.

8. **`src/controllers/auth.controller.ts:41`** — `paraRespuesta` arma el usuario que sale
   por la API campo por campo. Es una lista blanca: lo que no se nombra ahí, no sale.

La respuesta:

```json
{
  "token": "eyJ...",
  "tokenPowerSync": "eyJ...",
  "usuario": { "id": "...", "nombreCompleto": "María Pérez", "rol": "EMPLEADO", "sucursalId": "..." }
}
```

### Una petición ya autenticada

A partir de ahí, la app manda en cada llamada la cabecera
`Authorization: Bearer eyJ...`.

1. **`src/middleware/auth.ts:31`** — `requireAuth` saca el token de la cabecera.
2. **`src/utils/jwt.ts:91`** — `verificarToken` comprueba la firma y la audiencia.
3. **`src/utils/jwt.ts:115`** — `aSesion` mira campo por campo lo que venía dentro. La
   firma solo garantiza que nadie lo tocó, **no** que el contenido tenga la forma que
   esperamos: un token viejo, emitido por una versión anterior del backend, podría no
   traer `rol`.
4. La sesión queda en `req.usuario`, y **`src/middleware/auth.ts:55`** (`sesionDe`) es
   como la leen los controllers sin tener que comprobar que existe cada vez.
5. Si la ruta además exige un rol, **`src/middleware/roles.ts:19`** lo comprueba y corta
   con 403 si no corresponde.

Nada de esto consulta la base. Todo lo que hace falta está firmado dentro del token, y por
eso una petición autenticada no cuesta ni una consulta extra.

### La renovación, que es donde el servidor recupera la palabra

`POST /api/auth/renovar` sí lleva `requireAuth` delante
(**`src/routes/auth.routes.ts:13`**): no es volver a entrar, es estirar una sesión que ya
existe.

**`src/controllers/auth.controller.ts:96`** vuelve a buscar al usuario **en la base** y
comprueba `activo` ahí. Ese es el punto —y el único— donde una baja se hace efectiva, tal
como lo fija la sección 6 del `CLAUDE.md`. De paso relee el rol y la sucursal, así que un
cambio de rol entra en la siguiente renovación sin tener que echar a nadie.

### La semilla

`npm run seed --workspace backend` ejecuta **`src/db/seed.ts:72`**: busca la sucursal por
nombre y la crea si no está, y después intenta crear el admin. La contraseña sale del
entorno (**`src/db/seed.ts:42`**) y no tiene valor por defecto.

## Dónde encaja en la arquitectura

Las capas son las de la sección 5 del `CLAUDE.md`, y esta spec las estrena con algo real:

| Pieza | Capa | Lo que **no** le toca hacer |
|---|---|---|
| `models/usuarios.model.ts` | Model | No conoce `req` ni `res`, no decide códigos HTTP. Recibe un username y devuelve datos. |
| `controllers/auth.controller.ts` | Controller | **No escribe SQL.** Si necesita datos, pasa por el model. |
| `routes/auth.routes.ts` | Rutas | Sin lógica: declara el endpoint y qué middleware lleva delante. |
| `middleware/auth.ts`, `roles.ts` | Middleware | No consultan la base ni saben de negocio; solo cortan o dejan pasar. |
| `utils/jwt.ts` | Util | No sabe que existe HTTP. Firma y verifica. |

Dos fronteras nuevas que conviene ver escritas:

**La traducción `snake_case` ↔ `camelCase` vive en el model y en ningún otro sitio**
(`usuarios.model.ts:52`). La base dice `nombre_completo`, el backend dice `nombreCompleto`.
Si esa conversión se hiciera también en el controller, cada columna nueva habría que
recordarla en dos lugares.

**El hash tiene su propio tipo.** `Usuario` no tiene `passwordHash`; `UsuarioConHash` sí
(`usuarios.model.ts:23`), y solo lo devuelve `buscarPorUsername`. No es decoración: para
tener el hash en las manos hay que haber llamado a la función que lo trae, así que no
puede colarse por descuido en una respuesta. El compilador vigila la regla.

## Fundamentos

### Hash de contraseña, y por qué bcrypt es lento a propósito

Un **hash** convierte un texto en una huella de la que no se puede volver atrás. La base
no guarda la contraseña de María: guarda su huella. Para comprobar el login se calcula la
huella de lo que escribió y se compara con la guardada.

Por qué importa: si alguien se lleva una copia de la base, con contraseñas en claro ya
tiene las cuentas de todo el mundo —y las de sus correos y bancos, porque la gente repite
contraseñas—. Con hashes, tiene huellas.

**bcrypt** es un algoritmo de hash pensado para esto, y su rasgo raro es que es **lento
a propósito**. Un hash rápido se puede probar mil millones de veces por segundo hasta dar
con la contraseña; bcrypt tarda ~100 ms por intento con el coste 10 que usa la semilla
(`src/db/seed.ts:24`). El "coste" es un número que multiplica el trabajo: subirlo es la
forma de seguir el ritmo de las máquinas que vendrán.

Bcrypt guarda la sal y el coste dentro del propio hash —por eso empieza por `$2b$10$`—,
así que `bcrypt.compare` sabe reproducir el cálculo sin que nadie le explique nada. En los
tests se usa coste 4 (`tests/helpers/usuarios.ts:20`): lo que se prueba es que comparar
funcione, no lo caro que es.

### JWT: un papel firmado, no un sobre cerrado

Un **JSON Web Token** son tres partes separadas por puntos: cabecera, contenido y firma.
Las dos primeras son JSON en base64url — **cualquiera puede leerlas**. Pegá un token en
jwt.io y vas a ver el `sub` y el `rol` en claro.

Lo que un JWT garantiza no es el secreto sino la **integridad**: la firma se calcula con
una clave que solo tiene el servidor, así que si alguien cambia `"rol": "EMPLEADO"` por
`"rol": "ADMIN"`, la firma deja de cuadrar y `jwt.verify` lo rechaza
(`src/utils/jwt.ts:91`).

La consecuencia práctica, que hay que tener presente en todas las specs siguientes: **en
un token no se mete nada que no pueda leer el dueño del dispositivo.** Un id, un rol y una
sucursal, sí. Un dato privado, no.

La otra propiedad es que el token **se verifica sin consultar la base**. Eso es lo que
hace que sirva para trabajar sin internet (sección 6) y también su límite: entre que a
alguien se le da de baja y su token vence, el token sigue valiendo. Por eso existe la
renovación.

### `aud`: para quién se emitió este token

El claim **`aud` (audiencia)** dice a qué servicio va dirigido un token. Acá hay dos
servicios —esta API y PowerSync— y **un solo secreto de firma**, así que sin `aud` los dos
tokens serían intercambiables: el que se le entrega a PowerSync valdría para operar contra
nuestros endpoints.

La API firma con `<audiencia>-api` y verifica exigiendo esa misma (`src/utils/jwt.ts:36`);
PowerSync solo acepta la audiencia pelada, la de `PS_JWT_AUDIENCE`. Un token de PowerSync
presentado a la API se rechaza aunque la firma sea perfectamente válida — hay un test que
lo comprueba, porque es el tipo de cosa que se rompe sin hacer ruido.

### base64url, y por qué el secreto se usa en bytes

Una clave criptográfica son **bytes al azar**, no texto. Como en un `.env` solo entra
texto, se guarda codificada en **base64url**: una forma de escribir bytes con letras,
números, `-` y `_` (la variante `url` cambia los `+` y `/` del base64 clásico, que en una
URL significan otra cosa).

Acá esto no es trivia. `docker/powersync/powersync.yaml` declara la clave como una entrada
JWKS con `kty: oct` y `k: !env PS_JWT_SECRET_B64`, y en JWKS el campo `k` **es base64url de
los bytes crudos**. Es decir: PowerSync decodifica antes de verificar. Si el backend
firmara usando la cadena tal cual, estaría firmando con una clave distinta y todos los
tokens serían rechazados, sin más pista que un 401 en la app. Por eso `readAuthConfig`
(`src/config.ts:76`) devuelve un `Buffer` y no un string, y por eso hay un test que
comprueba justamente que sean bytes.

El `kid` (`src/utils/jwt.ts:29`) es la otra mitad del mismo acuerdo: nombra qué clave usar,
y tiene que decir lo mismo acá que en el yaml.

### 401 y 403: autenticación no es autorización

Son dos preguntas distintas y se responden en dos middlewares distintos:

- **Autenticación** — *¿quién sos?* Si no hay respuesta, **401**. Dice: identificate.
- **Autorización** — *¿te toca esto?* Si la respuesta es no, **403**. Dice: sé quién sos y
  no te corresponde.

La diferencia es práctica, no académica. Un 401 hace que la app mande a la pantalla de
login; si le respondiéramos 401 a un empleado que entra al panel del admin, lo mandaríamos
a iniciar sesión otra vez para nada — ya está identificado, y volver a entrar no le va a
dar el permiso.

### Enumeración de usuarios, y la fuga por el reloj

Si el login respondiera *"ese usuario no existe"* y *"la contraseña no es esa"* por
separado, cualquiera podría ir probando nombres hasta armar la lista del personal. Eso se
llama **enumeración de usuarios**, y por eso los dos casos comparten mensaje, código y
status (`src/controllers/auth.controller.ts:13`).

Pero hay una segunda vía por la que se escapa la misma información, y es menos evidente:
**el tiempo**. Si cuando el usuario no existe el backend contestara de inmediato, y cuando
existe tardara los ~100 ms de bcrypt, esa diferencia sería tan reveladora como el mensaje.
Es un **ataque de temporización**. Por eso `verificarContrasena`
(`src/controllers/auth.controller.ts:35`) compara igual contra un hash señuelo cuando no
hay usuario y tira el resultado: el trabajo parece desperdiciado y es exactamente el punto.

### Idempotencia

Una operación es **idempotente** cuando correrla dos veces deja el mismo resultado que
correrla una. Importa en la semilla porque nadie se acuerda de si ya la ejecutó, y un
script que a la segunda revienta —o peor, duplica— es un script que la gente evita usar.

La forma de conseguirlo **no** es "consultar si existe y después insertar": entre las dos
consultas cabe otro proceso haciendo lo mismo. Se consigue dejando que la restricción
`UNIQUE (username)` de la base decida, con `ON CONFLICT (username) DO NOTHING`
(`src/models/usuarios.model.ts:123`). La base hace la comprobación y la inserción en un
solo paso, y devuelve cero filas si no insertó nada — de ahí sale el `null` que la semilla
lee como "ya estaba".

### Ampliar un tipo de otra librería

`req.usuario` no existe en Express. El bloque `declare global` de
`src/middleware/auth.ts:12` le añade ese campo a la interfaz `Request` de la librería, para
todo el proyecto. Es la alternativa honesta a escribir un `as` en cada controller: en vez
de mentirle al compilador una vez por archivo, se le enseña una vez la forma real que
tienen las peticiones acá.

Va como opcional (`usuario?`), porque en una ruta pública no hay sesión — y de ahí la
necesidad de `sesionDe`.

**Ya explicado antes:**

- **middleware** y **orden de la cadena de middlewares** → SPEC-ALE186-001
  (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **formato de error uniforme** → SPEC-ALE186-001 (todos los errores de acá salen con ese
  shape, y `expectApiError` lo verifica)
- **dobles de prueba (mocks)** → SPEC-ALE186-001
- **funciones puras testeables** → SPEC-ALE186-001 (`readAuthConfig` y `leerDatos` siguen
  ese mismo patrón: reciben el entorno como argumento)
- **pool de conexiones** y **módulos ESM y extensión `.js`** → SPEC-ALE186-001

## Decisiones y por qué

**Dos tokens y no uno.** Lo fija la sección 6. La alternativa —un único token para todo—
significaría mandarle a PowerSync el rol y la sucursal, que no necesita para nada: las saca
él de la base con sus sync rules. Cuanta menos información se le entrega a otro sistema,
menos hay que revisar el día que ese sistema cambie.

**La contraseña se verifica antes que `activo`.** Al revés parece más eficiente —descartar
al usuario dado de baja sin gastar los 100 ms de bcrypt—, pero entonces bastaría saber un
nombre para descubrir que existe y está desactivado. Verificando primero, el mensaje
*"tu usuario está desactivado"* solo lo ve quien ya demostró ser esa persona. Ahí sí
conviene ser específico: esa persona necesita saber que tiene que hablar con el encargado,
no quedarse creyendo que se equivocó de contraseña.

**El middleware no consulta la base.** Es el intercambio central de los JWT: peticiones
baratas a cambio de que una baja tarde hasta la próxima renovación en hacerse efectiva. Lo
segundo es aceptable porque la sección 6 ya lo decidió al fijar el plazo de 3 días como
presupuesto de trabajo sin internet.

**La semilla no trae contraseña por defecto.** Un `admin123` escrito en el repositorio
acabaría siendo la contraseña real de alguna instalación — es lo que pasa siempre. Que el
script falle pidiéndola es más molesto y es lo correcto (sección 10).

**El backend ahora no arranca sin un `PS_JWT_SECRET_B64` de verdad.** `readAuthConfig`
rechaza cualquier secreto de menos de 32 bytes, incluido el texto de ejemplo del
`.env.example`. Se valida al arrancar (`src/config.ts:109`) y no en el primer login: es
mejor que falle al levantar el servidor, con un mensaje que dice qué comando correr, que
tres días después en el mostrador.

## Los tests

45 tests nuevos, 79 en total en el backend.

**Lo que se reusó.** `testApi()` y `expectApiError()` de `tests/helpers/api.ts`, que dejó
la 001. `expectApiError` resultó valer más de lo que parecía: comprueba que el cuerpo del
error tenga **exactamente** la clave `error` y nada más, así que cada vez que se afirma un
401 se está afirmando también que no se escapó un stack ni un dato interno.

**Lo que se creó, y por qué.**

`appConCapas(...capas)` en `tests/helpers/api.ts` — una app mínima con un `GET /probar`
detrás de los middlewares que le pases. Es la forma de probar un middleware por lo que
hace —dejar pasar o cortar— sin colgarlo de un endpoint del negocio que después cambie por
otro motivo. La próxima spec que escriba un middleware lo usa así:

```ts
const res = await request(appConCapas(requireAuth, requireRol('ADMIN'))).get('/probar');
```

`tests/helpers/usuarios.ts` — una **factory**. Un helper de test devuelve una herramienta;
una factory devuelve **un dato de prueba coherente** que el test retoca solo en lo que le
importa:

```ts
const baja = await usuarioDePrueba({ activo: false });
```

El test dice "un usuario dado de baja" y no repite los otros cinco campos, que no tienen
nada que ver con lo que prueba. Cuando la tabla `usuarios` gane una columna, se toca acá y
no en quince archivos. `clientes`, `ordenes` y `pagos` van a querer la suya: el patrón es
este, un archivo por entidad en `tests/helpers/`.

**Lo que los tests no cubren, y hay que decirlo.** Toda la suite corre con el model
reemplazado por un doble, así que **el SQL de esta spec no se ha ejecutado nunca contra
Postgres de verdad**. Los nombres de columna, el `ON CONFLICT` y la restricción
`chk_empleado_con_sucursal` están escritos contra el schema leído, no comprobados. Eso se
verifica levantando Docker y corriendo la semilla.

## Si mañana tenés que tocar esto

**Empezá por `src/utils/jwt.ts`.** Es el archivo corto del que depende todo lo demás, y el
que tiene las dos decisiones que se pueden romper sin que ningún test del backend se
entere: la audiencia y el `kid`. Los dos tienen que seguir coincidiendo con
`docker/powersync/powersync.yaml`.

**Cuidado con `paraRespuesta`** (`src/controllers/auth.controller.ts:41`). Es una lista
blanca a propósito. Si algún día alguien la cambia por `...usuario` para "ahorrarse
escribir", el `passwordHash` empieza a salir por la API el día que el tipo cambie. Hay un
test que busca `$2b$` en el cuerpo entero de la respuesta, y está ahí por esto.

**Si los tokens dejan de funcionar contra PowerSync** y en la API siguen bien, mirá en este
orden: que `PS_JWT_AUDIENCE` valga lo mismo en `.env` y en el yaml, que el `kid` coincida, y
que el secreto sea el mismo en los dos lados. Los tres fallan igual —401 sin explicación— y
ninguno de los tres lo ve la suite de tests.

**Lo que esta spec dejó fuera a propósito:** dar de alta, editar y desactivar usuarios (el
admin todavía no tiene cómo hacerlo desde la API), cerrar sesión, y cambiar la contraseña.
Son otra spec.
