---
id: SPEC-ALE186-012
spec: specs/SPEC-ALE186-012-auditoria-consulta.md
explica:
  - dato historico de algo que no cambia
  - paginacion con limit/offset y total aparte
  - subconsulta escalar correlacionada
---

# SPEC-ALE186-012 — Consulta de la auditoría para el admin

## Qué se construyó

El admin ya puede ver "quién hizo qué": cada alta, edición, cobro, entrega y login, con
fecha y hora de Bolivia, quién lo hizo y qué valor tenía antes lo que cambió. Lo puede
filtrar por fechas, por persona, por tipo de acción, por registro y por sucursal, y lo
recibe de a páginas. Lo importante del filtro por sucursal: una acción queda en la
sucursal donde **ocurrió**. Si a una empleada la pasan de Central a Norte, lo que hizo en
Central sigue saliendo en Central.

## Cómo funciona, paso a paso

Sigamos la pregunta "¿qué hizo María en Central?":
`GET /api/auditoria?usuario_id=<María>&sucursal_id=<Central>`.

1. **El controller lee la query** (`backend/src/controllers/auditoria.controller.ts:55`).
   El período sale de `leerPeriodo(query)` (`:57`), la misma función que usan las
   estadísticas (`backend/src/utils/periodo.ts:69`). Sin `desde` ni `hasta`, son los últimos
   30 días contando hoy en Bolivia. Después valida cada filtro (que los ids sean UUID, que
   la acción esté en el ENUM) y la paginación (por defecto, página 1 de a 50).
2. **El model arma un CTE `filtradas`** (`backend/src/models/auditoria.model.ts:238`). Por
   cada fila de `auditoria` trae a la persona (`JOIN usuarios`) y calcula **en qué sucursal
   ocurrió** con `SUCURSAL_DE_LA_ACCION` (`:222`): si la fila es de `ordenes`, busca esa
   orden y toma su `sucursal_id`; lo mismo para pagos y entregas; si es el alta de un
   cliente, toma su `sucursal_registro_id`; en cualquier otro caso, `NULL`. Los filtros por
   fechas, persona, acción, tabla y registro van en el `WHERE` interno; el de sucursal va
   afuera, porque necesita la columna ya calculada.
3. **Dos consultas sobre el mismo CTE** (`consultar`, `:275`): una cuenta cuántas filas
   cumplen los filtros (`total`) y la otra trae la página, ordenada de lo más nuevo a lo
   más viejo, con `LIMIT $9 OFFSET $10` (`:293`). La fecha sale ya como texto en hora de
   Bolivia (`horaDelNegocio`, `periodo.ts:102`).
4. **La respuesta:** `{ desde, hasta, pagina, porPagina, total, registros }`. Cada
   registro trae su `sucursalId` (o `null`) y el usuario con nombre y username, para que la
   pantalla no tenga que ir a buscarlos.

Para María: las órdenes que registró estando en Central tienen `sucursal_id = Central`
para siempre, porque una orden no cambia de sucursal. Las que registró después en Norte
tienen Norte. Su `usuarios.sucursal_id` actual no participa en ningún momento. El test
`backend/tests/db/auditoriaConsulta.db.test.ts:34` hace exactamente ese recorrido contra la
base real.

## Dónde encaja en la arquitectura

- Es la segunda lectura online del sistema, junto con las estadísticas (CLAUDE.md §8): la
  tabla `auditoria` no baja a ningún dispositivo (§7), así que se consulta a la API.
- **`utils/periodo.ts` es nuevo y compartido.** `leerPeriodo` vivía dentro de
  `estadisticas.controller.ts`; copiarla en el controller de auditoría habría dejado dos
  versiones que tarde o temprano entenderían distinto el mismo `?desde=`. Un test
  (`backend/tests/unit/periodo.test.ts`) recorre `src/` y falla si alguien vuelve a definir
  otra. `horaDelNegocio` también es SQL y vive en `utils/`: es un fragmento que arman los
  models, no algo que un controller ejecute.
- **El controller no calcula la sucursal ni cuenta nada:** valida y arma la respuesta. El
  model es el único que sabe que "la sucursal de una acción" es un `CASE` sobre la tabla.

## Fundamentos

**Un dato histórico se saca de algo que no cambia.** La pregunta "¿dónde ocurrió esta
acción?" tiene una respuesta que no debería cambiar nunca. Si se responde con un dato que
**sí** cambia, la historia se reescribe sola. Fue el primer borrador de esta spec: usaba
`usuarios.sucursal_id`, la sucursal donde la persona trabaja **hoy**, y mover a alguien
movía también su pasado. La corrección es buscar un dato que quedó fijo en el momento de
la acción: la orden se crea en una sucursal y no se mueve, así que su `sucursal_id` es un
registro histórico fiel. Las estadísticas ya seguían esta regla sin decirlo (suman por la
sucursal del pago, no por la de quien cobró). La regla general, para cualquier consulta
futura: antes de filtrar o agrupar por un campo, preguntate si ese campo puede cambiar
después del hecho. Si puede, no sirve para describir el pasado.

