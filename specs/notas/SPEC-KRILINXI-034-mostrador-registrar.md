---
id: SPEC-KRILINXI-034
spec: specs/SPEC-KRILINXI-034-mostrador-registrar.md
explica:
  - armar la escritura sin hacerla para guardar varias cosas juntas
  - el estado de la pantalla en la direccion (useSearchParams)
---

# SPEC-KRILINXI-034 — Registrar ropa desde el mostrador

## Qué se construyó

Registrar ropa dejó de ser una pantalla aparte: es un botón del Mostrador, siempre a mano. Abre
el formulario de la ropa con el cliente arriba, en el mismo formulario: se lo busca mientras se
escribe o, si viene por primera vez, se cargan su nombre y teléfono ahí mismo y se guarda todo
junto. Desde la ficha de un cliente, viene ya elegido. Después del resumen se va a la ficha del
cliente con la boleta nueva.

## Cómo funciona, paso a paso

Juan viene por primera vez a dejar una camisa. Quien atiende toca "Registrar ropa" en el Mostrador.

1. **Se abre el formulario** (`frontend/src/features/mostrador/components/PantallaMostrador.tsx:161`):
   la vista pasa a `registrando`, sin cliente porque no había ficha abierta. Si se llegó por
   `/registrar-ropa`, la ruta llevó a `/mostrador?registrar` y la vista arranca así (`:103`).
2. **El apartado del cliente empieza por el buscador**
   (`frontend/src/features/clientes/components/ElegirClienteDeLaRopa.tsx`). Escribe "71111111", no
   hay nadie, y toca "Cliente nuevo". Lo escrito se reparte con `datosIniciales` (`:98`): son
   números, así que va al teléfono. El apartado pasa al modo "nuevo" (`:53`) y muestra nombre,
   teléfono y carnet, dentro del mismo formulario.
3. **Completa el nombre y la ropa, y toca Guardar.** El formulario manda todo junto a
   `registrarRopa`, con `cliente: { tipo: 'nuevo', datos }`.
4. **Se valida todo antes de escribir nada** (`frontend/src/features/ordenes/api/ordenesLocal.ts:155`):
   la ropa con `validarRopa` y el cliente con `prepararCliente` (`:129`), que usa las mismas reglas
   que el alta de /clientes (`validarCliente`). Si algo está mal, vuelven todos los errores juntos,
   los del cliente nuevo como `clienteNombre` y `clienteTelefono`, y no se guarda nada.
5. **Si el teléfono ya es de otro cliente** (`:159`), no se guarda: el formulario dice "Ese teléfono
   ya es de Rosa Quispe" y ofrece "Es Rosa Quispe" (`FormularioRopa.tsx:59`). Tocarlo la elige como
   cliente, sin perder la ropa escrita.
6. **Todo bien: una sola transacción.** Se arma la lista de escrituras: el alta de Juan
   (`sentenciaAltaCliente`), la orden y, si dejó adelanto, el pago (`sentenciaPago`). Se guardan
   juntas con `ejecutarJuntas` (`ordenesLocal.ts:216`).
7. **La cola queda en ese orden**: cliente, orden, pago. Cuando haya internet, el servidor recibe a
   Juan antes que la orden que le apunta.
8. **El resumen, y a la ficha.** "Ver la boleta en la ficha de Juan Mamani" (`PantallaMostrador.tsx:149`)
   abre su ficha con la boleta nueva.

## Dónde encaja en la arquitectura

- **`ordenes/api/ordenesLocal.ts`** sigue siendo quien decide si la ropa se puede guardar, y ahora
  también si el cliente nuevo se puede dar de alta. Para eso **usa** la validación de clientes
  (`validarCliente`) en vez de repetirla: la regla de "el teléfono es único" (CLAUDE.md §3) vive en
  un solo lugar.
- **`sentenciaAltaCliente` y `sentenciaPago`** son de sus features (clientes y pagos), y arman la
  escritura sin hacerla. Así otra feature las puede meter en su transacción sin conocer sus columnas.
  `registrarCliente` e `insertarPago` las siguen usando para sus escrituras sueltas.
- **`clientes/components/ElegirClienteDeLaRopa`** no guarda nada: le dice al formulario qué cliente es.
  Quien valida y escribe es la `api/` (CLAUDE.md §5).
- **El Mostrador** solo agrega dos vistas (registrando y registrada) y el botón. El formulario de la
  ropa es el de siempre (`FormularioRopa`).

## Fundamentos

### Armar la escritura sin hacerla, para guardar varias cosas juntas

Hasta acá, cada feature escribía su fila con un `ejecutar` propio: `registrarCliente` insertaba el
cliente e `insertarPago` el pago. Para guardar un cliente nuevo y su ropa **juntos**, esas escrituras
tienen que ir en la misma transacción (`ejecutarJuntas`, SPEC-KRILINXI-013), y una transacción
recibe una lista de sentencias, no funciones que escriben solas.

