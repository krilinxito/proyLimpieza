---
id: SPEC-ALE186-013
spec: specs/SPEC-ALE186-013-estadisticas-volumen.md
explica:
  - filter en una funcion de agregacion
  - union all para juntar hechos de varias tablas
---

# SPEC-ALE186-013 — Volumen de órdenes y productividad

## Qué se construyó

Los dos paneles que le faltaban al dashboard del admin. **Volumen:** cuánta ropa entró
cada día, con los días flojos también a la vista (en cero) y las anulaciones aparte.
**Productividad:** qué hizo cada persona en el período (órdenes recibidas, cobros con su
monto, entregas), separado por sucursal. Si alguien cambió de sucursal, sus números
quedan en cada sucursal donde los hizo.

## Cómo funciona, paso a paso

Sigamos `GET /api/estadisticas/productividad?desde=2025-05-01&hasta=2025-05-31`.

1. **Controller** (`backend/src/controllers/estadisticas.controller.ts:42`): lee el período
   con `leerPeriodo(req.query)` (`utils/periodo.ts`, el compartido desde SPEC-ALE186-012) y
   llama al model. No valida nada propio: no hay más parámetros que el período.
2. **El model junta tres tablas en una** (`backend/src/models/estadisticas.model.ts:427`).
   El CTE `acciones` hace un `UNION ALL` de órdenes, pagos y entregas (`:433`, `:435`),
   llevando a las tres a la misma forma: quién (`usuario_recepcion_id`, `usuario_id`,
   `usuario_entrega_id`), dónde (`sucursal_id` de **ese** registro), qué tipo, cuánto (solo
   los cobros) y cuándo.
3. **Filtra y agrupa.** El día se calcula en hora de Bolivia (`horaDelNegocio`), se agrupa
   por persona y sucursal, y `COUNT(*) FILTER (WHERE tipo = 'COBRO')` separa cada tipo
   dentro del mismo grupo. La sucursal sale del registro (`JOIN sucursales s ON s.id =
   a.sucursal_id`, `:445`), nunca de `usuarios.sucursal_id`.
4. **Sale** una fila por persona y sucursal, con `montoCobrado` sumado en Postgres como
   texto (`"125.50"`).

El volumen (`:359`) es más simple: `generate_series` arma la lista de días del período
(`:362`) y un `LEFT JOIN` cuenta las órdenes de cada uno.

## Dónde encaja en la arquitectura

No hay piezas nuevas: dos funciones en el model de estadísticas, dos handlers y dos rutas,
con las mismas reglas que SPEC-ALE186-008 (Postgres cuenta y suma, los montos salen como
texto, las fechas en hora de Bolivia). Se usó por primera vez el período compartido de
`utils/periodo.ts` para endpoints nuevos: no hubo que escribir ninguna validación de fechas.

## Fundamentos

**`UNION ALL` para juntar hechos de varias tablas.** Una orden recibida, un cobro y una
entrega viven en tres tablas distintas, con columnas distintas, pero para "qué hizo cada
persona" son lo mismo: un hecho con autor, sucursal y fecha. `UNION ALL` apila los
resultados de varios `SELECT` uno debajo del otro, siempre que tengan la misma cantidad de
columnas, en el mismo orden y con tipos compatibles. Por eso el pago aporta `monto` y los
otros dos aportan `NULL::numeric`. Es `UNION ALL` y no `UNION` a secas porque `UNION`
elimina filas repetidas, y dos cobros del mismo monto, el mismo día y por la misma persona
son dos cobros, no uno. Sin esto habría tres consultas y una mezcla en TypeScript, que es
justo lo que §8 prohíbe ("el frontend no suma", y el backend tampoco: suma Postgres).

**`FILTER` en una función de agregación.** `COUNT(*) FILTER (WHERE a.tipo = 'COBRO')` cuenta
solo las filas del grupo que cumplen la condición. Permite sacar varios conteos de un
mismo `GROUP BY` sin repetir la consulta. La alternativa clásica es
`SUM(CASE WHEN … THEN 1 ELSE 0 END)`, que hace lo mismo pero se lee peor. Ojo con un
detalle de `SUM … FILTER`: si ninguna fila cumple, da `NULL`, no 0. Por eso
`montoCobrado` lleva `COALESCE(…, 0)`, y una persona que solo recibió ropa sale con `"0.00"`.

**Ya explicado antes:**

- **Agrupar sobre una lista fija (VALUES + LEFT JOIN)** → SPEC-ALE186-008 (`specs/notas/SPEC-ALE186-008-estadisticas-cobros.md`). `generate_series` es la misma idea con la lista de días generada en vez de escrita.
- **Funciones de ventana** → SPEC-ALE186-008 (los totales del volumen).
- **Zona horaria del negocio (AT TIME ZONE)** → SPEC-ALE186-008.
- **Dato histórico de algo que no cambia** → SPEC-ALE186-012 (`specs/notas/SPEC-ALE186-012-auditoria-consulta.md`): por qué la productividad usa la sucursal del registro.

## Decisiones y por qué

- **Las anuladas cuentan en el volumen del día.** La ropa entró y el mostrador trabajó;
  que después se anulara no borra ese trabajo. Se informan aparte para quien quiera
  restarlas.
- **Las órdenes anuladas también cuentan como "recibidas"** en productividad, por la misma
  razón.
- **Quien no hizo nada en el período no aparece.** Mostrar a todo el personal en cero
  exigiría decidir en qué sucursal poner a cada uno, y "la de hoy" es justo la regla que
  se descartó.

## Los tests

- **No hizo falta ningún helper nuevo:** `crearOrden` (con fecha y sucursal), `crearPago`
  (con fecha), `crearEntrega` y `escenario` alcanzaron.
- El test del empleado movido (`backend/tests/db/estadisticasVolumen.db.test.ts:98`) **lo
  mueve de verdad** (`:107`) entre la primera orden y la segunda. La primera versión solo
  registraba órdenes en dos sucursales, y una implementación equivocada que agrupara por
  `usuarios.sucursal_id` también la habría pasado. Un test tiene que poder fallar con el
  error que pretende atrapar.
- El primer test unitario del model de estadísticas (`tests/unit/estadisticas.model.test.ts`)
  vigila solo lo que se decide en TypeScript: parámetros, el uso de `horaDelNegocio` y que
  no aparezca `u.sucursal_id`. Que cuente bien lo dice la base real.
