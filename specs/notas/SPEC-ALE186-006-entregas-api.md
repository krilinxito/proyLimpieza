---
id: SPEC-ALE186-006
spec: specs/SPEC-ALE186-006-entregas-api.md
explica:
  - atomicidad de una sentencia
  - cte que modifica datos
---

# SPEC-ALE186-006 — Registro de entregas

## Qué se construyó

El backend ya recibe los retiros de ropa, y con eso el flujo del negocio queda completo de
punta a punta: el cliente deja la ropa (orden), paga un adelanto (pago), vuelve a buscarla
(**entrega**) y paga el resto (pago).

Al registrarse la entrega, la orden pasa sola a ENTREGADO. La ropa se retira **en la misma
sucursal donde se dejó**, así que la entrega lleva siempre la sucursal de su orden.

## Cómo funciona, paso a paso

El caso: Luis Mamani viene a buscar la ropa de su hermana a la sucursal Centro. No trae la
boleta. La orden es la 001234, de Bs 45,50, y el empleado le cobra Bs 50 porque la ropa
estuvo dos semanas guardada. El dispositivo sube:

```json
POST /api/entregas
{ "id": "7c2e…", "orden_id": "5555…", "tipo_retiro": "SIN_BOLETA",
  "retirado_por_nombre": "Luis Mamani", "retirado_por_carnet": "1234567 LP",
  "precio_final": "50.00" }
```

1. **La ruta.** `src/routes/index.ts:18` manda `/api/entregas` a `entregasRouter`, que exige
   sesión (`src/routes/entregas.routes.ts:10`) y declara solo `POST /` (`:12`).

2. **El controller valida.** `postEntrega` (`src/controllers/entregas.controller.ts:84`)
   revisa los UUID, el tipo de retiro (`:95`) y los dos textos de quien retira. Como es
   SIN_BOLETA, exige que estén **los dos** (`:110`). El schema también lo exige con
   `chk_datos_sin_boleta`, pero si se dejara llegar hasta ahí sería un 500 sin mensaje para
   el mostrador. `"50.00"` se convierte en `5000` (`leerPrecioFinal`, `:47`). Si no
   hubiera venido, quedaría `null`: "cobrá lo que decía la orden".

3. **Lo que no sale del cuerpo.** Quien entrega es `sesion.id` (`:123`). La sucursal
   tampoco sale del cuerpo: `sucursalPermitida` (`:71`) solo pone un **límite** (la
   sucursal del empleado; para un ADMIN, ninguna), y la sucursal real la pone el model.

4. **El model escribe en dos tablas, en una sola sentencia.** `entregas.crear`
   (`src/models/entregas.model.ts:132`) arma un `WITH … UPDATE … INSERT` (`:137-150`):
   - El `UPDATE` (`:138-143`) pasa la orden a ENTREGADO, pero solo si está en un estado
     entregable (`:141`; ver `ESTADOS_ENTREGABLES`, `:67`) y es de la sucursal permitida
     (`:142`). Devuelve `id, sucursal_id, precio_total` de la orden que cambió (`:143`).
   - El `INSERT` (`:145-150`) arma la entrega **con lo que devolvió el UPDATE**
     (`FROM orden`, `:150`): de ahí salen la sucursal y, si `$7` es `null`, el precio
     (`COALESCE`, `:148`).

5. **La respuesta.** El model devuelve `{ tipo: 'creada', entrega }` (`:177`) y el
   controller responde **201** (`entregas.controller.ts:130`). La orden 001234 ya figura
   ENTREGADO en Postgres, y en el próximo ciclo de sincronización baja así a los
   dispositivos de la sucursal.

**¿Y si algo no cuadra?** Si el `UPDATE` no encontró la orden en condiciones, el `INSERT`
no tiene de dónde sacar la fila y no inserta nada. Igual que en pagos, el model averigua
por qué, empezando por el reintento: si existe la entrega con ese id, responde 200
(`:182`). Si no, mira la orden (`:185`): no existe o es ajena → 400; anulada → 409
`ORDEN_ANULADA`; ya entregada → 409 `ORDEN_YA_ENTREGADA` (`:190`).

## Dónde encaja en la arquitectura

El reparto es el de las specs anteriores (CLAUDE.md, sección 5), con un matiz: **el model
de entregas modifica una fila de `ordenes`.** La regla del proyecto es que cada model es
el único que escribe en su tabla, así que esto merece una explicación.

