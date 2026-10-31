---
id: SPEC-KRILINXI-068
spec: specs/SPEC-KRILINXI-068-precio-unitario-boleta.md
explica:
  - la foto de la sentencia en read committed
  - redondeo igual en todos los lados
---

# SPEC-KRILINXI-068 — Precio unitario por renglón en la boleta

## Qué se construyó

La boleta ya no se escribe como "qué deja" y un total a mano: se escribe **renglón por renglón** (qué prenda, cuántas, a qué
precio cada una), y el total y la descripción salen solos. Al entregar, un recargo (o lo que el empleado quiera cobrar de más)
es un **renglón de cargo**, y el precio final es el de la boleta más esos cargos: ya no hay un "Precio final" libre, y al
entregar solo se puede sumar. El empleado ya no cambia el precio de una boleta; corregirlo es del admin (SPEC-KRILINXI-071).

## Cómo funciona, paso a paso

Sigamos una boleta: Rosa deja 2 camisas a Bs 15 y 2,5 kilos de ropa a Bs 3,33; al volver, se le cobra un recargo de Bs 5.

**1. La pantalla arma los renglones.** `FormularioRopa` arranca con un renglón vacío (`frontend/src/features/ordenes/components/FormularioRopa.tsx:72`),
que genera su `clave` con `crypto.randomUUID()` (`renglonNuevo` en `features/ordenes/renglones.ts`). `CamposDeRenglones`
(`FormularioRopa.tsx:279`) dibuja cada renglón como un grupo "Prenda 1", "Prenda 2", con su subtotal (`subtotalEscrito`) y el
total abajo. Todo en centavos: el subtotal es `subtotal` de `frontend/src/lib/money.ts:95`, que da 2 × 15 = 30,00 y
2,5 × 3,33 = 8,325 → **8,33**.

