---
id: SPEC-KRILINXI-043
spec: specs/SPEC-KRILINXI-043-ingresos-por-dia-api.md
explica:
  - dos consultas que tienen que dar lo mismo (invariante entre endpoints)
  - el null de un dia vacio en un left join
---

# SPEC-KRILINXI-043 — Lo cobrado por día, en la API

## Qué se construyó

Un endpoint nuevo, `GET /api/estadisticas/ingresos-por-dia`, solo para el ADMIN: cuánto se cobró **cada día** del
período, con el total del día y cuánto fue en efectivo, QR, tarjeta y transferencia. Hasta hoy `/ingresos` daba lo
cobrado en todo el período, pero no cómo vino la caja día a día; con eso no se puede dibujar una línea de tendencia
(SPEC-KRILINXI-044). Es solo backend: no toca el frontend.

## Cómo funciona, paso a paso

Seguimos un pedido: `GET /api/estadisticas/ingresos-por-dia?desde=2024-04-01&hasta=2024-04-05&sucursal_id=…`.

1. **La ruta** (`routes/estadisticas.routes.ts`, la línea de `/ingresos-por-dia`) cuelga del mismo
   `router.use(requireAuth, requireRol('ADMIN'))` que las demás estadísticas: un EMPLEADO recibe 403 y sin token, 401, sin
   que haya que repetir nada.
2. **El controller** (`controllers/estadisticas.controller.ts`, `getIngresosPorDia`) lee el período con `leerPeriodo`, el
   mismo de `/ingresos` y `/volumen`: `desde`/`hasta` son días de Bolivia, sin `desde` son los últimos 30 días, un
   `sucursal_id` que no es UUID es un 400. Llama al model y arma `{ desde, hasta, total, porDia }`. No suma nada.
3. **El model** (`models/estadisticas.model.ts`, `ingresosPorDia`) hace **una sola consulta** con dos tablas
   temporales (CTE):
   - `dias`: todos los días del período, con `generate_series($1::date, $2::date, interval '1 day')`.
   - `cobros`: los pagos del período, filtrados con `enElPeriodo('p.fecha_pago', …)` y agrupados por **día de Bolivia**
     (`horaDelNegocio`) y forma de pago, con `SUM(p.monto)`.
   Después `dias LEFT JOIN cobros`: cada día queda con una fila por cada forma de pago que cobró, o con **una sola fila de
   `NULL`** si ese día no hubo cobros.
4. **Las sumas las hacen funciones de ventana**, no JavaScript: `SUM(cobros.monto) OVER (PARTITION BY dias.fecha)` es
   el total de cada día, y `SUM(cobros.monto) OVER ()`, el del período entero. `COALESCE(…, 0)` convierte el `NULL` de
   un día vacío en `0.00`.
5. **Reacomodar, no sumar.** De vuelta en TypeScript, un `Map` junta las filas de cada día en un solo registro y completa
   con `"0.00"` las formas de pago que no cobraron (`metodosEnCero`, el mismo recurso de `/ingresos`). La respuesta:

   ```json
   { "desde": "2024-04-01", "hasta": "2024-04-02", "total": "15.50",
     "porDia": [ { "fecha": "2024-04-01", "total": "15.50",
                   "porMetodo": { "EFECTIVO": "10.00", "QR": "5.50", "TARJETA": "0.00", "TRANSFERENCIA": "0.00" } },
                 { "fecha": "2024-04-02", "total": "0.00", "porMetodo": { …todo "0.00" } } ] }
   ```

## Dónde encaja en la arquitectura

Sigue el MVC de CLAUDE.md §5 al pie de la letra: la **ruta** solo declara el endpoint y su middleware; el **controller**
valida el período y arma la respuesta, sin SQL; el **model** tiene todo el SQL, parametrizado (`$1…$4`), sin tocar `req` ni
`res`. Y la regla de §8: **los montos se suman en Postgres y salen como texto** (`"125.50"`); el model solo reacomoda
filas. Se reutilizó lo que ya había (`leerPeriodo`, `enElPeriodo`, `horaDelNegocio`, `metodosEnCero`) en vez de
escribir otra forma de leer fechas: así `/ingresos-por-dia` no puede entender distinto el mismo `?desde=2024-04-01`.

## Fundamentos

**El `NULL` de un día vacío.** Un `LEFT JOIN` conserva todas las filas de la tabla de la izquierda (`dias`) aunque no
encuentren pareja a la derecha; las columnas de la derecha quedan en `NULL`. Para un día sin cobros, `cobros.metodo` y
`cobros.monto` son `NULL`, y una suma sobre un `NULL` da `NULL`, no cero. Por eso la consulta envuelve las ventanas en
`COALESCE(…, 0)` y el reacomodo en TypeScript pregunta `fila.metodo !== null` antes de guardar un monto
(`ingresosPorDia`, el `if` del `Map`). Sin eso, un día sin cobros mostraría `null` en vez de `"0.00"`, o se perdería, y
una línea de tendencia saltaría ese día en vez de bajar a cero.

