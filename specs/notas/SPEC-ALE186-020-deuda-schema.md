---
id: SPEC-ALE186-020
spec: specs/SPEC-ALE186-020-deuda-schema.md
explica:
  - indice de expresion
  - indice parcial
  - indice unico contra una carrera
  - migracion de datos (backfill)
  - traducir un error de la base a uno del negocio
---

# SPEC-ALE186-020 — Deuda del schema: de parches en el código a columnas e índices

## Qué se construyó

Nada que el negocio vea: la API responde exactamente igual. Lo que cambió es **quién
garantiza tres reglas**. Antes de SPEC-ALE186-019 no había migraciones, así que tres cosas
que pedían un cambio de schema se resolvieron con código:

| Regla | Antes (parche) | Ahora |
|---|---|---|
| Marca "revisar" de lo que sube una cuenta dada de baja (018) | clave `revision` dentro de `valores_anteriores` | columna `auditoria.revision` |
| Cuándo se cerró una sucursal (014) | se buscaba en la auditoría el último EDITAR con `activa: true` | columna `sucursales.cerrada_en` |
| Nombre de sucursal único (011) | condición `WHERE NOT EXISTS` dentro de cada sentencia | índice único `uq_sucursales_nombre` |

Y de paso, un índice en `auditoria.registro_id`, que la revisión del backend del
2026-10-09 encontró faltante. Son las migraciones `001` a `004` de `backend/migraciones/`.

## Cómo funciona, paso a paso

### El caso que el parche no cubría: dos altas con el mismo nombre a la vez

Dos admins, en dos pestañas, dan de alta "Central" al mismo tiempo.

1. Cada pedido llega a `POST /api/sucursales` y el controller llama a
   `sucursales.registrar` (`backend/src/models/sucursales.model.ts:105`).
2. El model arma un `INSERT … VALUES ($1..$4) ON CONFLICT (id) DO NOTHING`
   (`sucursales.model.ts:111-114`), envuelto en `conAuditoria` para que la fila de auditoría
   vaya en la misma sentencia. **Ya no lleva ninguna condición sobre el nombre.**
3. Las dos sentencias llegan a Postgres. La primera inserta y deja su entrada en el índice
   `uq_sucursales_nombre` (`backend/migraciones/003_sucursales_nombre_unico.sql:31`). La
   segunda intenta insertar la misma clave del índice, `lower(btrim('Central'))`, **espera**
   a que la primera confirme, y entonces falla con el código `23505` (unique_violation).
4. El model atrapa ese error (`sucursales.model.ts:120-126`): `nombreRepetido`
   (`sucursales.model.ts:77`) mira que el código sea `23505` **y** que la restricción sea la
   del nombre, y lo convierte en `NombreOcupadoError`.
5. El controller ya sabía traducir ese error (`backend/src/controllers/sucursales.controller.ts:91`)
   a `409 NOMBRE_SUCURSAL_DUPLICADO`. No cambió una línea.

Con el parche viejo, el paso 3 no frenaba nada: cada sentencia preguntaba "¿hay otra con
este nombre?" con un `NOT EXISTS`, y ninguna veía la fila de la otra porque todavía no
estaba confirmada. Entraban las dos.

### Cerrar una sucursal y registrar ropa después

1. `PATCH /api/sucursales/:id` con `{ activa: false }` llega a `sucursales.actualizar`.
2. Además de `activa = $n`, el model agrega a la misma sentencia
   `cerrada_en = CASE WHEN c.activa THEN LOCALTIMESTAMP ELSE c.cerrada_en END`
   (`sucursales.model.ts:205`). En el `SET` de un `UPDATE`, `c.activa` es el valor de antes:
   si estaba abierta, se anota la hora; si ya estaba cerrada, se deja la fecha que tenía.
   Reabrir pone `cerrada_en = NULL` (`sucursales.model.ts:206`).
3. Más tarde sube una orden. El INSERT de `ordenes.model.ts:214` acepta la sucursal si está
   activa **o** si la `fecha_entrada` es anterior a `s.cerrada_en`. Es una columna de la
   fila que ya estaba leyendo; antes era una subconsulta a la auditoría entera.

