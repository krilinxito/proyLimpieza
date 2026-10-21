---
id: SPEC-KRILINXI-040
spec: specs/SPEC-KRILINXI-040-historial-boletas-api.md
explica:
  - comodines de LIKE que escribe la persona
  - rango abierto con extremos centinela
  - reutilizar una vista cruzandola por id
---

# SPEC-KRILINXI-040 — La API del historial de boletas

## Qué se construyó

`GET /api/ordenes`, solo para el ADMIN: una página del historial completo de boletas, de la
más nueva a la más vieja, cada una con su sucursal, su cliente, lo pagado y lo que todavía
se debe. Se puede filtrar por fechas, sucursal, estado, texto (boleta, nombre o teléfono) y
"solo las que se deben", y los filtros se combinan. Es la mitad del servidor de la pantalla
de historial (SPEC-KRILINXI-041): el admin no tiene la ropa en su tablet (CLAUDE.md §7), así
que la pide online, como las estadísticas (§8).

## Cómo funciona, paso a paso

Seguimos un pedido: `GET /api/ordenes?sucursal_id=…&estado=LISTO&texto=7012-34&con_saldo=true&pagina=2`.

1. **La ruta decide quién entra.** `routes/ordenes.routes.ts:12` registra el `GET` con
   `requireAuth` y `requireRol('ADMIN')`. Un EMPLEADO recibe 403 y quien no trae token, 401.
   La línea está **antes** del `ordenesRouter.use(requireAuthDeLaCola)` (`:19`) a propósito;
   ver "Decisiones".
2. **El controller valida todo lo que llegó como texto** (`controllers/ordenes.controller.ts:292`,
   `getOrdenes`). `desde`/`hasta` pasan por `leerFechaOpcional` (`:264`: ausente = `null`,
   mal escrita = 400), `sucursal_id` debe ser UUID y `estado` uno de `ESTADOS_ORDEN`. `texto`
   se recorta y se limita a 100 caracteres (`:272`), y `con_saldo` solo acepta `true`/`false`
   (`:281`). `pagina` y `por_pagina` los lee `leerPaginacion`, el mismo de la auditoría. Si
   algo no cumple, un 400 con el formato de siempre y el model ni se entera.
3. **El controller le da al model un objeto de filtros ya limpio** (`:320`):
   `{ desde, hasta, sucursalId, estado, texto, conSaldo }`, con `null` en lo que no se pidió.
4. **El model arma dos consultas con los mismos filtros** (`models/ordenes.model.ts:247`,
   `listar`): el conteo y la página. Las dos parten de una misma CTE, `HISTORIAL` (`:193`),
   que cruza `vw_saldos` con `ordenes`, `sucursales`, `clientes` y `entregas`. Los filtros
   son `($n IS NULL OR …)`: un filtro que no se pidió llega como `NULL` y no filtra.
5. **El texto se transforma en dos patrones** (`parametrosDelHistorial`, `:226`). Para la
   boleta y el nombre, `contiene()` (`:222`) lo rodea de `%` y escapa los comodines que
   escribió la persona. Para el teléfono se le dejan solo los dígitos: `7012-34` busca
   `%701234%`, igual que `normalizarTelefono` al guardar.
6. **El resultado se vuelve a dar vuelta a camelCase** y se anidan `sucursal` y `cliente`. El
   saldo y lo pagado salen como texto decimal (`"30.25"`) porque los suma Postgres; el
   controller no calcula nada.

La respuesta: `{ desde, hasta, pagina, porPagina, total, boletas }`. `desde`/`hasta` son
`null` cuando no se pidieron, para que la pantalla sepa que está viendo todo.

## Dónde encaja en la arquitectura

Es la separación de siempre (CLAUDE.md §5): la **ruta** solo declara endpoint y middleware;
el **controller** valida y arma la respuesta HTTP sin una línea de SQL; el **model** tiene el
SQL parametrizado y no sabe qué es un `req`. Lo nuevo es que esta es la **primera lectura de
`ordenes` por API**: hasta hoy las lecturas salían del SQLite local (§6). Es la excepción
declarada del admin (§6 y §8), y por eso **solo** la puede pedir el ADMIN: abrirla a un
EMPLEADO sería darle la ropa de las otras sucursales, justo lo que las sync rules evitan.

Qué no le toca a cada capa: el controller no suma ni calcula saldos (si lo hiciera, el
frontend tendría dos cuentas distintas para el mismo número); el model no decide qué es un
filtro inválido (devolvería un error de Postgres, que acaba en 500 en vez de 400).

## Fundamentos

