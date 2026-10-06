---
id: SPEC-ALE186-011
spec: specs/SPEC-ALE186-011-sucursales-admin.md
explica:
  - deduccion del tipo de un parametro en postgres
  - unicidad sin restriccion en la base
---

# SPEC-ALE186-011 — Alta, edición y cierre de sucursales

## Qué se construyó

El admin puede abrir las sucursales que faltan, corregir su nombre, dirección y teléfono,
y cerrarlas. Hasta ahora solo existía la que crea la semilla, así que no había dónde
asignar al personal de las otras dos. Dos reglas protegen el negocio: no puede haber dos
sucursales con el mismo nombre, y no se cierra una sucursal que todavía tiene ropa
esperando a su dueño.

## Cómo funciona, paso a paso

Sigamos un cierre que se rechaza: el admin manda `PATCH /api/sucursales/:id` con
`{ "activa": false }`, y en esa sucursal hay una orden EN_PROCESO.

1. **Ruta y controller.** `sucursales.routes.ts` exige sesión y rol ADMIN. `patchSucursal`
   (`backend/src/controllers/sucursales.controller.ts`) valida que `activa` sea booleano,
   arma `cambios = { activa: false }` y llama
   `sucursales.actualizar(id, cambios, sesionDe(req).id)`.
2. **La regla entra en la sentencia.** En `actualizar` (`backend/src/models/sucursales.model.ts:176`),
   como se está cerrando, se agregan los estados abiertos como `$2` (`:196`) y una
   condición más para la fila de antes:
   `NOT EXISTS (SELECT 1 FROM ordenes WHERE sucursal_id = $1 AND estado = ANY($2))`.
   Esa condición va dentro del `SELECT … FOR UPDATE` que arma `updateConAntes`
   (SPEC-ALE186-010), junto con `id = $1`.
3. **Postgres no escribe.** Como hay ropa abierta, `antes` sale vacío, el UPDATE no toca
   nada y `auditada` no tiene de dónde sacar una fila. No se cierra y no se anota.
4. **Se averigua por qué** (`:225` en adelante), igual que en `ordenes.actualizar`. ¿Existe?
   Sí. ¿Se pidió un nombre ocupado? No. Entonces es la ropa, y `contarOrdenesAbiertas`
   cuenta cuántas órdenes quedan.
5. **El controller lo traduce** (`case 'con-ropa-abierta'`, `sucursales.controller.ts:138`) a
   un 409 `SUCURSAL_CON_ROPA` que dice "Queda 1 orden con ropa en esta sucursal. Los
   clientes vuelven a retirarla acá…".

El alta es lo mismo con un INSERT. La condición del nombre va en el `WHERE` de un
`INSERT … SELECT` (`:123`), y si no insertó se mira primero si es un reintento (el id ya
existe) antes de culpar al nombre.

## Dónde encaja en la arquitectura

No hay piezas nuevas: model, controller y ruta, con la misma forma que usuarios
(SPEC-ALE186-009). Vale la pena notar una sola cosa. `contarOrdenesAbiertas` consulta
`ordenes` desde el model de sucursales, cuando la regla es que cada tabla tiene un model
dueño. Queda acá porque es la pregunta de esta tabla ("¿se puede cerrar?") y la misma
condición ya está escrita en el UPDATE de al lado; si se moviera a `ordenes.model.ts`,
la regla quedaría partida en dos archivos. Es una lectura discutible, no una regla del
proyecto: si aparece un segundo uso, se mueve.

## Fundamentos

**Postgres deduce el tipo de cada parámetro, y tiene que deducir uno solo.** Cuando
mandás `$2` sin decir su tipo, Postgres lo deduce de dónde se usa. En el alta, `$2` iba a
la columna `nombre` (que es `VARCHAR(100)`) y también a `btrim($2::text)`. Son dos
deducciones distintas para el mismo parámetro, y Postgres no elige: rechaza la sentencia
con `inconsistent types deduced for parameter $2 — text versus character varying`. Para
quien llamaba, eso era un 500. Se arregla casteando al **mismo** tipo de la columna,
`$2::varchar` (`sucursales.model.ts:84`). El error no se podía ver con los tests
unitarios: el doble del pool acepta cualquier texto como SQL. Lo encontró `npm run
test:db` en la primera corrida, que es exactamente para lo que existe (CLAUDE.md, sección 4).
Un pariente cercano, también de este spec: un parámetro que **no aparece** en el SQL
también falla ("could not determine data type"). Por eso los estados abiertos solo
viajan como `$2` cuando se está cerrando (`:196`), y hay un test unitario que lo vigila.

