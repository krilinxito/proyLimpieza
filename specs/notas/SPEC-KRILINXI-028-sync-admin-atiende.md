---
id: SPEC-KRILINXI-028
spec: specs/SPEC-KRILINXI-028-sync-admin-atiende.md
explica:
  - evaluar las sync rules con el motor de powersync (que buckets recibe cada cuenta)
  - parametros del cliente (request.parameters) eligen pero no autorizan
  - una advertencia que no hay que callar (accept_potentially_dangerous_queries)
---

# SPEC-KRILINXI-028 — El ADMIN baja la ropa de la sucursal donde atiende

## Qué se construyó

A veces el dueño atiende el mostrador. El backend ya lo dejaba registrar, cobrar y entregar, pero su
tablet no recibía la ropa de ninguna sucursal, así que no podía trabajar sin internet ni validar una
boleta. Ahora las reglas de sincronización tienen un bucket más, `atencion_admin`: si la tablet del
ADMIN dice «estoy atendiendo en Norte», PowerSync le baja la ropa de Norte, lo mismo que a un
empleado de Norte. La parte de la tablet (elegir la sucursal y mandarla) es SPEC-KRILINXI-029.

## Cómo funciona, paso a paso

Sigamos al dueño que atiende en Norte (`c2`):

1. **La tablet se conecta mandando un parámetro.** Eso lo hará la 029:
   `db.connect(conector, { params: { sucursal_id: 'c2' } })`. El token no cambia: sigue diciendo
   solo quién es (`sub`).
2. **PowerSync evalúa la consulta de parámetros del bucket** (`sync-rules.yaml:71-78`). Lee la fila
   de `usuarios` con `id = request.user_id()` (`:75`), es decir, la del dueño del token. Si esa fila
   es `rol = 'ADMIN'` (`:76`), está activa y el parámetro vino (`:78`), devuelve `sucursal_id = 'c2'`,
   sacado de `request.parameters()` (`:73`).
3. **Ese valor arma el bucket** `atencion_admin["c2"]`, y las consultas de datos (`:80-82`) lo llenan
   con las órdenes, entregas y pagos cuyo `sucursal_id` es `c2`.
4. **Cada fila de ropa va a dos buckets.** Una orden de Norte va a `sucursal["c2"]` (los empleados de
   Norte) y a `atencion_admin["c2"]` (el ADMIN que atiende ahí). PowerSync la guarda una sola vez por
   bucket, no por tablet.

Y los casos en que no pasa nada, que son los que importan en el control de acceso:

- **Una empleada del Centro que manda `sucursal_id: 'c2'`**: su fila no cumple `rol = 'ADMIN'`, la
  consulta no devuelve nada, y el bucket no existe para ella. Sigue recibiendo solo
  `sucursal["c1"]`, que sale de su fila en la base (`:38`), no de lo que mande la tablet.
- **Un ADMIN dado de baja**: no cumple `activo = true`. No recibe este bucket, y tampoco `global`.
- **Un ADMIN que no está atendiendo**: no manda el parámetro, la condición de `:78` falla, y recibe
  solo `global`, como antes de esta spec.

Todo esto se comprobó con el motor de reglas de PowerSync (ver «Fundamentos»), no solo leyendo el
archivo.

## Dónde encaja en la arquitectura

Las sync rules son **control de acceso**, no una optimización (CLAUDE.md §7): lo que no está ahí no
llega a ninguna tablet. Por eso esta spec no toca el backend Express. La API ya aceptaba al ADMIN en
órdenes, cobros, entregas y clientes («el admin también atiende», en las rutas), y la subida sigue
pasando por ahí con sus validaciones. Lo único que faltaba era la **bajada**, y la bajada la decide
PowerSync con estas reglas.

Lo que NO le toca a este bucket: decidir si el ADMIN puede tocar esa sucursal. Eso ya lo decidió el
negocio (el ADMIN es global, CLAUDE.md §3), y la API lo hace cumplir en cada escritura. El bucket solo
elige cuál de las sucursales que el ADMIN ya puede ver baja a esta tablet.

## Fundamentos

### Parámetros del cliente: sirven para elegir, nunca para autorizar