**Comodines de `LIKE` que escribe la persona.** En `LIKE`, `%` y `_` no son letras: son
"cualquier cosa" y "un carácter". Si el texto que escribió el admin se pasara tal cual, un
`%` encontraría todas las boletas y un `_` cualquier boleta de un carácter más. No es
inyección de SQL —el texto va por parámetro— sino inyección de *patrón*: cambia lo que
significa la búsqueda. `contiene()` (`ordenes.model.ts:222`) antepone `\` a `\`, `%` y `_`,
y Postgres entiende `\` como "literal" por defecto. Sin esto, buscar `%` devolvería todo el
historial; el test `un % o un _ escritos en el texto no son comodines` (en
`tests/db/ordenesHistorial.db.test.ts`) lo fija.

**Un rango abierto con extremos centinela.** El período de las demás consultas siempre
tiene `desde` y `hasta`; acá cualquiera puede faltar. `enElPeriodo` (`utils/periodo.ts`)
exige los dos bordes para poder comparar la columna sin envolverla en una función (así el
índice sirve). En vez de escribir otra forma de filtrar, se le pasa `COALESCE($1::date,
DATE '0001-01-01')` y `COALESCE($2::date, DATE '9999-12-30')` (`ordenes.model.ts:183`): lo que
falta se reemplaza por una fecha tan lejana que nunca excluye nada. Si faltan **los dos**, la
condición `$1::date IS NULL AND $2::date IS NULL` salta todo el filtro (`:204`).

**Reutilizar una vista cruzándola por id.** `vw_saldos` ya sabe cuánto se pagó y cuánto se
debe (precio final si hubo entrega, total si no). En vez de reescribir esa suma, `HISTORIAL`
la une con `ordenes` por `orden_id` para traer lo que la vista no tiene (fechas, teléfono,
descripción). Es lo que ya hacía `/saldos` en `models/estadisticas.model.ts`, y CLAUDE.md §8
lo pide: una sola definición de "saldo" en todo el sistema.

**Ya explicado antes:**

- **Paginación con limit/offset y total aparte** → SPEC-ALE186-012 (`specs/notas/SPEC-ALE186-012-auditoria-consulta.md`)
- **Zona horaria del negocio (AT TIME ZONE)** → SPEC-ALE186-008 (`specs/notas/SPEC-ALE186-008-estadisticas-cobros.md`)
- **Dobles de prueba (mocks)** y **a qué altura va el doble** → SPEC-ALE186-001 y SPEC-ALE186-003
- **Orden de la cadena de middlewares** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)

## Decisiones y por qué

- **El `GET` va antes del `use(requireAuthDeLaCola)`.** Express aplica los middlewares en el
  orden en que se registran, así que un `use` solo afecta a lo que se declara *después*. La
  sesión de la cola acepta tokens vencidos hace hasta 3 días (SPEC-ALE186-018), y eso solo
  está justificado para subir lo que el mostrador escribió sin internet. Una lectura online
  del admin no tiene esa excusa: con el `GET` debajo del `use`, un admin con la sesión
  vencida seguiría viendo el historial. *Descartado:* poner el `GET` debajo y confiar en
  `requireRol` — no alcanza, porque el rol sale del token vencido que la cola deja pasar.
- **El estado sale de `ordenes.estado`, sin mirar `entregas`.** La spec dice "ENTREGADO si
  tiene entrega", y ya es así: el servidor marca el estado en la misma sentencia que registra
  la entrega (SPEC-ALE186-006). *Descartado:* un `CASE WHEN e.id IS NOT NULL` que repite una
  regla que la base ya garantiza y que el filtro por estado tendría que repetir también.
- **"Con saldo" deja afuera las anuladas.** Una orden anulada con un adelanto tiene un saldo
  que no es una deuda de nadie. Es lo mismo que hace `/saldos` (`v.estado <> 'ANULADO'`), para
  que el historial y el tablero no cuenten distinto. La spec no lo decía; es mi lectura.
- **No se usa `leerPeriodo`.** Pone por defecto los últimos 30 días, y la spec pide lo
  contrario: sin `desde`, todo. Por eso la lectura de las fechas opcionales vive en el
  controller. *Alternativa:* una función nueva en `utils/periodo.ts`; quedó fuera del
  alcance declarado de la spec, y si el frontend de 041 la necesita otra vez, es el paso natural.
- **Búsqueda sin distinguir mayúsculas, pero sí tildes.** `ILIKE` ignora las mayúsculas;
  "Perez" no encuentra "Pérez". El frontend sí las ignora (`plegar`), pero acá no hay
  `unaccent` instalado y agregar una extensión es una migración aparte.

## Los tests

Tres capas, cada una con su doble (CLAUDE.md §4):

- `tests/http/ordenesHistorial.test.ts` — el **controller**, con el model doblado: qué filtros
  le pasa, que sin `desde` no inventa un período, los 12 casos de 400, el 401/403.
- `tests/unit/ordenesHistorial.model.test.ts` — el **SQL**, con el pool doblado: que los
  filtros viajen como parámetros y nunca en el texto, el escape del `LIKE`, el teléfono
  con solo dígitos, que el período compare la columna sin tocarla.
- `tests/db/ordenesHistorial.db.test.ts` — **Postgres real**: que el saldo sume bien, que
  cruzar pagos con entregas no duplique filas, el día de Bolivia en el borde de las 21:00,
  los rangos abiertos, los filtros combinados y las páginas sin huecos ni repetidos.

Se **reusaron** `testApi`, `expectApiError`, `comoAdmin`/`conSesion` y, de la base real,
`escenario`, `crearOrden`, `crearPago` y `crearEntrega`. Se **generalizó** `crearCliente`
(`tests/helpers/baseReal.ts`): ahora acepta `{ nombre, telefono }` opcionales, así un test puede
probar la búsqueda por texto sin escribir su propio `INSERT`. Sin argumentos se comporta
igual que antes, por eso no se tocó ningún otro test. La próxima spec que necesite un cliente
con nombre elegido lo usa así: `crearCliente({ nombre: 'Rosa Quispe' })`.

Cada test de la capa real filtra por **su propia sucursal** recién creada: la base de pruebas
es compartida por toda la suite y "contar todo lo que hay" no es estable.

## Si mañana tenés que tocar esto

Empezá por `HISTORIAL` en `ordenes.model.ts:193`: es la única consulta, y el conteo y la página
la comparten, así que un filtro nuevo se agrega ahí **y** a `parametrosDelHistorial` (el
orden de los `$n` importa; el test del model compara la lista completa). Con cuidado: `vw_saldos`
agrupa *todas* las órdenes y se une después con `ordenes`; con años de historial conviene
medir con `EXPLAIN` si Postgres alcanza a filtrar antes de agrupar. No lo medí acá. Si se
vuelve lento, el arreglo natural es calcular `SUM(monto)` por orden dentro de la CTE (un
`LATERAL`) en vez de pasar por la vista.
