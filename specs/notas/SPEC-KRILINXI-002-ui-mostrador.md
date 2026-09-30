---
id: SPEC-KRILINXI-002
spec: specs/SPEC-KRILINXI-002-ui-mostrador.md
explica:
  - componente controlado
  - doble envio (estado y ref)
  - etiqueta y descripcion accesibles
  - rechazo de promesa sin manejar
  - test contra la fuente de verdad
  - test de arquitectura
  - tipos derivados de una lista (as const)
  - type guard
---

# SPEC-KRILINXI-002 — Componentes del mostrador y dominio compartido

## Qué se construyó

Las piezas que van a reutilizar todas las pantallas antes de que exista la primera:

- un **botón grande** que no cobra dos veces si se lo toca dos veces seguidas;
- un **campo** con la etiqueta siempre visible y el error escrito debajo;
- un **cuadro de confirmación** que dice qué va a pasar antes de algo irreversible.

Del lado de los datos:

- **cómo se leen y se muestran los montos** ("12,50"), sin usar floats;
- **la lista oficial de estados, tipos y métodos de pago**, cada uno con el texto que ve el empleado ("En proceso", no `EN_PROCESO`).

Todavía ninguna pantalla los usa: `ui-mostrador` solo fija las piezas. Las pantallas llegan con las specs siguientes.

## Cómo funciona, paso a paso

### Recorrido 1: un empleado escribe "1234,5" en el campo de precio

1. El texto entra por `CampoTexto` (`frontend/src/components/CampoTexto.tsx:35`). El campo
   no se queda con el evento del DOM: llama a `onChange` pasándole directamente el texto.
   La pantalla que lo use solo maneja strings.
2. Al guardar, la pantalla llama a `parsearMonto("1234,5")` (`frontend/src/lib/money.ts:28`).
3. La expresión regular `MONTO_ESCRITO` (`money.ts:19`) separa `1234` y `5`. Acepta coma
   o punto, pero un solo separador y como mucho dos decimales.
4. Los decimales se completan a la derecha, `5` → `50`, y el resultado es
   `1234 * 100 + 50 = 123450` centavos: un entero exacto.
5. Si el texto no encaja (`"doce"`, `"12,505"`, `"1.234,56"`), `parsearMonto` lanza un
   `Error` escrito en el idioma del mostrador. La pantalla lo pasa tal cual a la prop
   `error` de `CampoTexto`, que lo muestra debajo del input (`CampoTexto.tsx:37`).
6. Para mostrarlo de vuelta, `formatearMonto(123450)` (`money.ts:62`) pone el punto de
   miles con una expresión regular (`money.ts:69`) y devuelve `"1.234,50"`.

### Recorrido 2: la tablet recibe de SQLite una orden con `estado = 'EN_PROCESO'`

1. Lo que sale de SQLite es un `string` cualquiera, porque SQLite no tiene ENUM.
2. `esEstadoOrden(valor)` (`frontend/src/lib/dominio.ts:39`) comprueba si está en
   `ESTADOS_ORDEN` (`dominio.ts:16`). Si está, TypeScript pasa a tratarlo como `EstadoOrden`.
3. Con eso ya se puede indexar `TEXTO_ESTADO_ORDEN[valor]` (`dominio.ts:47`), y el empleado
   ve "En proceso".
4. Si alguien añade un estado al schema y no lo añade aquí, falla
   `frontend/src/lib/dominio.test.ts`. El test lee los `CREATE TYPE … AS ENUM` del SQL real
   (`dominio.test.ts:26`) y los compara con las listas del código.

### Recorrido 3: un doble toque en "Cobrar"

1. Primer toque: `manejarClick` (`frontend/src/components/Boton.tsx:55`) pone
   `enCurso.current = true` y `setTrabajando(true)`, y espera la promesa de `onClick`.
2. Segundo toque, unos milisegundos después: `enCurso.current` ya es `true`, así que la
   función sale sin hacer nada. Para entonces React normalmente ya re-renderizó y el botón
   está `disabled` (`Boton.tsx:70`). La ref cubre el caso en que el toque llega antes que ese
   re-render.
