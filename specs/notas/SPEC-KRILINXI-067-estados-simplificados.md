---
id: SPEC-KRILINXI-067
spec: specs\SPEC-KRILINXI-067-estados-simplificados.md
explica:
  - dependientes de una columna al cambiar su tipo (vistas y default)
  - normalizar al leer los datos viejos de un dispositivo
---

# SPEC-KRILINXI-067 — Estados de la boleta simplificados

## Qué se construyó

Una boleta ya no pasa por "en proceso" ni "lista": la ropa está **recibida** hasta que sale, y sale **entregada**. Quedan
cuatro estados: recibido, entregado, reembolsado (todavía sin forma de ponerlo) y anulado. En el mostrador desaparecieron
"Empezar a lavar" y "Marcar como lista"; el Inicio y el tablero dicen "Ropa por entregar".

## Cómo funciona, paso a paso

Seguimos una boleta que una tablet dejó guardada como `LISTO` antes de que existiera esta spec.

1. **La base cambia de tipo.** `006_estados_simplificados.sql:17` pasa toda boleta `EN_PROCESO` o `LISTO` a `RECIBIDO`
   (sigue en el local, sin entregar). Después recrea el tipo: `:26` crea `estado_orden` con cuatro valores y `:29` vuelve
   a apuntar la columna con `USING estado::text::estado_orden`. Para poder hacerlo, antes suelta las dos vistas que leen
   la columna (`:19`, `:20`) y el `DEFAULT` (`:22`), y al final los repone (`:31`, `:35`, `:55`).
2. **El servidor deja de aceptar los viejos.** `backend/src/utils/dominio.ts:16` ya no lista `EN_PROCESO` ni `LISTO`, así
   que `esEstadoOrden` los rechaza y el controller responde 400 (`ordenes.controller.ts:233`). La tabla de qué cambio se
   permite (`dominio.ts:74`) queda mínima: desde `RECIBIDO` solo se llega a `ANULADO`.
3. **Lo que dependía de la lista se acomoda solo.** "Qué ropa está abierta" (`sucursales.model.ts:69`) y "desde qué
   estados se entrega" (`entregas.model.ts:72`) no están escritos como una lista fija: son "todos menos los cerrados".
   Al agregar `REEMBOLSADO` a los cerrados (`dominio.ts:63`) y quitar los dos viejos de `ESTADOS_ORDEN`, las dos reglas
   cambian sin tocar su código. Una sucursal solo se cierra sin ropa en `RECIBIDO`.
4. **La tablet todavía tiene `LISTO` guardado.** Hasta que sincronice, su SQLite local conserva el valor viejo. La lectura
   de la ropa (`ropaLocal.ts:104`) ya no pregunta "¿es un estado válido?" sino `estadoDeLaBase` (`estado.ts:45`), que
   traduce `EN_PROCESO` y `LISTO` a `RECIBIDO`. Sin eso, `aOrden` habría devuelto `null` y la boleta habría desaparecido
   de la pantalla.
5. **La pantalla ofrece menos.** `DetalleOrden.tsx` ya no calcula `avancesDesde`: la fila "Qué hacer con esta ropa" tiene
   Cobrar y, de principal, Entregar la ropa (`accionesExtra` recibe `principal: true`). Anular sigue aparte, al final.
6. **El Inicio.** `hoyEnLaSucursal` (`hoyLocal.ts:68`) arma `porEntregar` con toda la ropa abierta (antes, solo las
   `LISTO`); `atrasadas` (`:70`) es un subconjunto. La tarjeta se llama "Ropa por entregar".
7. **La historia no se reescribe.** La tabla `auditoria` guarda `valores_anteriores` como JSON, y las filas viejas dicen
   `"estado": "LISTO"`. `describir.ts:98` los sigue diciendo en palabras ("Listo para retirar") en vez de mostrar el código.

## Dónde encaja en la arquitectura

- **Migración, no edición de la línea base** (CLAUDE.md §11, SPEC-ALE186-019): `context/lavanderia_schema.sql` se queda
  diciendo cinco estados; el estado real es "línea base más migraciones", y por eso `dominio.test.ts` lee las dos.
- **El servidor es la garantía; la tablet, cortesía** (§6). Los estados viven en dos listas (`backend/src/utils/dominio.ts`
  y `frontend/src/lib/dominio.ts`) y la tabla de transiciones en dos más. Un test compara cada par con el archivo del otro
  lado (`estado.test.ts` lee el del backend), así que olvidarse de uno falla en la suite y no en la tablet de alguien.
