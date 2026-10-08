---
id: SPEC-ALE186-015
spec: specs/SPEC-ALE186-015-hora-del-servidor.md
explica:
  - cambio aditivo en una api con clientes desplegados
---

# SPEC-ALE186-015 — La hora del servidor y la fecha de cada hecho

## Qué se construyó

Dos piezas del lado del servidor para el problema de los relojes de tablet. **Una:** cada
vez que la tablet entra o renueva la sesión, el servidor le dice qué hora es. Con eso la
tablet puede corregir su propio reloj; esa parte es del frontend y queda pendiente
(CLAUDE.md §13). **Dos:** en la auditoría, el admin ve para cada orden, cobro o entrega
cuándo pasó de verdad y, aparte, cuándo llegó al servidor. Para algo cargado sin
internet, la diferencia se nota.

## Cómo funciona, paso a paso

**`ahora` en el login.** `postLogin` (`backend/src/controllers/auth.controller.ts:93`) arma
la respuesta de siempre y le suma `ahora: await reloj.ahora()`. `reloj.ahora`
(`backend/src/models/reloj.model.ts:15`) hace `SELECT now()` y devuelve el `Date` que
entrega `pg` como ISO en UTC: `2026-10-08T14:05:03.123Z`. La renovación hace lo mismo
(`auth.controller.ts:115`).

**`fechaDelHecho` en la auditoría.** `FECHA_DEL_HECHO`
(`backend/src/models/auditoria.model.ts:267`) es un `CASE` sobre `tabla_afectada`, gemelo de
`SUCURSAL_DE_LA_ACCION` (SPEC-ALE186-012): para una orden toma su `fecha_entrada`, pero
solo en el alta; para un pago, `fecha_pago`; para una entrega, `fecha_entrega`; para el
resto, NULL. Entra al CTE como columna (`:287`), y en el SELECT final se formatea en hora
de Bolivia con el mismo `$3` (la zona) que ya usaba la consulta (`:334`). No se agregó
ningún parámetro.

El test `backend/tests/db/horaDelServidor.db.test.ts:55` hace el recorrido de una orden
cargada "sin internet" con fecha 15 de enero a las 18:00 y subida hoy: su CREAR muestra
`fechaDelHecho: 2026-01-15 18:00:00` y una `fecha` de hoy.

## Dónde encaja en la arquitectura

- **`reloj.model.ts` es un model sin tabla.** Es la única forma de que el controller
  obtenga la hora de la base sin escribir SQL (§5). Su scope no estaba en la spec;
  meter "qué hora es" en el model de usuarios o de auditoría habría sido más raro.
- **Por qué Postgres y no `new Date()`:** la regla de SPEC-ALE186-014 que rechaza fechas
  futuras compara contra `now()` de Postgres. Si la tablet se calibrara contra el reloj
  de Node, podría quedar bien según Node y mal según la base, y en Docker los dos pueden
  diferir. Un solo reloj de referencia para calibrar y para juzgar.

## Fundamentos

**Un cambio aditivo no rompe a quien ya consume la API.** Al tocar la respuesta de un
endpoint que ya tiene clientes (acá, el frontend de SPEC-KRILINXI-003), hay dos tipos de
cambio. **Agregar** un campo es seguro si el cliente ignora lo que no conoce: el
frontend valida la sesión con `esSesion` (`frontend/src/features/auth/types.ts`), que
comprueba que estén `token`, `tokenPowerSync` y `usuario`, y no le molesta que haya algo
más. **Quitar, renombrar o cambiar el tipo** de un campo, en cambio, rompe a cualquier
cliente que lo lea, y con PWAs instaladas en tablets puede haber versiones viejas de la
app dando vueltas durante días. Por eso `ahora` es un campo nuevo y ningún campo existente
cambió (lo verifica el test de HTTP), y por eso los errores no lo llevan: el formato de
error uniforme (SPEC-ALE186-001) es otro contrato que tampoco se toca. La regla práctica:
en una API con clientes desplegados, primero se agrega y nunca se cambia en el lugar. Si
algo tiene que cambiar de verdad, se agrega lo nuevo, se migra a los clientes, y recién
después se quita lo viejo.

**Ya explicado antes:**

- **Subconsulta escalar correlacionada** → SPEC-ALE186-012 (`specs/notas/SPEC-ALE186-012-auditoria-consulta.md`)
- **Dato histórico de algo que no cambia** → SPEC-ALE186-012
- **No confiar en el reloj de quien manda el dato** → SPEC-ALE186-014 (`specs/notas/SPEC-ALE186-014-ordenes-sucursal-cerrada.md`)
- **Zona horaria del negocio (AT TIME ZONE)** → SPEC-ALE186-008
- **Formato de error uniforme** → SPEC-ALE186-001

## Los tests

- **Reusados:** `ahoraEnLaBase` (de SPEC-ALE186-014), justo para comparar `ahora` con el
  reloj de la base; `escenario`, `crearUsuario`, `crearSucursal`, `cuerpoDeAltaUsuario` y
  los cuerpos de orden, pago y entrega.
- **Doble del reloj en los tests HTTP:** `auth.test.ts` y `usuarios.test.ts` no tienen base,
  y ahora el login le pregunta la hora a Postgres. Se les agregó
  `vi.mock('../../src/models/reloj.model.js')` con una hora fija. Eso además deja comprobar
  que `ahora` llega a la respuesta exactamente como salió del model. Cualquier test HTTP
  nuevo que haga login va a necesitar ese mismo mock.