**Subconsulta escalar correlacionada.** `(SELECT o.sucursal_id FROM ordenes o WHERE o.id =
a.registro_id)` es una consulta dentro de otra que devuelve **un solo valor** por cada fila
de afuera, y que usa un dato de esa fila (`a.registro_id`): por eso "correlacionada".
Postgres la evalúa una vez por fila de `auditoria`, buscando por la clave primaria, que
tiene índice. Se eligió en vez de tres `LEFT JOIN` (a órdenes, pagos y entregas) porque el
`CASE` deja leer de un vistazo qué tabla se mira para cada tipo de fila. Con los JOIN,
habría que razonar por qué un pago no matchea contra la tabla de órdenes. Si algún día la
auditoría tiene millones de filas y esto se vuelve lento, el arreglo es filtrar primero por
fecha (que ya va antes) y no cambiar la forma.

**Paginación con LIMIT/OFFSET y el total aparte.** `LIMIT 50 OFFSET 100` es "saltá 100
filas y dame 50": la página 3 de a 50. Para que la pantalla muestre "página 3 de 12" hace
falta el total de filas que cumplen los filtros, que no es lo mismo que las filas de la
página. Se podría pedir en la misma consulta con `count(*) OVER ()` (las funciones de
ventana de SPEC-ALE186-008), pero tiene un problema: en una página más allá de la última no
hay filas, la ventana no tiene sobre qué contar y el total sale 0. Por eso son dos
consultas sobre el **mismo** CTE, y un test unitario comprueba que el texto del CTE y sus
parámetros sean idénticos en las dos.

**Ya explicado antes:**

- **Zona horaria del negocio (AT TIME ZONE)** → SPEC-ALE186-008 (`specs/notas/SPEC-ALE186-008-estadisticas-cobros.md`)
- **Funciones de ventana** → SPEC-ALE186-008 (`specs/notas/SPEC-ALE186-008-estadisticas-cobros.md`)
- **JSONB** → SPEC-ALE186-010 (`specs/notas/SPEC-ALE186-010-auditoria-registro.md`)
- **Type guard** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)

## Decisiones y por qué

- **Editar un cliente no tiene sucursal, y está bien.** Los clientes son de todo el
  sistema y la edición no guarda dónde se hizo. Lo que importa (quién, cuándo, qué cambió)
  está. Esas filas salen sin filtro de sucursal y nunca con él.
- **Las claves de la respuesta van en camelCase** (`tablaAfectada`, `porPagina`), aunque el
  texto de la spec las escribió en snake_case. Todos los demás endpoints responden en
  camelCase (§10, la conversión se hace en los models), y el frontend no debería tener que
  recordar cuál es la excepción. Los parámetros de la query sí van en snake_case
  (`por_pagina`, `sucursal_id`), como en las estadísticas.
- **Los números de la query se exigen como dígitos** (`/^\d+$/`). `Number('1e2')` es 100 y
  `Number(' 3')` es 3: aceptarlos sería aceptar algo que nadie escribió así.

## Los tests

- **Creado: `anotarAuditoria`** en `backend/tests/helpers/baseReal.ts`. Escribe una fila de
  auditoría con la fecha que el test elija. Sin él, probar "las 21:00 de Bolivia" o
  armar cinco días de historia para paginar sería imposible: las escrituras del negocio
  anotan siempre "ahora".
- **Reusados:** `auditoriaDe`, `escenario`, `crearUsuario`, `crearSucursal`, `comoAdmin`,
  `conSesion` y los cuerpos de alta de clientes y órdenes.
- **Cómo se aíslan los tests de base real:** todos comparten una base y escriben auditoría
  en paralelo. Cada test filtra por algo propio (un usuario o un cliente recién creados) y
  nunca cuenta "todo". El test de "consultar no escribe" contaba al principio las filas de
  todos los admins: habría fallado al azar cuando otro archivo creara uno. Ahora cuenta
  solo las de su admin.
- El test de mover al empleado **sí discrimina**: con la regla del primer borrador
  (sucursal de la persona hoy), filtrar por la sucursal vieja daría vacío y el test fallaría.

## Si mañana tenés que tocar esto

- **Una tabla auditada nueva que pertenezca a una sucursal:** sumala a
  `SUCURSAL_DE_LA_ACCION` con su `WHEN`. Si no, sus acciones van a salir sin sucursal.
- **Otra consulta del admin con período:** usá `leerPeriodo` y `horaDelNegocio` de
  `utils/periodo.ts`. No los copies.