**Dos consultas que tienen que dar lo mismo.** `/ingresos` suma el período entero y `/ingresos-por-dia` lo parte en días;
si las dos filtran `pagos` con las mismas condiciones, **la suma de los días tiene que ser igual al total**. Esa igualdad es
una *invariante entre endpoints*: no se prueba con un valor escrito a mano sino comparando una consulta con la otra. El
test (`tests/db/estadisticasIngresosPorDia.db.test.ts`, "la suma de todos los días da lo mismo que `/ingresos`") carga cobros
repartidos en varios días y formas de pago, pide las dos, suma los días **en centavos enteros dentro del test** y exige que
den lo mismo en total y por forma de pago. Si mañana alguien cambia el filtro de una consulta y se olvida de la otra, el
test falla, que es justo para lo que sirve.

**Ya explicado antes:**

- **Funciones de ventana** (`SUM() OVER (PARTITION BY …)`) → SPEC-ALE186-008 (`specs/notas/SPEC-ALE186-008-estadisticas-cobros.md`)
- **Agrupar sobre una lista fija** (los días con `generate_series` + `LEFT JOIN`) → SPEC-ALE186-008
- **Zona horaria del negocio** (`AT TIME ZONE`) → SPEC-ALE186-008
- **Condición que puede usar un índice (`enElPeriodo`)** → SPEC-ALE186-021 (`specs/notas/SPEC-ALE186-021-consultas-por-fecha.md`)
- **Dobles de prueba** (el pool doblado en el test del model) → SPEC-ALE186-001

## Decisiones y por qué

- **Una sola consulta, no una por día.** Con 30 días serían 30 viajes a la base; `generate_series` + `LEFT JOIN` los trae
  todos de una vez. Con un período largo (se puede pedir `desde=2000-01-01`) son miles de filas de `dias`, igual que ya
  pasa en `/volumen`: no se agregó un tope.
- **El día de un cobro es `fecha_pago` en hora de Bolivia**, no la fecha de la orden: es lo que mira `/ingresos`, y por eso
  coinciden. Un cobro de las 21:00 cae en ese día aunque en UTC ya sea el siguiente (test del borde de las 21:00, y otro de
  la medianoche exacta).
- **Con `total` además de `porDia`**, como `/volumen`: es lo cobrado en todo el período, igual al de `/ingresos`, y le
  ahorra a quien dibuja el gráfico sumar los días.
- **Sin `desde`, los últimos 30 días** (`leerPeriodo`): como las demás estadísticas, no como el historial de boletas
  (SPEC-KRILINXI-040), donde "sin fecha" sí es "todo".

## Los tests

- `tests/http/estadisticas.test.ts` — el **controller**, con el model doblado. No se escribieron tests nuevos de "quién
  entra" ni de "cómo se lee el período": se agregó `/ingresos-por-dia` a la lista `ENDPOINTS` y **hereda** los casos de 401,
  403, período por defecto, `hasta` suelto y todos los 400. Más dos tests propios: la forma de la respuesta y qué le pasa al
  model.
- `tests/unit/estadisticas.model.test.ts` — el **SQL**, con el pool doblado: parámetros (nunca en el texto), `enElPeriodo` sobre
  `fecha_pago`, agrupar por el día de Bolivia, los días con `generate_series`, las ventanas, y el reacomodo de filas.
- `tests/db/estadisticasIngresosPorDia.db.test.ts` — **Postgres real**: los días en cero, el desglose por forma de pago,
  decimales exactos (0.10 + 0.20), el borde de las 21:00 y de la medianoche, lo de fuera del período, el filtro por sucursal,
  **la coincidencia con `/ingresos`** y una prueba por HTTP.

No hizo falta ningún helper nuevo: se reusaron `escenario`, `crearOrden` y `crearPago` de `baseReal.ts`. Cada test usa su
propia sucursal y fechas de un año que ningún otro usa, porque la base de pruebas es compartida entre archivos que corren en
paralelo.

## Si mañana tenés que tocar esto

Empezá por `ingresosPorDia` en `estadisticas.model.ts`. Si cambiás **cómo se filtran los pagos** (por ejemplo, excluir uno),
cambiá también `ingresos`: el test de coincidencia te avisa si te olvidás, pero conviene tenerlo presente. Y no sumes montos en
TypeScript para "arreglar" un total: si algo no cierra, el error está en el SQL.