La salida fue separar **armar** de **escribir**: `sentenciaAltaCliente(cliente)` devuelve
`{ sql, parametros }` sin tocar la base. Quien escribe solo (`registrarCliente`) la ejecuta; quien
necesita juntarla con otras (`registrarRopa`) la pone en su lista.

Sin esto había dos salidas malas. Una era copiar el `INSERT INTO clientes` dentro de `ordenesLocal`,
y el día que la tabla cambie una de las dos copias queda vieja. La otra era escribir el cliente
primero y la ropa después, en dos pasos: si la segunda falla (una boleta repetida que se detectó
tarde, la tablet que se apaga), queda un cliente dado de alta sin la ropa que vino a dejar, y en la
cola, un alta que nadie pidió.

### El estado de la pantalla en la dirección

"Registrar ropa" podría abrirse con un estado en memoria (`navigate('/mostrador', { state })`). Pero
ese estado se pierde al recargar, y no se puede escribir como enlace. Con un parámetro en la dirección,
`/mostrador?registrar`, la dirección **dice** qué hay en pantalla: una recarga (o la tablet que se
reinicia) vuelve al formulario, y `/registrar-ropa` puede redirigir ahí. `useSearchParams` lo lee al
montar (`PantallaMostrador.tsx:103`). Al salir del formulario se borra (`:112`, con `replace`, para
no llenar el historial); si no, una recarga más tarde lo volvería a abrir.

**Ya explicado antes:**

- **Transacción explícita (todo o nada)** → SPEC-ALE186-019 (`specs/notas/SPEC-ALE186-019-migraciones-schema.md`)
- **Cola de subida** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)
- **El orden de la cola como contrato** → SPEC-KRILINXI-006 (`specs/notas/SPEC-KRILINXI-006-registrar-ropa.md`)
- **Unión discriminada** (`ClienteElegido`: existente o nuevo) → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Componer funcionalidades** y **redirigir una dirección vieja** → SPEC-KRILINXI-033 (`specs/notas/SPEC-KRILINXI-033-mostrador-unificado.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)

## Decisiones y por qué

- **Si el teléfono del cliente nuevo ya existe, se avisa antes que los errores de la ropa.** Hay que
  decidir primero quién es el cliente; los errores de la ropa aparecen en el siguiente intento.
- **El buscador nunca envía el formulario con Enter.** Ahora vive dentro del `<form>` de la ropa, y
  un Enter sin una opción elegida lo habría mandado a medio llenar. El primer test de esto pasaba
  aunque el arreglo no estuviera, porque jsdom no envía formularios con Enter; se cambió para mirar
  lo que en un navegador lo impide (que el Enter quede cancelado) y se comprobó que falla sin el arreglo.
- **El foco**: con el cliente ya elegido, el formulario empieza por la boleta; si no, por el buscador.
- **"Es este cliente" de /clientes se quitó**: solo servía para elegir un cliente desde el viejo
  Registrar ropa, que ya no existe.
- **Fuera del scope declarado**: el test de un `BuscadorVivo` de SPEC-KRILINXI-032 tenía una carrera
  (afirmaba el texto de la región viva antes de que llegara); con la suite cargada falló una vez, y
  ahora espera el texto. También se actualizaron los tests de otras specs que nombraban el menú viejo.

## Los tests

- **Movido con `git mv` y reescrito**: el recorrido de Registrar ropa (SPEC-KRILINXI-006), ahora en
  `features/mostrador/components/RegistrarEnMostrador.test.tsx`, con su etiqueta original y la 034.
- **Contra SQLite real** (`ordenesLocal.test.ts`): el cliente nuevo y su ropa se guardan juntos y la cola
  queda `clientes → ordenes → pagos`; con la ropa mal **no queda ni el cliente**; los datos del cliente
  nuevo se validan junto con los de la ropa; el teléfono de otro no guarda nada.
- **Reusados**: `elegirEnBuscador` (también para la acción fija: `elegirEnBuscador('71111111', 'Cliente
  nuevo')`), `baseLocalDePrueba`, `simularApi`, `sinJerga`.
- Diez corridas en modo lento sin fallos.

## Si mañana tenés que tocar esto

- ¿Otra escritura que tiene que ir junto con la orden? Armá su sentencia en su feature (como
  `sentenciaPago`) y sumala a la lista de `registrarRopa`, en el orden en que el servidor la necesita.
- ¿Un dato más del cliente nuevo? Va en `DatosAlta` y en `ElegirClienteDeLaRopa`; la validación es la de
  `validarCliente`, para el alta de /clientes y para esta.