**2. Se valida y se guarda en una transacción local.** `registrarRopa` llama a `validarRenglones`
(`features/ordenes/api/ordenesLocal.ts:128`), que pasa cada renglón por `validarRenglon` (`renglones.ts:88`) y guarda cada
error con la clave del renglón (`renglon:<clave>:cantidad`, `claveCampo` en `renglones.ts:55`): así el error aparece en el campo
de **esa** prenda aunque se haya quitado otra. Con todo bien, la descripción se arma sola (`ordenesLocal.ts:233`, "2 Camisa,
2,5 Ropa por kilo") y se escriben, en una sola `ejecutarJuntas`, la orden con `precio_total = 38.33` y después sus renglones
(`ordenesLocal.ts:260`), cada uno con `id = clave`, `momento = 'INGRESO'` y su `posicion`.

**3. La cola los sube en orden.** PowerSync anota las filas en el orden en que se escribieron, y el conector manda cada
renglón a `POST /api/orden-items` (`lib/powersync/conector.ts:20`), después de su orden.

**4. El servidor valida y comprueba el total.** `postOrdenItem` (`backend/src/controllers/ordenItems.controller.ts:94`)
lee la cantidad como un monto (en centésimas), el precio, y corta un subtotal que no entraría en la base (`:107`). El model
(`backend/src/models/ordenItems.model.ts:108`) abre una transacción (`:149`), **bloquea la fila de la orden** con
`SELECT … FOR UPDATE` (`:150`) y recién ahí hace el `INSERT … SELECT`: copia la sucursal de la orden, exige que esté abierta,
y para un renglón de INGRESO exige que la suma de los que ya tiene más este no pase de `precio_total`. Si no entra, el model
averigua por qué y devuelve `total-excedido` con lo que queda por repartir (`:182`); el controller lo traduce a 409
`TOTAL_EXCEDIDO`, y la tablet lo guarda en Para corregir.

**5. Al entregar, el cargo va primero.** En la entrega, "Agregar un cargo" suma un renglón (`CamposDeRenglones` otra vez, con
`nombre="Cargo"`). `registrarEntrega` escribe **cargos, pago y entrega, en ese orden** (`features/entregas/api/entregasLocal.ts:167`),
con `precio_final = 38,33 + 5 = 43,33` calculado en la tablet.

**6. El servidor calcula el mismo precio final.** En `POST /api/entregas`, el `UPDATE` que pasa la orden a ENTREGADO calcula
el precio final con `precioFinalSql` (`backend/src/models/entregas.model.ts:98`: total + suma de los cargos), lo exige igual al
que mandó la tablet y lo devuelve para que el `INSERT` lo guarde. Si no coincide —porque el cargo fue rechazado, o porque una
tablet con la versión anterior mandó un precio libre—, no se escribe nada y vuelve `precio-distinto` (`:264`), un 409
`PRECIO_FINAL_DISTINTO`. En Para corregir, esa entrega se vuelve a guardar con el precio que da la tablet en ese momento
(`precioFinalLocal`), que ya refleja lo que el servidor tiene.

**7. Se muestran.** En el Mostrador, `armar` lee los renglones de todas las órdenes en una consulta (`renglonesPorOrden`) y
`ListaDeRenglones` los lista en el detalle. En el historial del admin vienen dentro de cada boleta: `GET /api/ordenes` los arma
con una subconsulta `json_agg` (`backend/src/models/ordenes.model.ts:266`), solo para las boletas de la página.

## Dónde encaja en la arquitectura

- **El model es el dueño de la regla del total**, no el controller: la regla necesita la base (sumar lo que hay) y tiene que
  valer aunque lleguen dos renglones a la vez. El controller solo valida la forma (números, largos, topes) y traduce el
  resultado a HTTP (CLAUDE.md §5: un controller nunca escribe SQL).
- **La lógica pura de los renglones vive en un solo lugar del frontend**, `features/ordenes/renglones.ts`: la usan Registrar
  ropa, la entrega y Para corregir. Un componente no la podría importar de `api/` (lo vigila `test/arquitectura.test.ts`), por eso
  el SQL quedó aparte, en `ordenes/api/renglonesLocal.ts`.
- **El precio final es autoritativo del servidor** (CLAUDE.md §6: "lo autoritativo del servidor se hace en el servidor"): la
  tablet lo calcula para mostrarlo y lo manda, pero lo que se guarda es lo que calcula Postgres. Es el mismo camino que el paso
  a ENTREGADO: dentro de la misma sentencia.
- **El subtotal no se guarda.** Hay tres implementaciones de la misma cuenta (Postgres, `backend/src/utils/money.ts`,
  `frontend/src/lib/money.ts`) y una tabla de casos repetida en los dos tests de `money`. Guardarlo sería una cuarta verdad que
  podría no coincidir.

## Fundamentos

**La foto de la sentencia (READ COMMITTED) y por qué esta vez hicieron falta dos.** En Postgres, con el aislamiento de
siempre (`READ COMMITTED`), **cada sentencia mira la base como estaba en el instante en que empezó**: es una foto. Lo que otra
transacción confirme mientras la sentencia corre, esa sentencia no lo ve. Hasta ahora eso no molestaba, porque las reglas
miraban **la fila que se bloquea** (la orden anulada en pagos, el estado en entregas), y cuando una sentencia espera un
bloqueo, al soltarse vuelve a leer **esa fila** en su versión nueva. Pero la regla del total suma **otras filas**
(`orden_items`), y esas no se vuelven a leer: siguen saliendo de la foto. Sin el paso previo, pasaría esto:

```
Renglón A (30 de 45,50)            Renglón B (30 de 45,50)
INSERT … SELECT: suma = 0  →  entra
                                   INSERT … SELECT: suma = 0 (su foto no ve a A) → entra
COMMIT                             COMMIT              → la boleta suma 60 con un total de 45,50
```

Poner el `FOR UPDATE` dentro de la misma sentencia no lo arregla: B esperaría a A, pero su suma seguiría saliendo de la foto
de antes. La solución es partirlo en dos sentencias dentro de una transacción (`ordenItems.model.ts:149-151`): primero
`SELECT … FOR UPDATE` sobre la orden —B espera ahí—, y después el `INSERT`, que es una sentencia nueva con una foto nueva,
tomada **después** de que A confirmó. Lo comprueba `tests/db/ordenItems.db.test.ts` ("si dos renglones llegan a la vez…"): con
dos `crear` en paralelo, entra uno solo. Regla para llevarse: **si la condición de una escritura suma o cuenta filas que otra
transacción puede estar agregando, el bloqueo tiene que ir en una sentencia anterior.**

**El redondeo tiene que ser el mismo en todos lados.** Una cantidad con decimales por un precio con decimales da más
decimales que los que tiene el dinero (2,5 × 3,33 = 8,325). Hay que redondear, y la regla (la mitad hacia arriba) tiene que ser
**exactamente** la misma en la tablet, en el controller y en Postgres: si la tablet redondeara 8,325 a 8,32 y Postgres a 8,33,
una boleta que en pantalla suma justo su total sería rechazada por un centavo. En enteros, "la mitad hacia arriba" es
`Math.floor((cantidad × precio + 50) / 100)` (`frontend/src/lib/money.ts:95`), y `round(x, 2)` de Postgres hace lo mismo con
números positivos. La forma de asegurarlo es una tabla de casos idéntica en los dos tests de `money` (incluidos 8,325 y
4,995), que es la que se compara también contra la base real.

**Ya explicado antes:**

- **Transacción explícita (BEGIN / COMMIT / ROLLBACK)** → SPEC-ALE186-019 (`specs/notas/SPEC-ALE186-019-migraciones-schema.md`)
- **Condición de carrera al leer y luego escribir** → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Bloqueo de fila** → SPEC-ALE186-005 (`specs/notas/SPEC-ALE186-005-pagos-api.md`)
- **INSERT … SELECT condicional** → SPEC-ALE186-005 (`specs/notas/SPEC-ALE186-005-pagos-api.md`)
- **CTE que modifica datos** → SPEC-ALE186-006 (`specs/notas/SPEC-ALE186-006-entregas-api.md`)
- **Idempotencia** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Dinero en centavos enteros** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)

