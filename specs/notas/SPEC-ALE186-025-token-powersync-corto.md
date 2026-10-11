---
id: SPEC-ALE186-025
spec: specs/SPEC-ALE186-025-token-powersync-corto.md
explica:
  - medir un plazo con la misma herramienta que lo usa
  - token corto para usar y largo para renovar (access y refresh token)
---

# SPEC-ALE186-025 — El token de PowerSync dura menos de 24 horas

## Qué se construyó

Hasta esta spec, ninguna tablet podía bajar datos de un PowerSync real. El backend le daba un
token de 3 días, y PowerSync rechaza todo lo que pase de 24 horas (lo encontró SPEC-ALE186-024).
Ahora cada login entrega dos tokens con plazos distintos:

| Token | Dura | Para qué |
|---|---|---|
| El de la **API** (`token`) | 3 días (`JWT_EXPIRES_IN`) | Subir la cola y pedir tokens nuevos sin contraseña al volver la conexión |
| El de **PowerSync** (`tokenPowerSync`) | 12 h (`PS_JWT_EXPIRES_IN`) | Bajar datos, que solo pasa con conexión |

Comprobado contra el PowerSync de este repo, con la config por defecto y sin tocar el token:

```
token de la API dura      : 72 h
token de PowerSync dura   : 12 h
PowerSync con ese token   : ACEPTADO 200, buckets: ["3#global[]"]
```

## Cómo funciona, paso a paso

**Al arrancar el backend:**

1. `readAuthConfig` (`backend/src/config.ts`) lee los dos plazos. El de PowerSync pasa por
   `leerExpiraEnPowerSync` (`config.ts:144`): si no está, usa `12h`. Lo mide con
   `duracionEnSegundos` (`config.ts:133`) y, si pasa de `MAXIMO_POWERSYNC_SEGUNDOS`
   (`config.ts:124`, 24 h), **no arranca** y explica por qué.

**En un login, o en `/renovar`:**

2. El controller (`postLogin`, `backend/src/controllers/auth.controller.ts:85`, o `postRenovar`,
   `:138`) llama a `emitirCredenciales` (`backend/src/utils/jwt.ts:48`).
3. Antes, las dos firmas compartían un `expiresIn`. Ahora cada una lleva el suyo: la de la API
   `cfg.expiraEn` (`jwt.ts:60`) y la de PowerSync `cfg.expiraEnPowerSync` (`jwt.ts:75`).
4. La respuesta trae los dos. El controller no cambió.

**Un día en la tablet** (con el frontend que falta, ver abajo):

5. 8:00: login. Los dos tokens frescos.
6. 10:00: se corta internet. Sin conexión no se usa ningún token: se lee de SQLite y se
   escribe en la cola.
7. 21:00: vuelve internet. El de PowerSync venció a las 20:00. La app manda el de la API, que
   vale hasta dentro de 3 días, a `/renovar` y recibe un par nuevo, sin contraseña.

## Dónde encaja en la arquitectura

- **`config.ts`** valida al arrancar, como con el resto de la config (SPEC-ALE186-001). Un plazo
  que PowerSync va a rechazar es un error de configuración, y es mejor que el servidor no
  arranque y lo diga, a que arranque "bien" y todas las tablets queden sin datos sin ninguna
  pista. Es el mismo problema que esta spec viene a cerrar.
- **`utils/jwt.ts`** solo firma. No sabe de dónde vienen los plazos ni por qué son distintos.
- **El frontend es quien renueva.** El backend ya tenía todo lo necesario (`/renovar` existe
  desde SPEC-ALE186-002 y devuelve el par entero). Esta spec no toca el frontend, que es de
  krilinxito: deja los pasos exactos en CLAUDE.md §13, en "Avisos para el frontend".

## Fundamentos

### Un token corto para usar y uno largo para renovar

Es un patrón muy común en autenticación (en inglés, *access token* y *refresh token*): dos
credenciales con trabajos distintos, y por eso con plazos distintos.

- El **corto** se muestra muchas veces, a un servicio que no lo verifica contra la base (acá,
  PowerSync en cada sincronización). Si alguien lo roba, sirve poco tiempo.
