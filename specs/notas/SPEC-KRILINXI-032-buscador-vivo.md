---
id: SPEC-KRILINXI-032
spec: specs/SPEC-KRILINXI-032-buscador-vivo.md
explica:
  - buscar sin tildes cuando la base no sabe (plegar en js y en sql)
  - esperar a que se deje de escribir (debounce) y timers falsos
  - patron combobox de aria (aria-activedescendant)
  - pedir uno mas para saber si hay mas
---

# SPEC-KRILINXI-032 — Buscar mientras se escribe

## Qué se construyó

En Clientes (y en el primer paso de Registrar ropa) ya no hay que saberse el teléfono de memoria
ni tocar "Buscar": mientras se escribe aparecen los clientes más cercanos, por nombre (sin
importar tildes ni mayúsculas), por parte del teléfono o por carnet. Debajo, siempre a mano,
"Cliente nuevo", que abre el alta con lo que ya estaba escrito. La misma búsqueda existe para la
ropa (por boleta o por cliente), lista para el Mostrador de la spec siguiente.

## Cómo funciona, paso a paso

Sigamos a alguien que escribe "jose qui" buscando a José Quispe.

1. **La pantalla monta el buscador** (`frontend/src/features/clientes/components/PantallaClientes.tsx:62`)
   y le da qué buscar (`clientes.buscarVivo`, del hook), cómo mostrar cada resultado, qué hacer al
   elegir (`:68`) y la acción fija "Cliente nuevo" (`:69`).
2. **Cada letra cambia el texto, pero no busca enseguida.** El efecto del buscador
   (`frontend/src/components/BuscadorVivo.tsx:83`) arma un `setTimeout` de 300 ms. Si llega otra
   letra antes, el efecto se limpia: cancela esa espera y arma otra. Solo cuando se deja de
   escribir 300 ms se busca, y con lo último escrito. Antes de eso, `alcanzaParaBuscar`
   (`frontend/src/lib/texto.ts:62`) exige 2 letras o 3 dígitos.
3. **El hook pasa la base** y llama a `buscarClientes`
   (`frontend/src/features/clientes/api/clientesLocal.ts:72`).
4. **Se arma la condición** en `condicionCliente` (`frontend/src/features/clientes/api/busqueda.ts:47`):
   por cada palabra ("jose", "qui") una condición `nombre LIKE '%jose%' OR teléfono… OR carnet…`,
   unidas con AND. El nombre se compara **plegado**: `plegarSql('nombre')`
   (`frontend/src/lib/texto.ts:46`) lo pasa a minúsculas y le quita las tildes dentro de la
   consulta, y lo escrito se pliega igual en JavaScript (`plegar`, `texto.ts:34`). Así "José"
   coincide con "jose". El orden (`busqueda.ts:60`) pone primero a los que empiezan con lo escrito.
5. **Se piden 7 para mostrar 6** (`clientesLocal.ts:83`): si llegan 7, hay más, y la pantalla
   dice "escribí un poco más" (`:86`). No hace falta contar todos.
6. **La respuesta vuelve al buscador** y solo se usa si todavía vale (`BuscadorVivo.tsx:86`): si
   mientras tanto se escribió otra cosa, `vigente` es `false` y se descarta.
7. **Se elige.** Tocar la tarjeta, o flechas + Enter, llama a `alElegir` con el cliente, y la
   pantalla muestra sus datos. Si se toca "Cliente nuevo", recibe lo escrito (`BuscadorVivo.tsx:106`)
   y `datosIniciales` (`FormularioAltaCliente.tsx:23`) decide dónde va: con letras al nombre, solo
   números al teléfono.

## Dónde encaja en la arquitectura

- **`lib/texto.ts`**: reglas puras de texto (plegar, escapar, cuándo alcanza). En `lib/` porque las
  usan clientes, ropa y el componente compartido.
- **`features/clientes/api/busqueda.ts`**: arma SQL, no consulta. Es de clientes, y la ropa lo
  importa para encontrar una boleta por su cliente: una sola regla de "qué es coincidir con un
  cliente". Si la ropa tuviera su copia, un día "jose" encontraría al cliente pero no su ropa.