### Lo que hicieron las migraciones con los datos que ya había

- `001` crea la columna y **mueve** las marcas: copia `valores_anteriores->>'revision'` a la
  columna y la quita del JSON; si el JSON queda `{}` (un alta marcada), lo vuelve `NULL`,
  que es como queda un alta sin marca.
- `002` crea `cerrada_en` y la rellena desde la auditoría, con la misma búsqueda que hacía
  el parche (el último EDITAR de esa sucursal donde `activa` era `true` antes del cambio).
  Una cerrada sin rastro queda en `NULL`, y entonces no acepta ropa: `x < NULL` no es
  verdadero en SQL.
- `003` antes de crear el índice busca nombres repetidos. Si los hay, falla con un mensaje
  que los nombra (`003_sucursales_nombre_unico.sql:27`); como cada migración corre en su
  transacción (SPEC-ALE186-019), no queda nada a medias.

## Dónde encaja en la arquitectura

- **Las migraciones** (`backend/migraciones/`) son las únicas que cambian el schema. Nunca
  se edita `context/lavanderia_schema.sql` (la línea base) ni una migración ya aplicada.
- **Los models** siguen siendo los únicos que escriben SQL, y ahora también los únicos que
  conocen el nombre del índice (`RESTRICCION_NOMBRE`). El controller recibe un error del
  negocio (`NombreOcupadoError`, o `{ tipo: 'nombre-ocupado' }`), nunca un `23505`: si un
  controller empezara a mirar códigos de Postgres, cambiar la base obligaría a tocar la capa
  HTTP.
- **La regla vive donde no se puede saltar.** Un índice frena también una escritura hecha a
  mano en la base o desde un camino nuevo que olvide la condición. El parche solo protegía a
  quien pasara por `sucursales.model.ts`.

## Fundamentos

### Índice único contra una carrera

Un chequeo "¿ya existe?" seguido de un "inserto", aunque vayan en la misma sentencia, mira
una foto de la tabla: no ve lo que otra transacción está escribiendo y todavía no confirmó.
Dos pedidos simultáneos ven la misma foto vacía y entran los dos. Un **índice único** no
mira fotos: cuando la segunda escritura quiere poner la misma clave, Postgres la hace
esperar a que la primera termine y, si confirmó, la rechaza. Es la única forma de que "no
puede haber dos" sea cierto bajo concurrencia sin bloquear la tabla entera.
El test que lo demuestra lanza dos altas con `Promise.all`
(`backend/tests/db/deudaSchema.db.test.ts`, "dos altas a la vez…"): una recibe 201 y la otra
409.

### Índice de expresión

Un índice no tiene por qué ser sobre una columna tal cual: puede ser sobre el resultado de
una expresión. `ON sucursales (lower(btrim(nombre)))` indexa el nombre normalizado, así que
"Central" y " central " chocan aunque se guarden distintos. Se guarda lo que escribió el
admin y se compara lo normalizado. La expresión tiene que ser determinista (siempre el mismo
resultado para el mismo valor), si no Postgres no la acepta en un índice.

### Índice parcial

`CREATE INDEX … ON auditoria (revision) WHERE revision IS NOT NULL`
(`001_auditoria_revision.sql`) solo indexa las filas que cumplen la condición. Casi ninguna
fila de auditoría tiene marca, así que el índice es diminuto, y es exactamente lo que usa el
filtro `?revisar=true` (`auditoria.model.ts:313`). Indexar la columna entera guardaría
millones de `NULL` que nadie busca.

### Migración de datos (backfill)

Agregar una columna es la mitad del trabajo: las filas que ya existen la reciben vacía. Una
migración de datos la **rellena** con lo que se sabía por otro lado (acá, la auditoría) en la
misma transacción que la crea. La regla: el código nuevo tiene que poder confiar en la columna
desde el primer momento, así que nunca se publica una columna nueva vacía esperando que "se
llene sola". Y si para algún dato no hay de dónde sacarlo, se elige a propósito el valor más
seguro (`cerrada_en = NULL` → no acepta nada) en vez de inventar uno.