La alternativa "limpia" sería llamar a una función del model de órdenes para el cambio de
estado, desde un service que coordine los dos models dentro de una transacción. Funciona,
pero obliga a que los dos models compartan una conexión, y la garantía de atomicidad pasa
a depender de que el service abra, confirme y cierre la transacción bien en todos los
caminos, incluidos los de error. Con una sola sentencia, esa garantía la da Postgres y no
hay forma de olvidarla.

El costo es que el `UPDATE ordenes SET estado = 'ENTREGADO'` vive en `entregas.model.ts`.
Es una excepción acotada: es el **único** cambio de estado que provoca otra tabla, y el
model de órdenes sigue rechazando que alguien pida ENTREGADO por `PATCH`
(`utils/dominio.ts`, SPEC-ALE186-004). Para leer una orden entera, el model de entregas
sigue usando `ordenes.buscarPorId` (`entregas.model.ts:185`), igual que pagos.

`services/` sigue vacío. Esta spec lo tenía en su scope por si hacía falta coordinar, y
no hizo falta.

## Fundamentos

### CTE que modifica datos: WITH … UPDATE … INSERT

Un **CTE** (*common table expression*) es la cláusula `WITH nombre AS (…)` que va antes
de una consulta. Le pone nombre a un resultado intermedio para que la consulta principal
lo use como si fuera una tabla. Lo habitual es que ese resultado salga de un `SELECT`.

En Postgres el CTE también puede ser un `UPDATE`, `INSERT` o `DELETE` con `RETURNING`: las
filas que modificó quedan disponibles con ese nombre.

```sql
WITH orden AS (
  UPDATE ordenes SET estado = 'ENTREGADO'
   WHERE id = $2 AND estado = ANY($9) …
  RETURNING id, sucursal_id, precio_total     -- ← esto es "orden"
)
INSERT INTO entregas (…)
SELECT $1, orden.id, orden.sucursal_id, …
  FROM orden                                   -- ← cero filas si el UPDATE no tocó nada
```

Lo que lo hace útil acá es que los dos pasos **se encadenan por los datos**: el `INSERT`
solo tiene fila si el `UPDATE` cambió una. No hay forma de insertar la entrega sin haber
cambiado la orden. El ejemplo vivo está en `src/models/entregas.model.ts:137-150`.

Una regla de Postgres que conviene saber: todas las partes de la sentencia ven la base
**como estaba al empezar**. Si el `INSERT` hiciera un `SELECT estado FROM ordenes`, vería
el estado viejo, no ENTREGADO. Por eso la información pasa por el `RETURNING` y no por
volver a leer la tabla.

### Atomicidad de una sentencia, y por qué acá NO hay ON CONFLICT

**Atómico** significa "todo o nada". En Postgres, cada sentencia suelta es atómica: si
falla en cualquier punto, todo lo que alcanzó a hacer se deshace. Un CTE con un `UPDATE` y
un `INSERT` es **una** sentencia, así que si el `INSERT` falla, el `UPDATE` también se
deshace. Es la misma garantía que daría una transacción (`BEGIN … COMMIT`), sin tener que
abrirla ni cerrarla a mano.

Esto explica una diferencia con pagos que parece un descuido y no lo es. Pagos usa
`ON CONFLICT (id) DO NOTHING` para el reintento. Entregas no lo usa, porque `DO NOTHING`
no hace fallar la sentencia: solo hace que el `INSERT` **no inserte**, y el `UPDATE` del CTE
**ya se aplicó**. Si llegara una entrega con un id ya usado apuntando a otra orden, esa
otra orden quedaría ENTREGADO sin ninguna entrega. Sería el estado inconsistente que todo
esto busca evitar.

Sin `ON CONFLICT`, el id repetido viola la clave primaria, la sentencia entera falla y
Postgres deshace el `UPDATE`. El model atrapa ese error (`entregas.model.ts:167`) y sigue
como con cualquier reintento. Esto no se puede probar con dobles. Se comprobó contra
Postgres real: se mandó una entrega con un id ya usado para otra orden, y esa orden siguió
en LISTO, sin entrega.

**Ya explicado antes:**

- **INSERT … SELECT condicional**, **bloqueo de fila** (acá lo da el `UPDATE`, sin
  `FOR SHARE`), **desnormalización controlada** y **registros inmutables** → SPEC-ALE186-005
  (`specs/notas/SPEC-ALE186-005-pagos-api.md`)