- El **largo** se muestra pocas veces, y casi siempre para pedir uno corto nuevo. En ese
  momento el servidor puede volver a decir que no. Acá `/renovar` mira en la base si la
  cuenta sigue activa (CLAUDE.md §6).

En este proyecto el largo además es el **presupuesto de trabajo sin internet**: mientras viva,
la tablet vuelve a la normalidad sin pedir contraseña. Por eso dura días, y no porque sea más
seguro.

Lo que **no** hace falta: que el corto dure mucho para aguantar sin internet. Sin conexión no
se le muestra a nadie. Ese error de razonamiento ("la sesión tiene que durar 3 días, entonces
todo token dura 3 días") fue el que produjo el problema.

### Medir un plazo con la misma herramienta que lo usa

`PS_JWT_EXPIRES_IN` acepta lo que acepte `jsonwebtoken`: `12h`, `30m`, `2d`… Para validar que no
pase de 24 h hay que convertirlo a segundos, y la tentación es escribir un intérprete propio.
El riesgo: que el intérprete propio y la librería entiendan distinto el mismo texto. Por
ejemplo, `jsonwebtoken` lee un número **sin unidad dentro de un texto** (`"3600"`) como
milisegundos, no segundos. El validador diría "1 hora, bien" y el token duraría 3,6 segundos.

`duracionEnSegundos` (`config.ts:133`) no interpreta nada: **firma un token descartable con ese
plazo y lee `exp - iat`**. Mide exactamente lo que después va a firmar el código de verdad,
porque es el mismo código. Si un texto no le sirve a la librería, la firma falla, y eso se
traduce en un mensaje claro.

**Ya explicado antes:**

- **JSON Web Token (JWT)** y **audiencia de un token (aud)** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Ventana de gracia para un token vencido** (la cola que sube con el token de la API vencido) → SPEC-ALE186-018 (`specs/notas/SPEC-ALE186-018-cola-usuario-revocado.md`)

## Decisiones y por qué

- **12 h por defecto, no 23.** Cuanto más cerca de 24 h, más fácil que una diferencia de reloj
  entre el backend y PowerSync haga que lo rechace. 12 h deja margen, y la renovación es
  automática: nadie nota la diferencia.
- **El tope de 24 h es un error al arrancar, no un "recorte" silencioso.** Si alguien pide
  `2d`, recortarlo a 24 h sin decir nada escondería que la config no es la que cree.
- **Variable nueva y opcional.** Nadie tiene que tocar su `.env`: sin `PS_JWT_EXPIRES_IN`,
  12 h. Es la regla que se acordó después de SPEC-ALE186-023: lo de siempre funciona sin tocar
  nada, y lo nuevo se configura cuando alguien quiere.

## Los tests

- `tests/unit/authConfig.test.ts` (bloque SPEC-ALE186-025):
  - 12 h por defecto;
  - acepta `6h`, `30m` y `24h`;
  - rechaza `25h`, `2d` y `3d` con un mensaje que nombra las 24 horas;
  - rechaza un texto que no es un plazo;
  - y un `JWT_EXPIRES_IN` de días no arrastra al de PowerSync.
- `tests/unit/jwt.test.ts`: lee `exp - iat` de los dos tokens (12 h y 3 días), y comprueba que
  cambiar uno no mueve el otro.
- `tests/http/auth.test.ts`: el login y `/renovar` devuelven cada token con su plazo, y
  `/renovar` funciona solo con el token de la API. Compara contra la config cargada y no contra
  números fijos, porque `JWT_EXPIRES_IN` sale del `.env` de cada máquina.
- **Verificado a mano (criterio 4):** el token que emite el backend tal cual lo acepta el
  PowerSync local, con un usuario temporal que se borró al terminar.
- No hizo falta ningún helper nuevo.

## Si mañana tenés que tocar esto

- Para cambiar cuánto dura la sesión sin internet, tocá `JWT_EXPIRES_IN`, no el de PowerSync.
- Si PowerSync sube su límite en una versión futura, el número a cambiar es
  `MAXIMO_POWERSYNC_SEGUNDOS`, no el plazo por defecto.
- La renovación del lado del frontend sigue pendiente. Hasta que exista, cada sesión baja
  datos sus primeras 12 h y después deja de bajarlos hasta un login nuevo.