3. Cuando la promesa termina, bien o mal, el `finally` (`Boton.tsx:60`) libera el botón.

## Dónde encaja en la arquitectura

- **`components/`** es la UI compartida de CLAUDE.md §5: no sabe de órdenes ni de clientes,
  y **no pide datos**. Todo le llega por props. Si un `Boton` hiciera su propio `axios.post`,
  habría que levantar un servidor para testearlo y no se podría reutilizar en otra pantalla.
  La regla la vigila `frontend/src/components/sinDatos.test.ts`.
- **`lib/money` y `lib/dominio`** son lógica pura, sin React. `lib/money` es el helper que
  CLAUDE.md §6 pide "en un único lugar". `lib/dominio` es el "módulo de constantes
  tipadas" de esa misma sección. Validar ahí es **cortesía**: el backend vuelve a validar
  cada escritura, y esa es la garantía.
- **Qué no les toca:** el símbolo de moneda (no está decidido y, cuando se decida, lo pone
  la pantalla) y decidir cuándo se cierra el modal (lo decide quien lo abre).

## Fundamentos

### Tipos derivados de una lista (`as const` y `(typeof X)[number]`)

**Qué es.** Escribir los valores una sola vez, como dato, y sacar de ahí el tipo en vez de
escribirlo dos veces. `['RECIBIDO', 'EN_PROCESO'] as const` (`dominio.ts:16`) le dice a
TypeScript que no es un `string[]` cualquiera, sino una tupla fija de esos literales. Después,
`(typeof ESTADOS_ORDEN)[number]` (`dominio.ts:24`) quiere decir "el tipo de cualquier
elemento de esa lista", o sea `'RECIBIDO' | 'EN_PROCESO' | …`.

**Por qué.** Hacen falta las dos cosas: la lista, para recorrerla en tiempo de ejecución
(llenar un desplegable, validar), y el tipo, para que el compilador rechace `'EN PROCESO'`
mal escrito. Si se escriben por separado, algún día dejan de coincidir.

**Sin esto:** un `type EstadoOrden = 'RECIBIDO' | …` escrito a mano, más un array escrito a
mano al lado, y un test que no se entera cuando alguien toca uno y olvida el otro.

`Record<EstadoOrden, string>` (`dominio.ts:47`) remata el patrón: el objeto de textos
**tiene** que tener una clave por cada estado, o no compila.

### Type guard (estrechar un tipo comprobándolo)

**Qué es.** Una función que devuelve `boolean` y cuyo tipo de retorno se escribe
`valor is EstadoOrden`. Cuando da `true`, TypeScript trata al valor como `EstadoOrden` dentro
del `if`. El ejemplo del repo es `crearValidador` (`dominio.ts:35`), que fabrica uno por lista.

**Por qué.** Los datos que llegan de fuera (SQLite, la red) son `unknown`: TypeScript no
puede saber qué traen. Hay dos formas de convertirlos. `valor as EstadoOrden` es una
**afirmación**: el compilador te cree sin comprobar nada, y si mentiste explota más tarde,
lejos del origen. Un type guard es una **comprobación**: el tipo solo cambia si el valor
pasó el test en tiempo de ejecución. La spec pedía justamente "sin `any` ni casts".

**En los tests:** `dominio.test.ts`, "estrecha el tipo", muestra que después del `if` se
puede indexar `TEXTO_ESTADO_ORDEN[deSqlite]`, cosa que con un `unknown` no compilaría.

### Test contra la fuente de verdad

**Qué es.** Un test que no compara el código consigo mismo, sino con otro artefacto del
repo que manda sobre él. `dominio.test.ts:26` lee `context/lavanderia_schema.sql` y compara
sus ENUM con las listas de `dominio.ts`.

**Por qué.** Un test que dijera `expect(ESTADOS_ORDEN).toEqual(['RECIBIDO', …])` solo
copiaría la lista en un segundo lugar: si cambia el schema, los dos quedan igual de mal.
Leer el SQL ata el código a la base, que es la que decide.

