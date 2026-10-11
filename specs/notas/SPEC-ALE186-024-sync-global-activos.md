---
id: SPEC-ALE186-024
spec: specs/SPEC-ALE186-024-sync-global-activos.md
explica:
  - bucket con parametros vacios (interruptor sin columnas)
  - reiniciar powersync con reglas nuevas (ranura de replicacion)
  - validar las sync rules antes de reiniciar
---

# SPEC-ALE186-024 — El bucket global de PowerSync solo baja a cuentas activas

## Qué se construyó

Una cuenta dada de baja ya no recibe en su tablet la lista de clientes (con teléfono y carnet),
ni las sucursales, ni los usuarios. Antes los seguía recibiendo hasta que su token vencía.
El cambio son 4 líneas en `docker/powersync/sync-rules.yaml`.

Además, al probarlo con un PowerSync de verdad apareció un problema más grande, **que esta
spec no resuelve**: PowerSync rechaza los tokens que emite el backend. Está más abajo, en
"Lo que encontró la prueba de punta a punta".

## Cómo funciona, paso a paso

Una tablet se conecta a PowerSync con el token de una empleada:

1. PowerSync lee `sub` del token: es el id de la empleada (`request.user_id()`).
2. Para cada bucket de `sync-rules.yaml` corre su consulta `parameters`. La del `global`
   (`docker/powersync/sync-rules.yaml`, bucket `global`) es:

   ```sql
   SELECT FROM usuarios
   WHERE id = request.user_id()
     AND activo = true
   ```

3. **Si encuentra la fila**, la cuenta existe y está activa, y PowerSync le entrega el
   bucket con sus tres consultas `data`: todos los clientes, las sucursales y los usuarios
   sin `password_hash`. **Si no la encuentra**, ese bucket no existe para ella.
4. Cuando el admin la da de baja (`activo = false`), PowerSync se entera por la replicación
   de Postgres, vuelve a evaluar la consulta y le quita el bucket. La tablet borra esos datos
   de su copia local.

Se comprobó así, con el PowerSync de este repo y un usuario temporal que después se borró:

```
ACTIVA       → buckets: ["3#global[]"], filas: sucursales 1, usuarios 4
DADA DE BAJA → buckets: [],            filas: ninguna
```

(No bajaron clientes porque la base de desarrollo no tiene ninguno cargado.)

## Dónde encaja en la arquitectura

Las sync rules son **control de acceso** (CLAUDE.md §7): lo que no está ahí no llega nunca a
una tablet. Son la contracara del backend. La API decide quién puede **escribir**, y
PowerSync, con estas reglas, decide quién puede **leer**. Por eso no alcanzaba con que la API
rechazara a una cuenta dada de baja: sus lecturas no pasan por la API. El bucket `sucursal` ya
tenía este filtro (SPEC-KRILINXI-004); el `global` no.

Lo que NO le toca a este archivo: validar datos, calcular nada o hacer JOINs (PowerSync no
los admite, §7). Solo dice qué filas van a quién.

## Fundamentos

### Un bucket con parámetros "vacíos": la consulta que decide si existe

En PowerSync, cada **columna** que devuelve la consulta `parameters` se vuelve un **parámetro
del bucket**, y parte el bucket en uno por valor. Así funciona `sucursal`: devuelve
`sucursal_id`, cada sucursal tiene su bucket, y sus `data` usan `bucket.sucursal_id` para
filtrar.

Para el `global` lo natural parecía devolver algo, por ejemplo `SELECT id AS usuario_id …`.
**PowerSync lo rechaza**, con error fatal:

```
Query must cover all bucket parameters. Expected: ["bucket.usuario_id"] Got: []
```

Si un bucket tiene un parámetro, todas sus consultas `data` tienen que filtrar por él, y
"todos los clientes" no depende de quién los pide.

La salida es una consulta que **no devuelve columnas**: `SELECT FROM usuarios WHERE …`. No
hay parámetros, así que las `data` no cambian. La consulta igual decide algo: si devuelve
una fila, el bucket existe para ese usuario; si no devuelve ninguna, no existe. Es un
interruptor, no un filtro.

Un efecto a saber: el `global` deja de ser un único bucket compartido y PowerSync lo arma una
vez por cuenta activa. Con pocas cuentas, no importa.

### Validar las reglas antes de reiniciar

Un error en `sync-rules.yaml` no se ve hasta que PowerSync arranca, y entonces la sincronización
de todas las tablets queda en pausa. Por eso conviene validar **antes**. El contenedor trae su
propio validador (`@powersync/service-sync-rules`, el mismo código que usa el servicio).
Desde Git Bash en Windows (el `MSYS_NO_PATHCONV=1` evita que Git Bash reescriba las rutas que
empiezan con `/`):

```js
// validar.mjs
import { readFileSync } from 'node:fs';
import { SqlSyncRules } from '/app/packages/sync-rules/dist/index.js';
const errores = SqlSyncRules.validate(readFileSync('/tmp/sync-rules.yaml', 'utf8'), { defaultSchema: 'public' });
console.log(errores.length === 0 ? 'VÁLIDO' : errores.map((e) => e.message).join('\n'));
```

