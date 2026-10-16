---
id: SPEC-KRILINXI-013
spec: specs/SPEC-KRILINXI-013-corregir-registros.md
explica:
  - insert or replace (upsert) en la base local
  - probar el comportamiento de una libreria antes de decidir
  - reenviar un alta rechazada con la misma identidad
---

# SPEC-KRILINXI-013 — Corregir y volver a enviar lo que el servidor rechazó

## Qué se construyó

Hasta ahora, cuando el servidor decía que no (por ejemplo, una boleta repetida), la tablet lo
mostraba en "Registros para corregir" y ahí terminaba: el empleado leía el motivo y avisaba.
Ahora cada registro tiene dos botones. **Corregir** abre los datos que se habían enviado,
deja arreglarlos y los vuelve a guardar, también sin internet. **Descartar** lo saca de la
lista después de pedir confirmación.

## Cómo funciona, paso a paso

Seguimos el caso típico: Rosa registra ropa con la boleta 001234, pero ese número ya lo había
usado otra tablet de la sucursal.

**1. El rechazo.** Al subir la cola, `subirCola` recibe un 409 y copia la operación a
`para_corregir` (`lib/powersync/conector.ts:93`). Guarda la tabla, el id de la fila, la
operación (`PUT` para un alta) y, en `datos`, todo lo que se intentó subir. Después da la
transacción por terminada (`conector.ts:96`). Esto es de SPEC-KRILINXI-007 y no cambió.

**2. La lista.** `listarParaCorregir` lee esas filas. Desde esta spec cada registro trae
también `tabla`, `registroId`, `operacion` y `datos` (el tipo está en
`features/pendientes/types.ts`), que es lo que hace falta para corregirlo.
`PantallaParaCorregir` (`features/pendientes/components/PantallaParaCorregir.tsx:22`) dibuja
cada uno con sus dos botones.

**3. "Corregir".** Al tocarlo, la pantalla guarda qué registro se está corrigiendo
(`PantallaParaCorregir.tsx:103`) y muestra `FormularioCorreccion` en lugar de la lista (`:34`).
Lo primero que hace el formulario es preguntar qué hay que mostrar
(`FormularioCorreccion.tsx:55`):

- `prepararCorreccion` (`features/pendientes/correccion.ts:84`) busca los campos de esa tabla
  en `CAMPOS` (`correccion.ts:38`). Las etiquetas son las mismas de la pantalla de origen:
  "Número de la boleta", "Precio (Bs)".
- Rellena cada campo con lo enviado, convertido a como lo escribe una persona
  (`paraFormulario`, `correccion.ts:63`): el `"50.00"` guardado se muestra como `"50,00"`.
- Si es una edición (`PATCH`), muestra solo lo que había cambiado (`camposDe`, `:78`).
- Si lo rechazado era un cambio de estado, no arma formulario: devuelve un mensaje que manda
  a "Ropa en el local".

**4. Rosa escribe 001235 y toca "Volver a guardar".** El formulario llama a `guardar(valores)`
(`FormularioCorreccion.tsx:124`). Esa función es del hook `useCorreccion`
(`hooks/useCorreccion.ts:31`), que le agrega la base local y la sucursal de la sesión.

**5. Se valida con las mismas reglas.** `guardarCorreccion`
(`api/corregirLocal.ts:170`) elige el validador según la tabla (`validar`, `:136`). Para una
orden es `validarOrden` (`:53`), que llama a `validarRopa`
(`features/ordenes/api/ordenesLocal.ts:88`). Es la misma función que usa "Registrar ropa"
(`ordenesLocal.ts:123`): antes esa validación estaba dentro de `registrarRopa` y esta spec la
separó para que las dos pantallas compartan reglas y mensajes. Hay una diferencia: la consulta
de boleta repetida deja afuera a la propia orden (`id IS NOT ?`, `ordenesLocal.ts:68`), porque
su fila rechazada puede seguir en la tablet con el número viejo.

**6. Se vuelve a escribir.** Si todo está bien, `reescribirAlta` (`corregirLocal.ts:157`) arma
un `INSERT OR REPLACE` con **el mismo id**: los datos originales con los corregidos encima
(`:161`). Esa sentencia y el `DELETE` de `para_corregir` van juntos en
`ejecutarJuntas` (`corregirLocal.ts:198`), que en la base local es una transacción de
PowerSync (`lib/powersync/control.ts:72-73`).

