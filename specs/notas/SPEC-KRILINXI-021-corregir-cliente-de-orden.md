---
id: SPEC-KRILINXI-021
spec: specs/SPEC-KRILINXI-021-corregir-cliente-de-orden.md
explica:
  - filtrar dentro de la consulta y no despues del limit
  - la misma persona con dos identidades (clave natural)
---

# SPEC-KRILINXI-021 — Corregir la ropa de un cliente que ya existía

## Qué se construyó

Dos sucursales sin internet dan de alta a la misma Rosa. Cuando la segunda tablet sube, el
servidor rechaza su Rosa porque el teléfono ya es de la otra, y la ropa que le registró también
vuelve rechazada, porque su cliente no existe en el servidor. Hasta ahora la única salida era
descartar todo y volver a cargarlo.

Ahora, al tocar "Corregir" en ese cliente, la tablet muestra a la Rosa que ya existe, con su
nombre y teléfono para comparar. Con **"Es el mismo cliente"**, la ropa y el adelanto pasan a su
nombre y se vuelven a guardar, y el cliente repetido se descarta. Funciona sin internet.

## Cómo funciona, paso a paso

1. **El rechazo trae su código.** El registro para corregir ahora lleva `codigo` (el
   `TELEFONO_DUPLICADO` que mandó el servidor), además del mensaje para la pantalla.
   `para_corregir` ya lo guardaba desde la 007; faltaba leerlo.
2. **¿La tablet conoce a la otra Rosa?** `MismoCliente` (`pendientes/components/MismoCliente.tsx:21`)
   llama a `buscar(registro)` (`:28`), que llega a `buscarMismoCliente`
   (`pendientes/api/corregirLocal.ts:232`). Solo actúa en un alta de cliente rechazada por
   teléfono repetido (`:233`), y busca ese teléfono **sin contar al propio cliente** (`:236`).
   Si la otra Rosa todavía no bajó a esta tablet, devuelve `null`, el panel no aparece y queda
   la corrección de siempre.
3. **Confirmar.** El empleado ve "Rosa Quispe (70123456)", toca "Es el mismo cliente" y confirma.
   `usar` (`MismoCliente.tsx:40`) llega a `usarMismoCliente` (`corregirLocal.ts:246`).
4. **Qué se mueve.** De la lista de rechazados se toman:
   - las altas de ropa cuyo `cliente_id` es la Rosa rechazada (`:253`);
   - los cobros y entregas que apuntan a esa ropa (`:255`).
5. **Una sola transacción** (`:259` a `:264`), en este orden:
   - sacar el cliente rechazado de la lista;
   - por cada orden, `reescribirAlta` con `cliente_id` de la otra Rosa (mismo id de orden,
     → SPEC-KRILINXI-013) y sacarla de la lista;
   - por cada cobro, `reescribirAlta` tal cual y sacarlo de la lista.

   El orden de las sentencias es el de la cola, así que primero sube la orden y después el cobro
   que le apunta.
6. **La pantalla** vuelve a la lista con "Listo: la ropa quedó a nombre de Rosa Quispe y se va a
   guardar de nuevo." En "Ropa en el local", la boleta ya figura con la Rosa que existe.

## Dónde encaja en la arquitectura

Es la 013 con un camino más. La lógica sigue en `api/corregirLocal.ts`, el hook `useCorreccion`
suma dos funciones, y el componente nuevo no importa nada de `api/` (lo vigila el test de
arquitectura). `FormularioCorreccion` recibe el panel por una propiedad (`antesDelFormulario`) en
vez de conocerlo: el formulario no sabe nada de clientes repetidos, solo deja un lugar arriba.

Hubo que tocar `features/clientes/api/clientesLocal.ts`. El error de abajo estaba en la búsqueda
por teléfono, que es de clientes, y arreglarlo ahí lo arregla para todos los que la usan: el alta,
la edición (014), la corrección (013) y esta spec.

## Fundamentos

### Filtrar dentro de la consulta, no después del `LIMIT`

`buscarPorTelefono` hacía `SELECT … WHERE telefono = ? LIMIT 1`, y `validarCliente` descartaba
después al cliente propio: "si el que encontré soy yo, el teléfono está libre". Mientras cada
teléfono tuviera una sola fila, daba igual. Pero esta spec existe porque hay un momento en que la
tablet tiene **dos** filas con el mismo teléfono: la Rosa rechazada, que sigue ahí hasta la
próxima sincronización, y la Rosa que bajó de la otra tablet.

Con dos filas, `LIMIT 1` devuelve **una cualquiera**. Si salía la propia, el filtro de después la
descartaba y quedaba "libre", aunque la otra Rosa estuviera ahí. El resultado dependía del orden
en que SQLite guardó las filas: no fallaba siempre, solo a veces.