```bash
MSYS_NO_PATHCONV=1 docker cp docker/powersync/sync-rules.yaml lavanderia-powersync:/tmp/sync-rules.yaml
MSYS_NO_PATHCONV=1 docker cp validar.mjs lavanderia-powersync:/tmp/validar.mjs
MSYS_NO_PATHCONV=1 docker exec -w /app/packages/sync-rules lavanderia-powersync node /tmp/validar.mjs
```

Así se descartó la variante con columna antes de tocar el archivo real.

### Qué pasa al reiniciar PowerSync con reglas nuevas

`docker compose restart powersync` no borra nada. En el log se vio el mecanismo:

1. Arranca, lee las reglas nuevas ("Sync config updated").
2. Crea una **ranura de replicación nueva** (`powersync_3_…`) y procesa las tablas con las
   reglas nuevas, mientras la vieja (`powersync_2_…`) sigue atendiendo.
3. Cuando la nueva termina, la activa ("Activated new replication stream") y cierra la vieja.

Los datos del negocio viven en Postgres, que ni se reinicia. Las tablets se reconectan solas.
Lo único que borra datos es `docker compose down -v`, y nada de esto lo usa.

**Ya explicado antes:**

- **Sync rules y buckets** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)
- **Offline-first (bajada y subida)** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)

## Lo que encontró la prueba de punta a punta

El primer intento de la prueba con PowerSync falló, y el motivo no era de esta spec:

```
401 PSYNC_S2104 Token must expire in a maximum of 86400 seconds, got 259200s
```

PowerSync 1.25 **no acepta tokens de más de 24 horas**, y ese límite está fijo en su código
(`token_max_expiration: '1d'`, en `compound-config-collector.js` del contenedor): no se puede
cambiar desde `powersync.yaml`. El backend emite el `tokenPowerSync` con `JWT_EXPIRES_IN`, que
es de 3 días. Ese plazo es para el token de la API, el que hace falta sin internet (CLAUDE.md
§6). Conclusión: con la configuración actual, **ninguna tablet baja datos de un PowerSync
real**.

Nadie lo vio antes porque los tests del frontend usan un PowerSync simulado: la primera vez
que un token del backend llegó a un PowerSync de verdad fue en esta prueba. Es el mismo tipo
de hueco que motivó la suite contra la base real (SPEC-ALE186-007): un doble prueba lo que el
test le dice, no lo que hace el sistema real.

Para seguir con el criterio, la prueba emitió un token de 1 hora: el filtro del bucket no
depende de cuánto dura el token. El arreglo de verdad quedó anotado en CLAUDE.md §13 y va en una
spec propia, coordinada con el frontend:

- **del lado del backend**, emitir el token de PowerSync con menos de 24 h, sin tocar el de
  la API;
- **del lado del frontend**, pedir uno nuevo cuando vence (`fetchCredentials`).

## Decisiones y por qué

- **Interruptor sin columnas, y no un bucket por usuario con `bucket.usuario_id` en las
  `data`.** Para usarlo habría que filtrar `clientes` por usuario, y los clientes no son de
  nadie: son globales a propósito (§7).
- **El test del backend lee el YAML como texto**, igual que `schema.test.ts` del frontend, en
  vez de sumar una librería de YAML. `js-yaml` está instalado, pero solo como dependencia
  interna de ESLint, y apoyarse en eso es frágil.
- **No se tocó el test del frontend** (`schema.test.ts`, de krilinxito): pasa sin cambios
  (14/14), porque las tablas y columnas que bajan son las mismas.

## Los tests

- `backend/tests/unit/syncRules.test.ts`:
  - el `global` exige la fila activa del usuario del token;
  - la consulta no devuelve columnas;
  - las tres `data` son las de siempre;
  - `password_hash` no aparece en ningún bucket ni hay `SELECT * FROM usuarios`;
  - el `sucursal` sigue filtrando activos.
- **Prueba de mutación a mano:** contra la versión vieja del archivo fallan exactamente los dos
  tests de "solo activas" y pasan los otros tres. El test detecta lo que tiene que detectar.
- **Verificado a mano (criterios 3 y 4):**
  - el validador de PowerSync acepta el archivo;
  - PowerSync reinició sin errores ni avisos y activó las reglas nuevas;
  - con tokens reales, la cuenta activa recibe el bucket y la dada de baja no.
- **Reusados:** ninguno. Es el primer test del backend que lee las sync rules, y es corto.

## Si mañana tenés que tocar esto

- Validá el YAML con el script de arriba antes de reiniciar.
- Un bucket nuevo que dependa de quién lo pide: devolvé la columna en `parameters` y usala en
  **todas** sus `data`. Si no depende, usá el interruptor sin columnas.
- Después de mergear un cambio en las reglas, cada uno reinicia su PowerSync.