**7. Qué ve el empleado.** La pantalla vuelve a la lista con el aviso "Listo: la corrección
quedó guardada en esta tablet…". El aviso de conexión deja de decir "1 registro no se pudo
guardar" y pasa a "1 registro se guardará cuando vuelva la conexión". No hubo que tocarlo:
`observarEstado` ya escucha `para_corregir` y la cola.

**8. La próxima subida.** La cola encuentra un `PUT`, así que manda `POST /api/ordenes` con el
mismo id y la boleta 001235. Si el servidor vuelve a rechazarlo, el paso 1 ocurre otra vez y
el registro reaparece en la lista con el motivo nuevo.

## Dónde encaja en la arquitectura

Es la misma partición de siempre en `features/<x>/` (CLAUDE.md §5), con una pieza más:

| Pieza | Qué hace | Qué no le toca |
|---|---|---|
| `components/` | Mostrar el formulario y lo que le contestan | Importar de `api/`, ni siquiera tipos |
| `hooks/useCorreccion.ts` | Darle a la pantalla `guardar` y `descartar`, ya atados a la base y a la sucursal | Validar |
| `correccion.ts` | La parte **pura**: qué campos, con qué valores arrancar | Tocar la base |
| `api/corregirLocal.ts` | Validar y escribir en SQLite | Hablar con la API: eso es de la cola |

La parte pura está fuera de `api/` por una regla que el repo ya vigila: el test de
arquitectura falla si un componente importa algo de una carpeta `api/` (lo encontró en la
primera corrida de esta spec). Es el mismo motivo por el que `features/ordenes/estado.ts` está
donde está.

**Escribir sigue siendo solo local** (CLAUDE.md §6). La corrección no le pide nada al servidor:
escribe en SQLite y la cola hace el resto. Por eso funciona sin internet.

## Fundamentos

### `INSERT OR REPLACE`: un alta que pisa lo que haya

En SQLite, `INSERT OR REPLACE` funciona como un `INSERT`, salvo cuando ya existe una fila con
la misma clave: en ese caso la borra y pone la nueva en su lugar. Así se puede escribir sin
saber si la fila sigue ahí.

Acá hacía falta porque **no sabemos si la fila rechazada sigue en la tablet**. PowerSync la
revierte (la quita, porque el servidor no la tiene) en la siguiente sincronización. Si la
tablet perdió internet justo después del rechazo, la fila sigue ahí. En ese caso un `INSERT`
normal falla con `UNIQUE constraint failed: ps_data__ordenes.id`.

Lo importante es cómo lo anota PowerSync: el `OR REPLACE` llega a la cola como un **`PUT`
completo**, es decir, un alta. No llega como un borrado seguido de un alta (un `DELETE` lo
rechazaría el conector y terminaría en `para_corregir`), ni como una edición (un `PATCH` daría
404, porque el servidor nunca tuvo esa fila). El test "funciona aunque la fila rechazada siga
en la tablet" (`corregirLocal.test.ts`) prueba justamente ese caso.

### Reenviar con la misma identidad

Volver a mandar un alta rechazada parece pedir un id nuevo, como si fuera otro registro. Acá
se reusa el viejo, y es la decisión que más pesa de la spec:

- **El servidor no lo conoce.** Un rechazo significa que no se escribió nada, así que el id
  está libre. La idempotencia del backend (→ SPEC-ALE186-002) no estorba: solo actúa cuando
  el id ya existe.
- **Hay registros que apuntan a él.** Registrar ropa escribe la orden y, aparte, su adelanto
  con `orden_id` apuntando a ella. Si la orden vuelve rechazada, el adelanto también vuelve:
  "Esa orden no existe en esta sucursal". Con el mismo id, corregir la orden alcanza para que
  el adelanto se pueda reenviar **tal cual**. Con un id nuevo, el adelanto apuntaría a algo
  que nunca va a existir. Lo prueba "un cobro rechazado porque su orden no llegó se reenvía
  tal cual" (`corregirLocal.test.ts`).

### Mirar cómo se comporta la librería antes de decidir

Las dos preguntas de arriba (qué pasa con un `INSERT` duplicado y cómo anota PowerSync un `OR
REPLACE`) no se respondían leyendo nuestro código. Antes de elegir, se escribió un test
descartable contra la base real de los tests (→ SPEC-KRILINXI-004): insertar, dar la cola por
subida, volver a insertar y mirar `getCrudBatch()`. En diez líneas mostró tres cosas:

1. El `INSERT` duplicado falla.
2. El `OR REPLACE` funciona y se anota como `PUT`.
3. Un `UPDATE` que no cambia nada **igual encola** un `PATCH {}` vacío.