- **Condición de carrera al leer y luego escribir**, **máquina de estados** y **unión
  discriminada** → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Códigos de error de Postgres (SQLSTATE)**, **ids generados por el cliente**, **entrega
  al menos una vez** y **timestamp sin zona horaria** → SPEC-ALE186-003
  (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Idempotencia** y **factory de datos de prueba** → SPEC-ALE186-002
  (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Dinero en centavos enteros** → SPEC-ALE186-001
  (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)

## Decisiones y por qué

- **ENTREGADO en código, no por trigger.** CLAUDE.md sección 6 pedía un trigger. El
  proyecto no tiene migraciones: el schema se carga solo con la base vacía, así que un
  trigger nuevo obligaría a todos a hacer `docker compose down -v` y perder sus datos de
  desarrollo. La sentencia única es igual de atómica y autoritativa. CLAUDE.md quedó
  corregido (secciones 6 y 13).
- **Se entrega desde RECIBIDO, EN_PROCESO o LISTO.** Si el cliente se llevó la ropa y
  nadie la marcó lista, rechazar la entrega al sincronizar perdería el registro de algo que
  ya pasó. La lista no se escribe a mano: es "todo lo que no está cerrado"
  (`ESTADOS_ENTREGABLES`, `entregas.model.ts:67`), así que un estado nuevo en el futuro
  quedaría entregable sin tocar este archivo.
- **`precio_final` opcional, con el `precio_total` de la orden como valor por defecto.** Lo
  resuelve Postgres con `COALESCE`, en la misma sentencia, con el precio que tiene la orden
  en ese instante. Si lo resolviera el controller leyendo la orden antes, volvería la
  carrera de leer y luego escribir.
- **Con boleta, nombre y carnet son opcionales pero se guardan si vienen.** El schema solo
  los exige sin boleta, y no hay motivo para tirar un dato que el empleado escribió.
- **`sucursalPermitida` está repetida** en los controllers de pagos y entregas, y el de
  órdenes tiene una variante. Unificarla en un solo lugar tocaba controllers fuera del
  scope de esta spec; queda anotado como candidato.

## Los tests

- **Reusados sin cambios:** `testApi`, `expectApiError`, `conSesion`, `IDS`, `ordenDePrueba`
  y `unicidadViolada` (`tests/helpers/postgres.ts`), que acá simula el choque de clave
  primaria de un reintento cruzado.
- **Creado:** `tests/helpers/entregas.ts`, con `entregaDePrueba()`, `cuerpoDeEntrega()` y
  `cuerpoSinBoleta()`. Este último existe porque casi la mitad de los casos son retiros
  sin boleta, y cada uno tendría que acordarse de poner nombre y carnet. Con el helper,
  el test dice solo lo que cambia:

  ```ts
  await retiro(cuerpoSinBoleta({ retirado_por_carnet: ' ' }));   // → 400
  ```

- **El test del model** sigue el mismo esquema que el de pagos (doble del pool, respuestas
  encoladas en orden). Comprueba que el `UPDATE` y el `INSERT` vayan en la misma sentencia
  y que **no** haya `ON CONFLICT`: si alguien lo agrega "por consistencia con pagos", ese
  test lo frena y apunta a la explicación.
- **Contra Postgres real**, con un script de punta a punta fuera del repo (app real, pool
  real, Docker, datos propios que se borran al final), pasaron 39 chequeos. Además de los
  criterios, cubrió tres cosas que los dobles no pueden probar: la **atomicidad** (id
  repetido sobre otra orden → esa orden no cambia), la **carrera con una anulación** sin
  confirmar (la entrega espera y después responde 409) y **dos entregas simultáneas** a
  la misma orden (una 201, la otra 409, y queda exactamente una entrega).

## Si mañana tenés que tocar esto

Empezá por el comentario de `crear` en `src/models/entregas.model.ts`. Dos cosas con las
que tener cuidado:

- **No agregues `ON CONFLICT` a la sentencia.** El porqué está arriba, en Fundamentos.
- **Si una condición nueva decide si se puede entregar**, va dentro del `WHERE` del
  `UPDATE` del CTE, no en el controller. Además hay que sumar el caso a la investigación
  que viene después del intento, para que el `throw` final (`:194`) no se dispare.