El arreglo es pedir lo que se quiere **en la consulta**: `WHERE telefono = ? AND id IS NOT ?`
(`clientes/api/clientesLocal.ts:45`). Así el `LIMIT 1` elige entre las que sirven.

La regla general: **un `LIMIT` corta antes de que tu código vea los datos, así que cualquier
condición que decida qué fila sirve tiene que ir antes del corte**, en el `WHERE`. Filtrar en
JavaScript después de un `LIMIT 1` es filtrar una muestra, no el total.

El test que lo reproduce (`clientesLocal.test.ts`, "Un teléfono repetido en la tablet") falló
tres veces de tres antes del arreglo.

### La misma persona con dos identidades

En un sistema que trabaja sin conexión, **los ids los genera cada dispositivo** (→ SPEC-ALE186-003,
"ids generados por el cliente"). Si dos tablets dan de alta a la misma persona sin hablarse, nacen
dos clientes con ids distintos para una sola Rosa. El servidor no puede saber que son la misma
por el id; lo sabe por la **clave natural**, el teléfono, que es único (CLAUDE.md §3).

Hay dos maneras de resolverlo:

- **El servidor fusiona solo.** Acepta la segunda Rosa como alias de la primera. Es cómodo, pero
  decide por el empleado: dos personas pueden compartir un teléfono de la casa.
- **El empleado confirma.** El servidor rechaza, y la tablet ofrece la otra Rosa con su nombre
  para comparar. Es lo que hace esta spec: la máquina encuentra al candidato y la persona decide.

Por eso el panel muestra **nombre y teléfono** antes de confirmar, y la confirmación dice qué va a
pasar ("la ropa de este registro pasa a nombre de Rosa Quispe").

**Ya explicado antes:**

- **Reenviar un alta rechazada con la misma identidad** → SPEC-KRILINXI-013 (`specs/notas/SPEC-KRILINXI-013-corregir-registros.md`): la orden conserva su id, solo cambia su `cliente_id`.
- **`INSERT OR REPLACE` en la base local** → SPEC-KRILINXI-013: `reescribirAlta`.
- **Orden de la cola como contrato** → SPEC-KRILINXI-006: primero la orden, después el cobro.
- **Transacción explícita** → SPEC-ALE186-019: el "todo o nada" de `ejecutarJuntas`.
- **Esperar lo que se afirma** → SPEC-KRILINXI-018: un test nuevo de esta spec buscó "Volver al inicio" con `getBy…` antes de que la lista vacía terminara de leerse.

## Decisiones y por qué

- **El criterio 6 se implementó como está escrito.** Si la tablet no conoce a la otra Rosa, no
  hay panel y se puede corregir el teléfono como antes. En la revisión se propuso decir "va a
  aparecer cuando haya internet" en vez de ofrecer corregir un teléfono que está bien; la spec se
  aprobó sin ese cambio. Si hace falta, es un texto en `MismoCliente`.
- **La ropa no se vuelve a validar** al pasarla al otro cliente. Se rechazó por el cliente, no por
  su boleta; si algo más estuviera mal, el servidor la rechaza de nuevo y vuelve a la lista con el
  motivo nuevo (como en la 013).
- **También se mueven las entregas**, además de los cobros que pide el criterio. La descripción
  dice "y lo que dependa de ella", y una entrega rechazada de esa ropa tiene el mismo problema.

## Los tests

- **Helper ampliado: `test/rechazos.ts`.** `subirRechazandoPorRuta(db, { '/clientes': [409, …],
  '/ordenes': [400, …] })` rechaza distinto según la ruta y acepta las demás. Es lo que pasa de
  verdad en este caso: el cliente y su ropa vuelven con errores distintos.
- **Helper nuevo: `test/clienteRepetido.ts`.** `dosTabletsConLaMismaRosa()` arma el escenario
  completo (alta, ropa con adelanto, los rechazos y la Rosa de la otra tablet). Lo usan el test de
  la lógica y el de pantalla, y con `{ bajaLaOtra: false }` la tablet todavía no la conoce.
- **El "todo o nada" se prueba rompiendo la transacción:** una base que agrega una sentencia que
  falla al final. Después, los tres registros siguen en la lista y la cola está vacía.
- **El modo lento de la 019** corrió sobre los tests nuevos: 0 fallos en 4.

## Si mañana tenés que tocar esto

- **Otra cosa que dependa de la ropa** y pueda volver rechazada: sumala a `loQueLesApunta` en
  `usarMismoCliente`.
- **Cualquier búsqueda con `LIMIT` que excluya algo:** la exclusión va en el `WHERE`.