- **`api/clientesLocal.ts` y `ordenes/api/ropaLocal.ts`**: las consultas, sobre la base local
  (§6: las lecturas siempre del SQLite del dispositivo, también sin internet).
- **`components/BuscadorVivo.tsx`**: genérico (`<T>`), no sabe qué es un cliente. Recibe cómo
  buscar y cómo mostrar. Por eso vive en `components/` y no importa nada de `features/`.
- **Lo que no le toca al buscador**: decidir la regla de coincidencia ni cuántos resultados hay.
  Eso es de la consulta; el buscador solo pide, espera y muestra.

## Fundamentos

### Buscar sin tildes cuando la base no sabe hacerlo

SQLite compara textos byte a byte. `LIKE` ignora mayúsculas, pero **solo** de las letras sin tilde,
y no sabe que "é" y "e" son "la misma letra". La salida es comparar dos versiones "plegadas":

- lo escrito, en JavaScript: `normalize('NFD')` separa cada letra de su tilde ("é" → "e" + "´"),
  se borran las marcas (`\p{Diacritic}`) y se pasa a minúsculas;
- la columna, en SQL: `lower()` y un `replace` por cada letra con tilde, en mayúscula y minúscula.

Las dos tienen que dar **exactamente** lo mismo, y eso no se puede ver leyendo el código. Por eso
el test (`frontend/src/lib/texto.test.ts`) pasa los mismos nombres ("Núñez", "Güemes", "Iñaki")
por las dos, la de SQL **contra SQLite de verdad**, y compara.

El costo: plegar la columna en cada fila impide usar un índice (la consulta recorre toda la tabla).
Con algunos miles de clientes en la tablet es instantáneo. Si algún día fueran cientos de miles, el
arreglo es guardar una columna ya plegada y buscar en ella.

### Esperar a que se deje de escribir (debounce)

Buscar en cada tecla haría 8 consultas para "jose qui", y las 7 primeras no le sirven a nadie. El
*debounce* espera a que la persona haga una pausa: cada tecla reinicia la cuenta. En React no hace
falta una librería: un `setTimeout` dentro de un `useEffect` que depende de lo escrito, y la
función de limpieza del efecto (que React llama antes de volver a correrlo) hace `clearTimeout`
(`BuscadorVivo.tsx:83`). Esa misma limpieza marca `vigente = false`: si la búsqueda ya había
salido, su respuesta se descarta. Son dos protecciones distintas: no buscar de más, y no mostrar
algo viejo.

En el test, esperar 300 ms de verdad haría la suite lenta e insegura. `vi.useFakeTimers()` reemplaza
el reloj del test: `vi.advanceTimersByTime(100)` "pasa" 100 ms en el acto. El test escribe "ro",
"ros", "rosa" con 100 ms entre cada una, avanza 300 y comprueba que se buscó **una** vez, "rosa".

### El patrón combobox de ARIA

Un campo con sugerencias debajo no es un simple `<input>` más una lista. Para un lector de
pantalla, si no se dice nada, la lista no tiene relación con el campo. El patrón *combobox* lo
resuelve con atributos:

- el campo es `role="combobox"` y dice qué lista controla (`aria-controls`) y que esa lista
  completa lo escrito (`aria-autocomplete="list"`);
- la lista es `role="listbox"` y cada resultado `role="option"`;
- **el foco nunca sale del campo**, para poder seguir escribiendo. Las flechas mueven una opción
  "activa" y el campo la señala con `aria-activedescendant` (el `id` de esa opción): el lector la
  lee como si tuviera el foco;
- cuántos resultados hay va en una región viva aparte (`role="status"`, oculta a la vista).

La acción fija ("Cliente nuevo") es una opción más, la última: así se llega a ella con las flechas
igual que a un cliente.

### Pedir uno más para saber si hay más

Para decir "hay más resultados" no hace falta contar todos (un `COUNT(*)` aparte, otra consulta).
Alcanza con pedir `LIMIT 7` cuando se muestran 6: si llegó el séptimo, hay más.

**Ya explicado antes:**