PowerSync arma los buckets con dos tipos de datos de quien se conecta:

- **Del token** (`request.user_id()`, `request.jwt()`): los firmó el backend, la tablet no los puede
  cambiar. Sirven para autorizar.
- **Del cliente** (`request.parameters()`): los manda la tablet al conectarse, y puede mandar
  cualquier cosa. Alguien con las herramientas del navegador abiertas puede cambiar `c2` por `c3`.

Por eso, en `atencion_admin` el parámetro solo **elige** entre lo que ya está permitido. La
autorización está en las otras tres condiciones, todas sobre la fila del dueño del token
(`sync-rules.yaml:75-77`). Si la consulta dijera solo `WHERE rol = 'ADMIN'`, sin atarla a quien pide,
cualquier tablet que mandara el parámetro recibiría la ropa: la condición sería cierta para *alguna*
fila de ADMIN, no para la suya.

### Una advertencia que no hay que callar

El borrador de la spec pedía poner `accept_potentially_dangerous_queries: true`, pensando que
PowerSync iba a marcar la consulta por usar parámetros del cliente. Antes de escribirlo se probó, y
no la marca. El código del validador (`SqlParameterQuery.js:457` en el contenedor) avisa solo cuando
una consulta usa parámetros del cliente **y no está atada a quien pide**:

```js
get usesDangerousRequestParameters() {
  return this.usesUnauthenticatedRequestParameters && !this.hasAuthenticatedBucketParameters && !this.hasAuthenticatedMatchClause;
}
```

La contraprueba lo confirmó: sacando `id = request.user_id()`, el validador responde «Potentially
dangerous query based on parameters set by the client». Ese flag no autoriza nada; solo apaga el
aviso. Puesto «por las dudas», la regla quedaría muda justo cuando hace falta: el día que alguien
borre esa condición. Por eso no está, y un test vigila que no aparezca
(`syncRules.test.ts`, en el bloque de esta spec).

### Ver qué buckets recibe cada cuenta, con el motor de PowerSync

El validador dice si el archivo es válido, no qué recibe cada cuenta. Para eso se usó el propio motor
de reglas que trae el contenedor (`@powersync/service-sync-rules`, el mismo código que usa el
servicio): se cargan las reglas, se le dan filas de `usuarios` y se le pregunta qué buckets le tocan
a cada cuenta con cada parámetro. El script (`evaluar.mjs`) quedó probado así:

```js
import { readFileSync } from 'node:fs';
import { SqlSyncRules, DEFAULT_HYDRATION_STATE, RequestParameters } from '/app/packages/sync-rules/dist/index.js';

const { config } = SqlSyncRules.fromYaml(readFileSync('/tmp/real.yaml', 'utf8'), { defaultSchema: 'public' });
const reglas = config.hydrate({ hydrationState: DEFAULT_HYDRATION_STATE, sqlite: null });
const usuarios = [
  { id: 'admin', rol: 'ADMIN', sucursal_id: null, activo: 1 },
  { id: 'admin-baja', rol: 'ADMIN', sucursal_id: null, activo: 0 },
  { id: 'empleada', rol: 'EMPLEADO', sucursal_id: 'c1', activo: 1 },
];
// Lo que PowerSync guarda al replicar `usuarios`: sus "lookups".
const guardados = usuarios.flatMap((fila) =>
  reglas.evaluateParameterRow({ connectionTag: 'default', schema: 'public', name: 'usuarios' }, fila).filter((r) => 'lookup' in r),
);
const fuente = {
  getParameterSets: async (lookups) => lookups.map((lookup) => ({
    lookup,
    rows: guardados.filter((g) => g.lookup.serializedRepresentation === lookup.serializedRepresentation).flatMap((g) => g.bucketParameters),
  })),
};
async function buckets(quien, params) {
  // El id de la cuenta va en `userIdJson`: con `{ sub }` llega null y no se ve ningún bucket.
  const pedido = new RequestParameters({ userIdJson: quien, parsedPayload: { sub: quien } }, params);
  const { querier } = reglas.getBucketParameterQuerier({ globalParameters: pedido, hasDefaultStreams: true, streams: {} });
  return [...querier.staticBuckets, ...(await querier.queryDynamicBucketDescriptions(fuente))].map((b) => b.bucket).sort();
}
console.log(await buckets('admin', { sucursal_id: 'c2' }));
```

