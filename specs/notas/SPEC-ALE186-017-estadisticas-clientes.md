---
id: SPEC-ALE186-017
spec: specs/SPEC-ALE186-017-estadisticas-clientes.md
explica:
  - agrupar en dos niveles con cte encadenados
  - las n+1 consultas y json_agg para evitarlas
---

# SPEC-ALE186-017 — Atenciones de cada cliente por sucursal

## Qué se construyó

Un panel nuevo para el admin: cuántas veces se atendió a cada cliente, cuánto pagó y
cuándo vino por última vez, en total y separado por sucursal. Un cliente no "es" de
ninguna sucursal, pero así se ve dónde se lo atiende: Ana fue 5 veces a Central y 2 a
Norte. Las órdenes anuladas no cuentan, y "lo que gastó" es lo que pagó de verdad, no lo
que debía.

## Cómo funciona, paso a paso

`GET /api/estadisticas/clientes?desde=2025-07-01&hasta=2025-07-31&pagina=1`

1. **Controller** (`backend/src/controllers/estadisticas.controller.ts:52`): lee el período
   con `leerPeriodo`, valida `cliente_id` y lee la página con `leerPaginacion`
   (`backend/src/utils/paginacion.ts:36`, movida acá desde la auditoría en esta spec).
2. **El model encadena tres CTE** (`ATENCIONES`, `backend/src/models/estadisticas.model.ts:513`):
   - `atenciones`: cada orden no anulada del período, con lo que se le pagó, sumado con
     una subconsulta sobre `pagos` (`:515`).
   - `por_sucursal`: esas órdenes agrupadas por cliente **y** sucursal.
   - `por_cliente`: esos grupos sumados por cliente.
3. **Dos consultas sobre los mismos CTE** (`clientes`, `:547`): una cuenta los clientes
   (`total`) y la otra trae la página, ordenada de quien más vino a quien menos.
4. **Las sucursales de cada cliente salen en la misma fila** como un array JSON
   (`json_agg`, `:571`), con el dinero ya convertido a texto. El model lo traduce a la
   forma de la respuesta: `{ cliente, ordenes, gastado, ultimaVisita, porSucursal: [...] }`.

## Dónde encaja en la arquitectura

- **`utils/paginacion.ts` es la segunda pieza compartida del admin**, después de
  `utils/periodo.ts` (SPEC-ALE186-012). La paginación vivía dentro del controller de la
  auditoría. Como esta spec la necesitaba igual, se movió en vez de copiarse, con su
  propio commit para que el diff de la spec quede limpio. Esto tocó
  `auditoria.controller.ts`, que no estaba en el scope declarado.
- El resto es el patrón de las estadísticas (SPEC-ALE186-008 y -013): Postgres cuenta y
  suma, los montos salen como texto y las fechas en hora de Bolivia.

## Fundamentos

**Las N+1 consultas, y `json_agg` para evitarlas.** La forma ingenua de armar esta
respuesta es una consulta por la página de 50 clientes y después, para cada uno, otra
por sus sucursales: 51 consultas, cada una con su ida y vuelta a la base. A ese patrón
se lo llama "N+1": funciona en la prueba con 3 clientes y se arrastra en producción con
50 por página. `json_agg` lo resuelve adentro de Postgres: por cada fila de la página,
una subconsulta junta todas sus sucursales en **un solo valor**, un array JSON, que
`pg` entrega ya parseado. Una sola consulta trae la página entera con sus listas
anidadas. El cuidado que exige es el tipo: dentro de un JSON los números son de
JavaScript, o sea floats. Por eso `gastado` va como `::text` adentro del
`json_build_object`, igual que el resto de los montos del proyecto.

**Agrupar en dos niveles con CTE encadenados.** "Por cliente y por sucursal" y "por
cliente" son dos agrupaciones distintas de los mismos datos. Se podría calcular cada una
desde cero, pero entonces las dos podrían contar distinto si algún día se cambia un
filtro en una y no en la otra. Encadenarlas (`atenciones` → `por_sucursal` →
`por_cliente`) hace que el total por cliente sea, por construcción, la suma de sus
sucursales. Un test contra la base real lo verifica: 2 órdenes en A más 1 en B dan 3.

**Ya explicado antes:**

- **Paginación con LIMIT/OFFSET y el total aparte** → SPEC-ALE186-012 (`specs/notas/SPEC-ALE186-012-auditoria-consulta.md`)
- **Subconsulta escalar correlacionada** → SPEC-ALE186-012 (la suma de pagos de cada orden)
- **Dato histórico de algo que no cambia** → SPEC-ALE186-012 (la sucursal sale de la orden)
- **JSONB** → SPEC-ALE186-010
- **Zona horaria del negocio (AT TIME ZONE)** → SPEC-ALE186-008

## Decisiones y por qué

- **"Gastado" es lo pagado, no el precio.** Una orden de Bs 100 con Bs 30 de adelanto y el
  resto sin cobrar no es Bs 100 gastados. Si al admin le interesa lo que se le debe, eso ya
  está en `/saldos` (SPEC-ALE186-008).
- **La última visita no cuenta las anuladas.** Si la orden más reciente se anuló, esa ropa
  no se trabajó.

## Los tests

- **Reusados:** `escenario`, `crearOrden` (con fecha, sucursal y estado), `crearPago`,
  `crearCliente` y `crearSucursal`. No hizo falta ningún helper nuevo.
- **El test de páginas se aísla con una sucursal propia** (`escenario` crea una nueva) y
  filtra por ella: así cuenta exactamente sus 3 clientes aunque otros tests de la suite
  estén cargando clientes en paralelo.
- `tests/db/estadisticasClientes.db.test.ts:16` es el que vale: dos sucursales, montos con
  centavos (10.10 + 0.20 = "10.30"), una orden sin pagos ("0.00") y una anulada que no
  cuenta ni para la última visita.