- **Qué no le toca a esta spec:** escribir `REEMBOLSADO`. Está declarado y pintado, pero lo pone la entrega sin cobrar (spec
  `reembolso-entrega`), igual que `ENTREGADO` lo pone el registro de la entrega y no un PATCH (§6, "lo autoritativo del
  servidor").

## Fundamentos

Quitar un valor de un ENUM de Postgres ya está explicado en
[SPEC-KRILINXI-055](SPEC-KRILINXI-055-quitar-transferencia.md); acá se usó el mismo camino (renombrar el tipo, crear uno
nuevo, apuntar la columna, borrar el viejo). Lo que aparece por primera vez es **qué más cuelga de la columna** y **qué
hacer con los datos de una tablet que quedó atrás**:

**Una columna tiene dependientes que Postgres defiende.** Cambiar el tipo de `ordenes.estado` no es solo `ALTER COLUMN`:
si una vista lee esa columna, Postgres se niega ("cannot alter type of a column used by a view"), y si la columna tiene un
`DEFAULT` expresado en el tipo viejo, también. La salida es soltar lo que depende, cambiar el tipo y volver a crearlo
idéntico. Se hace en la misma migración, que corre en una transacción (SPEC-ALE186-019): o queda todo, o nada. En este repo
esas dependencias son `vw_saldos` y `vw_pendientes_recoger` (`context/lavanderia_schema.sql`, secciones 9 y 10) y el
`DEFAULT 'RECIBIDO'`. Para saber si hay otras, la pregunta es `SELECT … FROM pg_depend` o, más simple, intentarlo en una
base descartable: el test lo hace (`estadosSimplificados.db.test.ts`).

**Normalizar al leer, no al escribir, cuando el dato viejo vive en un dispositivo.** La migración arregla Postgres, pero
una tablet sin conexión guarda su propio SQLite con el valor viejo, y no hay migración que llegue hasta ahí hasta que
sincronice. Se puede esperar a que baje el dato nuevo, o hacer que el código **entienda los dos**. Acá se eligió lo
segundo (`estadoDeLaBase`): un único lugar traduce el valor viejo al nuevo en el momento de leerlo, y no se reescribe nada en
la base local (eso encolaría un PATCH en `uploadData` por cada fila). Cuando todas las tablets hayan sincronizado, esa
función se puede simplificar a `esEstadoOrden`.

## Decisiones y por qué

- **Se borraron `AVANCES` y `avancesDesde`** en vez de dejar una lista vacía. Una lista vacía habría conservado el código
  de "el próximo avance" y el ícono de lavar sin uso. Si algún día vuelven los pasos intermedios, se vuelve a escribir.
- **`ANULADO` se queda.** El cliente dijo "solo recibido, entregado y reembolsado", pero anular una boleta mal escrita
  sigue haciendo falta (se dejó dicho en la spec).
- **POST `/api/ordenes` no cambia.** El criterio hablaba de rechazar con 400 los estados viejos "en POST y PATCH", pero el
  POST nunca leyó `estado` (toda orden nace `RECIBIDO`, `ordenes.controller.ts`, "ignora un estado que venga en el
  cuerpo"). Seguir ignorándolo es más seguro que empezar a validar un campo que nadie manda. El rechazo con 400 vale
  para el PATCH y para el filtro `?estado=` del historial.
- **"Reembolsado", no "Reembolsada".** La spec decía "Reembolsada" de ejemplo; los otros estados se dicen en masculino
  ("Recibido", "Entregado", "Anulado"), así que se unificó. Si el cliente prefiere el femenino, es una línea en
  `TEXTO_ESTADO_ORDEN`.
- **`porEntregar` incluye a las atrasadas.** Antes eran dos conjuntos distintos (lista, y recibida atrasada). Sin el paso
  intermedio, "atrasada" pasó a ser una vista destacada de "por entregar". Se prefirió eso a esconder las atrasadas de la
  primera lista, que habría cambiado el total.

## Los tests

- **Creado:** `backend/tests/db/estadosSimplificados.db.test.ts`. Usa `baseDescartable` (de SPEC-ALE186-019, la misma que
  `quitarTransferencia.db.test.ts`): una base nueva con la línea base y sin migrar, sembrada con una boleta en cada estado
  viejo, y recién entonces `migrar`. Es la única forma de ver el "antes". Comprueba el tipo, que no se pierde ninguna fila,
  que las dos vistas devuelven lo mismo (sin la columna `estado`), el `DEFAULT`, y que un segundo `migrar` no hace nada.
  La próxima migración que recree un tipo puede copiar su estructura.
- **Reusado:** `tests/helpers/baseReal.ts` (`escenario`, `crearOrden`) en los tests de `tests/db/`; solo cambió que `crearOrden`
  nace `RECIBIDO` por defecto, porque `LISTO` ya no existe. `ordenDePrueba` y `sembrar` en el frontend.
- **Ajustados:** casi todos los demás tests usaban `LISTO` o `EN_PROCESO` como "una boleta abierta cualquiera". Se
  cambiaron a `RECIBIDO`, salvo donde el valor viejo **es** el caso (la tablet sin sincronizar), que se dejó a propósito
  en `ropaLocal.test.ts`, `PantallaMostrador.test.tsx` y `hoyLocal.test.ts`.
- **Una trampa de la suite del frontend:** una corrida completa con la máquina ocupada dio 9 fallos, todos "Test timed out in
  5000ms" o "Hook timed out"; repetidos solos pasaron. Es la advertencia de CLAUDE.md §4 (la suite usa la mitad de los
  núcleos): si falla por tiempo, mirar qué más corría antes de buscar un error en el código.

## Si mañana tenés que tocar esto

- Para agregar un estado: `backend/src/utils/dominio.ts` (lista, cerrados, orígenes), `frontend/src/lib/dominio.ts` (lista y
  texto), `features/ordenes/estado.ts` (orígenes y tono) y una migración que recree `estado_orden` **con las dos vistas**.
  Los tests de dominio y `estado.test.ts` fallan si falta alguno.
- `REEMBOLSADO` es el primer estado con un tono rojo que no es "anulado": cuando exista la acción, `DetalleOrden.tsx` ya
  tiene su aviso ("Esta ropa fue reembolsada…") y `historialApi.ts` ya acepta el valor.
- Cuidado con el tamaño del cambio: tocó unos 55 archivos (la mayoría, tests) porque `LISTO` aparecía en muchos tests. Para la próxima, buscar con
  `grep -rn "'LISTO'"` antes de empezar da la lista completa.