### Traducir un error de la base a uno del negocio

Que la base rechace es la garantía, pero su error (`23505`, `uq_sucursales_nombre`) no le
dice nada a quien usa la API. El model lo atrapa, comprueba que sea **ese** rechazo y no otro
(`nombreRepetido`, `sucursales.model.ts:77`: el código y el nombre de la restricción) y lo
vuelve un error del dominio. Cualquier otro error se relanza tal cual: tragarse un `23505` de
otra restricción lo convertiría en un mensaje mentiroso.

**Ya explicado antes:**

- **Migración de schema** y **transacción explícita** → SPEC-ALE186-019 (`specs/notas/SPEC-ALE186-019-migraciones-schema.md`)
- **Unicidad sin restricción en la base** (el parche que esta spec reemplaza) → SPEC-ALE186-011 (`specs/notas/SPEC-ALE186-011-sucursales-admin.md`)
- **Un dato que no está en la tabla puede salir del historial** (el cierre deducido de la auditoría) → SPEC-ALE186-014 (`specs/notas/SPEC-ALE186-014-ordenes-sucursal-cerrada.md`)
- **Leer la fila de antes en el mismo UPDATE** y **jsonb** → SPEC-ALE186-010 (`specs/notas/SPEC-ALE186-010-auditoria-registro.md`)
- **Idempotencia** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)

## Decisiones y por qué

- **El reintento de un alta sigue siendo 200.** `ON CONFLICT (id)` arbitra solo sobre el id:
  en un reintento chocan el id y el nombre a la vez, y gana el id sin error. Si se hubiera
  usado `ON CONFLICT DO NOTHING` sin destino, también se tragaría el choque de nombre con
  otro id y habría que distinguirlos después.
- **"Cerrar" una cerrada no corre la fecha.** Correrla haría la regla más permisiva: entraría
  la ropa cargada entre los dos "cierres". Por eso el `CASE` sobre el valor de antes.
- **`cerrada_en` no se audita como campo.** Lo que cambia el admin es `activa`, y eso ya queda
  en la auditoría; `cerrada_en` es una consecuencia que pone el servidor.
- **La migración 003 falla en vez de renombrar sola.** Elegir cuál de dos sucursales
  "Central" se renombra es una decisión del negocio, no de un script.

## Los tests

- **Reusados:** `baseDescartable({ conLineaBase: true })` (SPEC-ALE186-019) para probar cada
  migración sobre una base con la forma de antes; `escenario`, `crearUsuario` y `contar` de
  `tests/helpers/baseReal.ts`; `cuerpoDeSucursal`, `cuerpoDeOrden`, `comoAdmin`, `conSesion`.
  En los unitarios, `unicidadViolada` de `tests/helpers/postgres.ts` para fingir el `23505`.
- **No se creó ningún helper nuevo.** El patrón de `deudaSchema.db.test.ts` para probar una
  migración de datos es el que va a copiar la próxima: base descartable con línea base →
  insertar filas con la forma vieja (SQL a mano, porque el código ya no las escribe así) →
  `migrar(conexion, CARPETA_DE_MIGRACIONES)` → leer cómo quedaron.
- Los tests de SPEC-ALE186-011 y -014 pasaron **sin cambios**: son la prueba de que la
  API no cambió. Solo se reescribieron los unitarios que afirmaban el SQL del parche.

## Si mañana tenés que tocar esto

- Para otra regla de unicidad: índice o `UNIQUE` en una migración, y en el model traducir su
  `23505` mirando `error.constraint`. Nada de `NOT EXISTS`.
- Si renombrás un índice, cambiá también la constante del model (`RESTRICCION_NOMBRE`), o el
  409 se vuelve un 500.
- Los timestamps de la base son `TIMESTAMP` sin zona, en la hora de la sesión (UTC).
  `cerrada_en` usa `LOCALTIMESTAMP`, igual que `auditoria.fecha`, y por eso se compara con
  `$9::timestamptz::timestamp` sin convertir zonas.
