---
id: SPEC-ALE186-021
spec: specs/SPEC-ALE186-021-consultas-por-fecha.md
explica:
  - condicion que puede usar un indice (sargable)
  - filtrar dentro de cada parte de un union all
  - leer un plan de consulta (index cond contra filter)
---

# SPEC-ALE186-021 — Los filtros por día de Bolivia usan los índices de fecha

## Qué se construyó

Nada visible: el dashboard del admin y la consulta de la auditoría responden exactamente lo
mismo. Lo que cambió es **cuánto trabajo le cuesta a Postgres**. Antes, para saber qué cobros
eran "de marzo", revisaba todos los cobros de la historia uno por uno. Ahora va al índice de
fechas y salta directo al tramo de marzo. Con pocos datos no se nota. Con años de datos y una
auditoría que crece con cada login, es la diferencia entre milisegundos y segundos.

## Cómo funciona, paso a paso

El admin pide `GET /api/estadisticas/ingresos?desde=2024-03-01&hasta=2024-03-31`.

1. El controller lee el período con `leerPeriodo` (`backend/src/utils/periodo.ts`, sin
   cambios) y llama a `estadisticas.ingresos` (`backend/src/controllers/estadisticas.controller.ts:19`).
2. El model arma el `WHERE` con `delPeriodo('p.fecha_pago')`
   (`backend/src/models/estadisticas.model.ts:91`). Es un atajo local
   (`estadisticas.model.ts:35`) que fija los parámetros que usan todas las consultas de ese
   archivo (`$1` desde, `$2` hasta, `$4` zona) y llama a `enElPeriodo`.
3. `enElPeriodo` (`backend/src/utils/periodo.ts:137`) devuelve:

   ```sql
   (p.fecha_pago >= (($1::date)::timestamp AT TIME ZONE $4) AT TIME ZONE current_setting('TimeZone')
    AND p.fecha_pago < (($2::date + 1)::timestamp AT TIME ZONE $4) AT TIME ZONE current_setting('TimeZone'))
   ```

   Los dos bordes los arma `inicioDelDia` (`periodo.ts:115`): "la medianoche de ese día en
   Bolivia", pasada al reloj en que están guardadas las columnas (UTC en el servidor). Para
   marzo de 2024 eso da `2024-03-01 04:00` y `2024-04-01 04:00`.
4. Postgres ve `p.fecha_pago >= X AND p.fecha_pago < Y`, con la columna sola de un lado.
   Calcula X e Y una vez (no dependen de la fila), y con eso busca en `idx_pagos_fecha`.

Así quedó el plan real, sacado del test (`tests/db/consultasPorFecha.db.test.ts`):

```
Bitmap Index Scan on idx_pagos_fecha
  Index Cond: ((fecha_pago >= '2024-03-01 04:00:00+00' …) AND (fecha_pago < '2024-04-01 04:00:00+00' …))
```

Y así el de la forma vieja, `horaDelNegocio(p.fecha_pago)::date BETWEEN …`:

```
Bitmap Heap Scan on pagos p
  Filter: (((fecha_pago AT TIME ZONE …) AT TIME ZONE 'America/La_Paz')::date >= '2024-03-01' …)
  ->  Bitmap Index Scan on idx_pagos_fecha          ← sin Index Cond: lee el índice ENTERO
```

La auditoría hace lo mismo (`backend/src/models/auditoria.model.ts:308`), con la zona en
`$3`. La productividad tiene un detalle propio: ver "UNION ALL" más abajo.

## Dónde encaja en la arquitectura

- **`utils/periodo.ts`** es el único lugar que sabe convertir entre días de Bolivia y el
  reloj de la base. Desde SPEC-ALE186-012 lo comparten las estadísticas y la auditoría. Que
  `enElPeriodo` viva ahí es lo que asegura que las dos pantallas del admin entiendan igual
  `?desde=2024-03-01`. Si cada model armara sus bordes, tarde o temprano uno diría `<=` y
  otro `<`.
- **Los models** siguen armando el SQL y pasan todo como parámetro (`$1`, `$2`, `$4`).
  `enElPeriodo` recibe *nombres de parámetros*, no valores: nunca mete una fecha dentro del
  texto de la consulta.
- **`horaDelNegocio` sigue existiendo**, pero ahora solo para lo que se *muestra*: la fecha
  formateada en el `SELECT`, los `dias` de antigüedad, el día por el que agrupa el volumen.
  Ahí no estorba, porque Postgres ya eligió las filas cuando llega a calcularlo. CLAUDE.md §8
  lo deja escrito como regla.

## Fundamentos

### Una condición que puede usar un índice (y una que no)

Un índice sobre `fecha_pago` es una lista ordenada de los valores de esa columna, cada uno
apuntando a su fila. Sirve para responder rápido una sola clase de pregunta: "¿dónde
empiezan los valores mayores a X?". Con eso, Postgres salta al primero y lee en orden hasta
el último que cumple.

Para eso, la condición tiene que hablar **de la columna tal cual**: `fecha_pago >= X`. Si
habla de una función de la columna (`f(fecha_pago) >= X`), el índice no sirve: está ordenado
por `fecha_pago`, no por `f(fecha_pago)`, y Postgres no sabe en qué parte de la lista caen
los que cumplen. Tiene que calcular `f` para cada fila. (En inglés a esto le dicen
*sargable*: una condición que el motor puede usar como argumento de búsqueda.)

El truco es casi siempre el mismo: **pasar la función al otro lado**. En vez de convertir
cada fecha guardada a hora de Bolivia y compararla con el día, se convierte el día a la hora
guardada, una sola vez, y se compara la columna sin tocarla (`periodo.ts:137`). Es correcto
porque la conversión de zona no cambia el orden: si un instante está entre dos medianoches de
Bolivia, su día en Bolivia es el de la primera.