- **Leer estado de React desde fuera (useRef)** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`). Acá, para que una función `buscar` nueva en cada render no dispare otra búsqueda (`BuscadorVivo.tsx:72`).
- **Descartar una respuesta que llega tarde** → SPEC-KRILINXI-010 (`specs/notas/SPEC-KRILINXI-010-renovar-sesion.md`)
- **Componer SQL sin perder la parametrización** → SPEC-ALE186-010 (`specs/notas/SPEC-ALE186-010-auditoria-registro.md`)
- **Hook como puerta a los datos** → SPEC-KRILINXI-005 (`specs/notas/SPEC-KRILINXI-005-clientes-mostrador.md`)
- **Esperar lo que se afirma (findBy, waitFor)** → SPEC-KRILINXI-018 (`specs/notas/SPEC-KRILINXI-018-auditoria-admin.md`)
- **Modo lento al azar** → SPEC-KRILINXI-019 (`specs/notas/SPEC-KRILINXI-019-tests-sin-carreras.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)

## Decisiones y por qué

- **Cada palabra tiene que coincidir (AND), en cualquier dato del cliente.** Con OR, "rosa 7012"
  traería a todas las Rosas y a todos los teléfonos con 7012. Con AND, cada palabra que se agrega
  achica la lista, que es lo que espera quien escribe.
- **La boleta se busca "contiene", no "empieza con"**: las boletas tienen ceros adelante
  ("001234") y nadie los escribe. La exacta va siempre arriba, aunque esté entregada: quien escribe
  el número entero busca esa.
- **No se buscan comodines**: un `%` escrito se escapa (`escaparLike`) y se busca tal cual; si no,
  "%%" traería a todos.
- **Se quitó el paso "no encontrado"** de /clientes: ahora lo dice el buscador ("Ningún cliente
  coincide con eso…") con "Cliente nuevo" debajo. Y `useClientes` dejó de exponer la búsqueda exacta
  por teléfono, que ya no usaba ninguna pantalla (`buscarPorTelefono` sigue: la usa la validación).
- **Fuera del scope declarado**, una línea de `PantallaRegistrarRopa.tsx` ("Buscá al cliente por su
  teléfono" ya no era cierto) y tres archivos de test de otras specs que usaban el buscador viejo.

## Los tests

- **Creado `test/buscador.ts`**: `escribirEnBuscador(texto)` y `elegirEnBuscador(texto, opción)`.
  El buscador responde un rato después de escribir y contra la base, así que los tests tienen que
  esperar. El helper lo hace con un plazo más largo que el de `findBy`, y el test queda en palabras
  de persona: `await elegirEnBuscador('rosa', /Rosa Quispe/)`. El Mostrador (SPEC-KRILINXI-033) lo
  va a usar desde el primer test.
- **`BuscadorVivo.test.tsx`** prueba el componente con un `buscar` falso que el test controla:
  `respuestaPendiente()` arma una promesa que se resuelve cuando el test dice. Así se fuerza que la
  respuesta vieja llegue **después** de la nueva, que es la carrera real. Una mutación (quitar el
  `vigente`) lo hace fallar.
- **Contra SQLite real**: el plegado (`texto.test.ts`), `buscarClientes` y `buscarRopaVivo`.
- **Un test que pasaba de casualidad**: el de "la boleta exacta va primero" buscaba algo que
  devolvía un solo resultado, así que no probaba el orden. Al agregarle una ropa abierta que también
  coincidía, apareció un error real (el "abiertas primero" bajaba la boleta exacta), y se arregló.
  Un test que no puede fallar no prueba nada: conviene preguntarse "¿con qué datos fallaría esto?".
- Cinco corridas en modo lento sin fallos.

## Si mañana tenés que tocar esto

- ¿Qué es "coincidir con un cliente"? `features/clientes/api/busqueda.ts`, y vale para clientes y
  para ropa.
- Si agregás una letra al plegado (una "ç", por ejemplo), va en `PLIEGUES` de `lib/texto.ts`, y el
  test de las dos versiones te avisa si quedaron distintas.
- Para usar el buscador en otra pantalla: `<BuscadorVivo<T>>` con `buscar`, `claveDe`, `mostrar`,
  `alElegir` y, si hace falta, `accion`. La búsqueda tiene que devolver `{ resultados, hayMas }`.