El tercer punto fue una sorpresa y cambió el código: por eso la edición calcula qué columnas
difieren de la tablet y no escribe nada si no difiere ninguna (`corregirLocal.ts:204`). El test
se borró después: la respuesta quedó en el código y en los tests de verdad.

Si una decisión depende de cómo se comporta una librería, mejor preguntárselo a la librería
que suponerlo.

**Ya explicado antes:**

- **Tabla solo local para lo rechazado** → SPEC-KRILINXI-007 (`specs/notas/SPEC-KRILINXI-007-cola-subida.md`)
- **Cola de subida (crud queue)** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)
- **Transacción explícita** → SPEC-ALE186-019 (`specs/notas/SPEC-ALE186-019-migraciones-schema.md`): `ejecutarJuntas` es lo mismo en SQLite.
- **Nombres que no pueden ir como parámetro** → SPEC-ALE186-007 (`specs/notas/SPEC-ALE186-007-tests-base-real.md`): la tabla y las columnas del `INSERT OR REPLACE` se comprueban contra `CAMPOS` y `/^[a-z_]+$/`.
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Errores esperados como valor de retorno** → SPEC-KRILINXI-005 (`specs/notas/SPEC-KRILINXI-005-clientes-mostrador.md`): `ResultadoCorreccion`.

## Decisiones y por qué

- **El mismo id, no uno nuevo.** Ver Fundamentos. La alternativa era generar uno nuevo y
  reescribir los `orden_id` de lo que estaba en `para_corregir`: más código, y frágil.
- **Un cambio de estado no se corrige en esta pantalla.** Si el servidor lo rechazó es porque
  la ropa ya está en otro estado (anulada, entregada desde otra tablet). Cambiarlo "a ciegas"
  desde una lista de rechazos sería peor que mandar a "Ropa en el local", donde se ve el estado
  real y los avances que corresponden.
- **Una edición que no cambia nada no se guarda.** Volver a mandar lo mismo daría el mismo
  rechazo. Con un alta, en cambio, reenviar sin cambios sí tiene sentido: es el caso del
  adelanto cuya orden ya se corrigió.
- **Las validaciones se reusan, no se copian.** `validarRopa` salió de `registrarRopa`, y los
  textos de clientes, cobros y entregas se importan de su feature. Para eso hubo que tocar dos
  archivos `api/` de otras features (`ordenesLocal.ts`, `clientesLocal.ts`). Se corrigió el
  `scope` de la spec, que había declarado sus `components/`.
- **Lo que queda afuera** está en CLAUDE.md §13: un cliente nuevo rechazado porque su teléfono
  ya era de otro cliente. La ropa registrada para él también vuelve rechazada, y corregirla
  exigiría cambiarle el cliente.

## Los tests

- **Helper nuevo: `test/rechazos.ts`.** `subirRechazando(db, status, codigo, mensaje)` sube la
  cola contra un servidor falso que dice que no a todo, y `subirAceptando(db)` contra uno que
  dice que sí, devolviendo lo que le llegó. Así las filas de `para_corregir` las escribe **la
  subida real**, no el test a mano: si mañana cambia lo que guarda el conector, estos tests se
  enteran. La próxima spec que necesite "algo rechazado" (por ejemplo, editar-cliente,
  SPEC-KRILINXI-014) lo usa en una línea.
- **Reusados:** `baseLocalDePrueba` y `sembrar` (la base real), `ordenDePrueba` /
  `clienteDePrueba` (`test/filasDePrueba.ts`), `simularApi` (por debajo de `rechazos.ts`),
  `renderEnRuta` y `sinJerga`, que se llama en cada paso de la pantalla.
- **`controlFalso`** ganó `ejecutarJuntas`, porque cumple el mismo tipo que la base de verdad.
- El recorrido de pantalla (`PantallaParaCorregir.test.tsx`) empieza desde la App, con la
  tablet sin internet (la base de prueba nunca se conecta), y termina mirando el aviso de
  conexión.

## Si mañana tenés que tocar esto

- **Agregar un campo corregible:** `CAMPOS` en `correccion.ts` y el validador de su tabla en
  `corregirLocal.ts`. Si la pantalla de origen ya tiene esa validación, exportala desde ahí en
  vez de copiarla.
- **Cuidado con el `UPDATE`:** un `UPDATE` que no cambia nada igual encola un `PATCH {}`. Si
  agregás otra escritura de edición, calculá antes qué difiere.
- **Cuidado con el `id`:** cualquier cambio que haga generar un id nuevo al corregir rompe el
  reenvío de lo que dependía del registro. El test del cobro que sigue a su orden lo detecta.