## Decisiones y por qué

- **Los cargos al entregar son renglones, y solo se suma** (decidido con la persona a cargo, opción A). Se descartaron un
  renglón de descuento (un monto que resta) y conservar el precio final libre solo para bajar. Consecuencia: ya no se entrega
  por menos del total; para no cobrar lo que falta está el reembolso (SPEC-KRILINXI-070).
- **El precio final lo calcula el servidor y el de la tablet se compara**, en vez de confiar en él o ignorarlo. Ignorarlo
  habría guardado un precio distinto del que vio el empleado sin avisarle; compararlo hace que una entrega descuadrada (un
  cargo rechazado, una versión vieja) vaya a Para corregir.
- **Una columna `posicion` que la spec no nombraba.** Sin ella los renglones no tienen con qué ordenarse: los ids son al
  azar y no hay fecha por renglón. Se agregó a la migración 007 antes de aplicarla en ninguna base.
- **El 409 del total evita pasarse, no garantiza llegar.** Si un renglón se rechaza, la boleta queda con menos renglones que su
  total hasta que se corrija en Para corregir. Se aceptó (está en la spec): el renglón no se pierde.
- **El EMPLEADO no cambia `precio_total`** (403 en el `PATCH`, y el campo salió de Para corregir). Si pudiera, la suma de los
  renglones dejaría de cuadrar con el total.
- **`ESTADOS_ABIERTOS` pasó a `utils/dominio.ts`.** El model de renglones y el de entregas lo necesitan, y si uno lo importara
  del otro (con `SUBTOTAL_SQL` yendo en la otra dirección) se importarían en círculo, que en módulos ES rompe al cargar. Por lo
  mismo, `SUBTOTAL_SQL` vive en el model de órdenes, que los otros dos ya importaban.

## Los tests

- **Reusados:** `tests/helpers/baseReal.ts` (escenario, órdenes, pagos) y `ordenes.ts`/`usuarios.ts` en el backend;
  `baseLocalDePrueba`, `sembrar` y `test/rechazos.ts` (`subirRechazando`) en el frontend.
- **Creados:**
  - `backend/tests/helpers/ordenItems.ts`: `renglonDePrueba` y `cuerpoDeRenglon`, con el mismo patrón que `pagos.ts`.
  - `crearRenglon` en `baseReal.ts`: un renglón escrito directo, sin la regla del total, para preparar un caso.
  - `frontend/src/test/renglones.ts`: `escribirPrenda`, `escribirPrendas`, `agregarCargo` y `renglon(n)`. Busca cada campo
    dentro de su grupo ("Prenda 1"), porque los tres campos se llaman igual en todos los renglones. La próxima pantalla con
    renglones (la corrección del admin, SPEC-KRILINXI-071) lo puede usar tal cual.
  - `renglonDePrueba` en `test/historialDePrueba.ts`, para las boletas del historial con renglones.
- **Un test nuevo de unidad con un doble de `pool.connect()`** (`tests/unit/ordenItems.model.test.ts`): es el primer model que
  escribe dentro de una transacción. El doble de la conexión anota cada sentencia, así el test comprueba el orden (BEGIN,
  bloqueo, INSERT, COMMIT) y que un error hace ROLLBACK y devuelve la conexión.
- **La carrera se prueba contra la base real**, no con dobles: dos `crear` en paralelo sobre la misma orden. Un doble solo
  devolvería lo que el test le dice (CLAUDE.md §4).
- **Nota sobre la suite del frontend en esta máquina:** el día de la spec, la suite corría unas diez veces más lenta que lo
  que dice CLAUDE.md (§4), y muchos tests pasaban el límite de 5 s. Se comprobó que no era por la tabla nueva (el mismo
  archivo tardó lo mismo con y sin ella). Los archivos se verificaron por separado y con `--testTimeout`.

## Si mañana tenés que tocar esto

- **Para entender la regla del total**, empezá por `backend/src/models/ordenItems.model.ts` (`crear`) y su test de carrera en
  `tests/db/ordenItems.db.test.ts`. Para el precio final, `precioFinalSql` en `entregas.model.ts`.
- **Si cambia cómo se redondea**, cambian juntas `subtotal` (backend y frontend) y `SUBTOTAL_SQL`, y la tabla de casos de los
  dos tests de `money`.
- **Un campo nuevo de un renglón** va en la migración, la sync rule (columnas explícitas), el schema local, `RenglonEscrito` y
  `validarRenglon`, y en `CAMPOS.orden_items` de Para corregir.
- **SPEC-KRILINXI-070 (reembolso) es la excepción al precio final calculado:** guarda como precio final lo ya cobrado. Tiene que
  saltarse la comparación de `precioFinalSql` solo para el reembolso, sin abrirla para las entregas comunes.