### Leer un plan de consulta: `Index Cond` contra `Filter`

`EXPLAIN <consulta>` muestra cómo piensa ejecutarla Postgres, sin ejecutarla. En esta spec
lo importante fue aprender qué línea mirar:

- **`Index Cond:`** es la condición con la que Postgres *busca* dentro del índice. Si la
  columna de fecha aparece ahí, se salta al tramo del período.
- **`Filter:`** es una condición que se aplica *después*, fila por fila, a lo que ya se
  leyó. Si el período está acá, se leyó todo.

**Que el plan nombre el índice no prueba nada.** Con la forma vieja, Postgres también
"usaba" `idx_pagos_fecha`, pero lo leía entero (un `Bitmap Index Scan` sin `Index Cond`) y
filtraba después. Era un recorrido completo con otro nombre. El primer borrador de los tests
cometió justo ese error: afirmaba solo el nombre del índice, y el testigo con la forma vieja
lo delató. El test definitivo afirma la `Index Cond` sobre la columna
(`tests/db/consultasPorFecha.db.test.ts:90`).

Otro detalle de esos tests: con pocas filas, leer la tabla entera es más barato que ir al
índice, y Postgres lo elige con razón. Para preguntarle si el filtro *puede* usar el índice,
el test apaga `enable_seqscan` solo dentro de una transacción que después deshace
(`consultasPorFecha.db.test.ts:76`).

### El filtro va dentro de cada parte del `UNION ALL`

La productividad junta tres tablas (órdenes, cobros, entregas) con `UNION ALL` y después
agrupa (`estadisticas.model.ts:443`). Antes, la unión traía las tres tablas enteras con una
columna común `fecha`, y el período se filtraba sobre el resultado. Ahora cada parte filtra
su propia columna (`fecha_entrada`, `fecha_pago`, `fecha_entrega`) con su propio índice, y a
la unión solo sube lo del período. Regla general: **filtrá lo antes posible, sobre la tabla
de verdad**, no sobre algo ya armado. Postgres a veces empuja el filtro solo, pero escrito
así no depende de que el planificador lo adivine, y se lee lo que pasa.

**Ya explicado antes:**

- **Zona horaria del negocio (AT TIME ZONE)** → SPEC-ALE186-008 (`specs/notas/SPEC-ALE186-008-estadisticas-cobros.md`)
- **Timestamp sin zona horaria** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Índice de expresión** → SPEC-ALE186-020 (`specs/notas/SPEC-ALE186-020-deuda-schema.md`)

## Decisiones y por qué

- **Dar vuelta la comparación, y no crear un índice de expresión** sobre
  `horaDelNegocio(fecha)::date`. El índice de expresión también funcionaría, pero:
  - haría falta uno nuevo por cada tabla con fecha;
  - `AT TIME ZONE current_setting(...)` no es una expresión que Postgres acepte indexar,
    porque depende de la configuración de la sesión;
  - y los índices que ya existían quedarían sin usarse.

  Así no se toca el schema.
- **Borde de arriba con `<` el día siguiente**, no `<= 23:59:59`. Con `<=` habría que
  decidir cuántos decimales tiene "el último instante del día". El comienzo del día
  siguiente no tiene esa ambigüedad.
- **Sin recoger filtra por `o.fecha_entrada`** (la tabla) y no por `v.fecha_entrada` (la
  vista). Es el mismo dato, pero la columna de la tabla es la que tiene el índice, y así no
  hay que confiar en que Postgres lo traduzca a través de la vista.
- **Lo que se muestra no cambió.** Los `dias`, el agrupado por día del volumen y las fechas
  formateadas siguen con `horaDelNegocio`. Cambiarlos no ganaba nada y arriesgaba diferencias.

## Los tests

- **Contra la base real** (`tests/db/consultasPorFecha.db.test.ts`):
  - Los bordes con montos 1, 2, 4, 8 y 16: la suma (12) dice exactamente cuáles entraron.
    El caso fino son las 23:59:59 del 31 en Bolivia, que en UTC ya son el 1 de abril.
  - El plan de ingresos y de auditoría.
  - Un **testigo** con la forma vieja, que tiene que *no* buscar en el índice. Sin el
    testigo, los tests del plan podrían pasar por una razón que no es la que se quiere
    probar. Fue exactamente lo que pasó en el primer borrador.
- **Unitarios** (`tests/unit/consultasPorFecha.test.ts`): recorren las 7 consultas con
  período y afirman que usan `enElPeriodo` y que ya no queda ningún `::date BETWEEN`. En la
  productividad, afirman que el filtro está en cada parte de la unión.
- **Reusados:** `escenario`, `crearOrden`, `crearPago`, `crearUsuario`, `anotarAuditoria`.
  No hizo falta ningún helper nuevo. `planDe` vive en el archivo de test: si otra spec
  necesita mirar planes, ese es el momento de moverlo a `tests/helpers/`.
- **La prueba más fuerte de que nada cambió** son los 112 tests de la base real de las
  specs anteriores, que pasaron sin tocar una línea.

## Si mañana tenés que tocar esto

- Una consulta nueva con período: `enElPeriodo(columna, { desde, hasta, zona })` en el
  `WHERE`, sobre la columna de la tabla que tiene índice. Nunca `::date BETWEEN`: el test
  unitario lo busca.
- Si una tabla nueva se filtra por fecha, necesita su índice en una migración. Sin índice,
  `enElPeriodo` es correcto pero igual de lento.
- Para comprobar si una consulta usa un índice, mirá la `Index Cond`, no el nombre del
  índice.