**El detalle que lo hace útil:** la lista `NO_SE_USAN_EN_EL_DISPOSITIVO`
(`dominio.test.ts:48`). Si mañana aparece un ENUM nuevo en el schema, el test falla hasta
que alguien decida si va al dispositivo o no. No lo ignora en silencio.

### Test de arquitectura

**Qué es.** Un test que no prueba comportamiento, sino una **regla de cómo está organizado
el código**. `components/sinDatos.test.ts` lee cada archivo de `components/` y falla si
alguno importa axios, PowerSync, `fetch` o una feature (`sinDatos.test.ts:18`).

**Por qué.** "Ningún componente llama a axios" (CLAUDE.md §5) es fácil de escribir en un
documento y fácil de romper con prisa. Un revisor puede pasarlo por alto; el test no.

**Límite honesto:** busca texto, no entiende el código. Un import armado de forma rara se le
escapa. Para una regla de equipo alcanza; si algún día hace falta más, el siguiente paso es
una regla de ESLint (`no-restricted-imports`).

### Componente controlado

**Qué es.** Un componente que no guarda su propio estado, sino que lo recibe por props y
avisa cuando debería cambiar. `CampoTexto` recibe `value` y llama a `onChange`: no se
acuerda de lo que escribiste. Lo guarda quien lo usa. `ModalConfirmacion` recibe `abierto`
y no se cierra solo: llama a `onCancelar` y espera que lo cierren desde fuera.

**Por qué.** Quien usa el campo puede validar, normalizar o vaciar el texto en cualquier
momento, porque el valor es suyo. En el modal, quien lo abre decide si se cierra enseguida
o después de que la acción termine, y si falla puede dejarlo abierto con un mensaje.

**Sin esto:** cada pantalla tendría que meterse en el DOM del componente para leer lo que
tiene dentro, y el mismo dato viviría en dos sitios.

### Accesibilidad: etiqueta y descripción enlazadas

**Qué es.** Enlazar el texto con el control al que pertenece. `<label htmlFor={id}>`
(`CampoTexto.tsx:28`) dice "esta etiqueta es de ese input", y `aria-describedby`
(`CampoTexto.tsx:37`) dice "este párrafo describe a ese input": ahí va el error. `useId`
(`CampoTexto.tsx:23`) genera ids únicos, así dos campos en la misma pantalla no se pisan.

**Por qué, en este proyecto.** Tocar la etiqueta pone el foco en el campo, que es un área
de toque más grande para quien tiene poca puntería. Un lector de pantalla lee el error al
entrar al campo. Y además los tests lo aprovechan: `getByLabelText('Teléfono')` y
`toHaveAccessibleDescription(…)` solo funcionan si el enlace existe. **Testear como lo usa
una persona obliga a construir como lo usa una persona.**

### Doble envío: por qué estado *y* ref

**Qué es.** Proteger una acción para que no se ejecute dos veces por dos toques rápidos.

**Por qué las dos.** `useState` (`Boton.tsx:47`) es lo que hace que React vuelva a pintar el
botón deshabilitado, pero ese cambio llega en el siguiente render, no en el acto. `useRef`
(`Boton.tsx:50`) cambia en el mismo instante y no provoca render. El estado se encarga de
lo que se **ve**; la ref de lo que se **decide**.

**Sin esto:** dos pagos registrados por un solo cobro. Offline es peor: los dos quedan en
la cola y suben juntos cuando vuelve la conexión.

### Rechazo de promesa sin manejar

**Qué es.** Una promesa que falla sin que nadie haya puesto un `.catch` ni un `try` con
`await` para recibir el error. El entorno (navegador, Node, Vitest) lo reporta como error
suelto.