```bash
docker cp docker/powersync/sync-rules.yaml lavanderia-powersync:/tmp/real.yaml
docker cp evaluar.mjs lavanderia-powersync:/tmp/evaluar.mjs
docker exec -w /app/packages/sync-rules lavanderia-powersync node /tmp/evaluar.mjs
```

El resultado con las reglas finales:

```
ADMIN atendiendo en Norte            ["atencion_admin[\"c2\"]","global[]"]
ADMIN sin elegir sucursal            ["global[]"]
ADMIN dado de baja pidiendo Norte    []
EMPLEADA del Centro pidiendo Norte   ["global[]","sucursal[\"c1\"]"]
EMPLEADA del Centro sin parámetro    ["global[]","sucursal[\"c1\"]"]
fila de ordenes en c2                ["atencion_admin[\"c2\"]","sucursal[\"c2\"]"]
```

Esta corrida también cambió el bucket. La primera versión, sin la condición `IS NOT NULL`, le daba al
ADMIN que no atiende un `atencion_admin[null]`. Venía vacío (ninguna orden tiene sucursal nula), pero
era un bucket inútil en cada conexión. Leyendo el archivo no se veía; corriéndolo, sí.

**Ya explicado antes:**

- **Sync rules y buckets** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)
- **Validar las sync rules antes de reiniciar** y **reiniciar PowerSync con reglas nuevas** → SPEC-ALE186-024 (`specs/notas/SPEC-ALE186-024-sync-global-activos.md`)
- **Bucket con parámetros vacíos (interruptor sin columnas)** → SPEC-ALE186-024 (`specs/notas/SPEC-ALE186-024-sync-global-activos.md`)
- **Autenticación vs autorización (401 y 403)** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **La contraprueba (que el detector detecte)** → SPEC-KRILINXI-020 (`specs/notas/SPEC-KRILINXI-020-csp-frontend.md`)

## Decisiones y por qué

- **Un bucket aparte y no ampliar `sucursal`.** Meter el parámetro en el bucket del empleado lo
  habría hecho escuchar a la tablet también para los empleados. Separados, el bucket del empleado
  sigue sin leer nada de la tablet, y un test lo vigila.
- **Sin `accept_potentially_dangerous_queries`**: ver «Una advertencia que no hay que callar». La spec
  se corrigió durante la implementación, con el visto bueno del owner.
- **El parámetro se llama `sucursal_id`**, como la columna, para que en la 029 se lea igual en los dos
  lados.
- **No se reinició el PowerSync de desarrollo.** El validador y el motor son el mismo código que corre
  el servicio. Cada uno tiene que hacer `docker compose restart powersync` después del pull (está en
  «Avisos para el frontend»).

## Los tests

- **Reusé** las funciones de `backend/tests/unit/syncRules.test.ts` (`bucket`, `parametros`,
  `consultasData`), que leen el archivo como texto. Los tests nuevos son un `describe` con la
  etiqueta de esta spec.
- **Se escribieron antes que el bucket**, y fallaron los dos que dependían de él. Los otros dos
  vigilan cosas que ya eran ciertas (que no esté el flag y que el bucket del empleado no lea
  parámetros): son las que no se pueden romper después.
- **Lo que el test de texto no prueba** (qué buckets recibe cada cuenta) lo probó el motor de
  PowerSync. Quedó en esta bitácora y no en la suite, porque el motor vive en el contenedor y la
  suite corre sin Docker (CLAUDE.md §4).

## Si mañana tenés que tocar esto

- Cualquier cambio en `sync-rules.yaml`: primero el validador, después `evaluar.mjs` con los casos de
  arriba, y recién ahí reiniciar PowerSync.
- Si agregás otro bucket con `request.parameters()`, atalo a `request.user_id()`. Si el validador
  avisa «Potentially dangerous», es porque no lo está: arreglá la consulta, no apagues el aviso.