**Unicidad sin restricción en la base.** Lo correcto sería un índice único sobre
`lower(btrim(nombre))`, pero el schema no lo tiene y el proyecto no tiene migraciones:
agregarlo obligaría a todos a `down -v`. La segunda mejor opción no es "consultar primero
y después insertar", porque eso abre la carrera de leer y luego escribir: la regla va
**dentro** de la sentencia que escribe (`nombreLibre`, `:84`). Lo que esto todavía no
cubre, y conviene saberlo: dos altas **simultáneas** con el mismo nombre pueden pasar las
dos, porque ninguna ve la fila de la otra hasta que la otra confirma. Una restricción
única sí lo impediría. Se aceptó porque esto lo hace solo el admin, pocas veces en la
vida del sistema; para algo de alta concurrencia, como la boleta, existe un UNIQUE de verdad.

**Ya explicado antes:**

- **INSERT … SELECT condicional** → SPEC-ALE186-005 (`specs/notas/SPEC-ALE186-005-pagos-api.md`)
- **Condición de carrera al leer y luego escribir** → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Leer la fila de antes en el mismo UPDATE** → SPEC-ALE186-010 (`specs/notas/SPEC-ALE186-010-auditoria-registro.md`)
- **Reintento idempotente frente a choque de id** → SPEC-ALE186-009 (`specs/notas/SPEC-ALE186-009-usuarios-admin.md`)
- **Unión discriminada** (el `ResultadoActualizar`) → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)

## Decisiones y por qué

- **Cerrar con ropa adentro se rechaza; cerrar con empleados asignados, no.** La ropa
  ata al cliente a esa sucursal (sección 3) y cerrarla lo dejaría sin dónde retirar. Los
  empleados, en cambio, se mueven con un PATCH. El costo está anotado en CLAUDE.md §13:
  un empleado que sigue asignado a una sucursal cerrada puede seguir registrando ropa.
- **El 409 dice cuántas órdenes quedan.** "No se puede cerrar" sin más deja al admin sin
  saber si es una orden olvidada o el trabajo de una semana.
- **Reabrir no mira nada.** Volver a abrir no puede romper ninguna regla.

## Los tests

- **Creado: `tests/helpers/sucursales.ts`** (`sucursalDePrueba`, `cuerpoDeSucursal`), con
  el mismo patrón que las demás factories. `usuarios.test.ts` tenía su propia sucursal
  suelta (`SUCURSAL_ABIERTA`) y ahora usa la factory, para que no haya dos versiones. El
  nombre del cuerpo lleva un sufijo único: contra la base real, la regla del nombre
  haría chocar a dos tests que usaran "Norte".
- **Reusados:** `comoAdmin`, `conSesion`, `cuerpoDeAltaUsuario`, `escenario`, `crearOrden`,
  `auditoriaDe` y la tabla `ESCRITURAS`, que ahora tiene diez líneas.
- El criterio de "una sucursal cerrada no recibe personal" se probó en `tests/db`, por
  HTTP de punta a punta contra la base real, y no con dobles en `tests/http`: con dobles,
  "cerrada" sería un valor que el test inventa, no el que dejó el PATCH.

## Si mañana tenés que tocar esto

- **Si algún día hay migraciones**, el índice único sobre `lower(btrim(nombre))` reemplaza
  a `nombreLibre` y cierra la carrera de las altas simultáneas.
- **Cualquier parámetro que se compare con una columna `VARCHAR`** casteálo a `::varchar`,
  no a `::text`, si el mismo parámetro también se escribe en esa columna.