**Dónde aparece aquí.** El `try/finally` de `Boton.tsx:60` libera el botón pero **no
atrapa** el error. React descarta la promesa que devuelve el manejador del click, así que si
la acción falla, el error sale como rechazo sin manejar. Es a propósito: el botón no puede
saber qué decirle al empleado ("no se pudo cobrar"), así que no finge que no pasó nada
(CLAUDE.md §6: ningún error queda en silencio). Manejarlo es trabajo de quien pasa la acción.

**En los tests** (`Boton.test.tsx:56`) se escucha el evento `unhandledRejection` para
**afirmar** que el error se escapó. Sin ese listener, Vitest lo reporta como fallo de toda
la corrida, que era justo lo que pasaba en el primer intento.

**Ya explicado antes:**

- **Dinero en centavos enteros** y **punto flotante** → SPEC-ALE186-001
  (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Funciones puras testeables** → SPEC-ALE186-001
  (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Testing Library**, **jsdom** y **helper de test** → SPEC-KRILINXI-001
  (`specs/notas/SPEC-KRILINXI-001-frontend-scaffold.md`)

## Decisiones y por qué

- **`parsearMonto` rechaza "1.234,56".** Aceptar separador de miles obliga a adivinar si
  "1.234" son mil doscientos treinta y cuatro o uno con veintitrés. Se prefiere un error
  que pida reescribirlo antes que un cobro mil veces menor.
- **Tampoco acepta negativos.** Ningún monto del negocio lo es (CLAUDE.md §3). `restar` sí
  puede dar negativo, porque un saldo a favor existe.
- **`formatearMonto` se arma a mano y no con `Intl.NumberFormat`.** El resultado de Intl
  depende de los datos de idioma de cada navegador, y un monto tiene que verse igual en
  todas las tablets.
- **El helper del front no reusa el del backend.** Son workspaces separados, sin paquete
  compartido, y leen textos distintos: Postgres siempre manda `"12.50"`, mientras que una
  persona escribe `"12,5"`. Montar un paquete común por cuatro funciones sería más
  infraestructura que código.
- **Los textos del mostrador los elegí yo**, y van a cambiar con el uso:
  - "Listo para retirar" en vez de "Listo";
  - "Pago al retirar" en vez de "Pago final";
  - "Trae la boleta" y "No trae la boleta" en vez de "Con boleta" y "Sin boleta".

  Cambiarlos es editar una línea de `dominio.ts`.
- **Modal hecho con `<div role="dialog">` y no con `<dialog>`.** El `showModal()` nativo no
  está bien soportado en jsdom, así que los tests no podrían comprobar el comportamiento que
  importa.
- **Foco inicial en "Cancelar".** Un Enter apurado no puede anular una orden.

## Los tests

- **Helpers reusados:** ninguno. `renderEnRuta` (`src/test/render.tsx`) es para pantallas
  que necesitan Router, y estos componentes no tienen enlaces, así que alcanza con `render`
  de Testing Library.
- **Helpers creados:** tampoco. `promesaControlada` (`Boton.test.tsx`) es una promesa que el
  test resuelve cuando quiere, para congelar el botón a mitad de su acción. Por ahora la usa
  solo ese archivo. Si una pantalla de cobro necesita lo mismo, ese es el momento de moverla
  a `src/test/`.
- **Tablas con `it.each`:** en `money.test.ts` y `dominio.test.ts`, una fila por caso. Cada
  fila fallida sale con su propio nombre.
- **`sinDatos.test.ts` se amplía solo:** recorre la carpeta, así que un componente nuevo
  queda vigilado sin tocar el test.

## Si mañana tenés que tocar esto

- **Para usar un componente,** empezá por `frontend/src/components/README.md`, que lista lo
  que hay.
- **Si agregás un valor a un ENUM,** cambialo en el schema y en `dominio.ts` a la vez. El
  test te va a recordar el que falte, y el compilador el texto que no pusiste.
- **Si decidís el símbolo de moneda,** no lo metas en `formatearMonto`: rompería los tests
  del formato y mezclaría presentación con cálculo. Mejor un `formatearPrecio` en la pantalla
  o en `lib/`, que llame a `formatearMonto`.
