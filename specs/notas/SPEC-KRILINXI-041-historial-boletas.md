---
id: SPEC-KRILINXI-041
spec: specs/SPEC-KRILINXI-041-historial-boletas.md
explica:
  - achicar en sql lo barato y decidir en javascript lo que es regla del negocio
  - un tipo comun para dos origenes de datos
  - una clave estable para no repetir un pedido
---

# SPEC-KRILINXI-041 — Historial de boletas

## Qué se construyó

Una pantalla, **Historial de boletas** (`/boletas`), para encontrar boletas pasadas: se busca
mientras se escribe (número, nombre o teléfono) y se filtra por cómo va la ropa, por fechas, por "con
saldo pendiente" y, el admin, por sucursal. **Cada uno ve lo que le corresponde**: quien atiende, su
sucursal de los últimos 30 días, también sin internet; el admin que no atiende, todo el historial de
todas las sucursales, que le pide a la API y por eso necesita conexión.

## Cómo funciona, paso a paso

Seguimos dos personas que abren `/boletas`.

**1. Las dos entran por la misma puerta.** `pages/rutas.tsx` (la ruta `/boletas`) monta
`PantallaHistorial` (`features/historial/components/PantallaHistorial.tsx:156`). Es para todos los roles
y **no** es una ruta `mostrador: true`: esas el menú las esconde si no hay sucursal de trabajo, y el admin
que no atiende tiene que poder entrar.

**2. Se decide de dónde salen los datos.** `useModoDelHistorial` (`hooks/useHistorial.ts:16`) pregunta
`useSucursalDeTrabajo()`: con sucursal, modo `'sucursal'`; sin ella, `'completo'`. La línea 167 de la
pantalla elige entre `DeLaSucursal` (`:70`) y `Completo` (`:99`). Son dos componentes y no un `if` adentro
de uno, porque cada uno usa hooks distintos y los hooks no pueden llamarse a veces sí y a veces no.

**3a. Elena (EMPLEADO) — base local.** `useHistorialDeLaSucursal` (`:53`) llama a `listarHistorialLocal`
(`api/historialLocal.ts:56`):

- El SQL parte de `SELECT_ORDENES` (el mismo del Mostrador, exportado desde `ordenes/api/ropaLocal.ts`) y le
  agrega solo lo barato: un margen de fechas (`:68`) y, si hay texto que alcance, la coincidencia con la
  boleta o con el cliente (`condicionCliente`, la regla del buscador de SPEC-KRILINXI-032).
- `armar` (también de `ropaLocal`) convierte las filas en órdenes con su estado efectivo, sus pagos y su saldo.
- Recién después, en JavaScript (`:86`), se aplica lo que depende de reglas del dominio: el día de Bolivia, el
  estado que se ve y el saldo. Se ordena por fecha (`:93`) y se pasa a `BoletaListada` (`types.ts`).
- El hook vuelve a leer cada vez que cambia el filtro y cada vez que cambia algo en la base
  (`observarEstado`, como `useHoy`), y descarta la lectura que llega tarde.

Cada fila es un enlace (`FilaDeBoleta.tsx`) a `enlaceABoleta(...)`: el Mostrador abre la ficha del cliente con
esa boleta abierta, donde sí se puede cobrar o entregar.

**3b. Ana (ADMIN que no atiende) — API.** `useHistorialCompleto` (`:83`) arma los parámetros con
`parametrosHistorial` (`filtro.ts`), que solo manda los que están puestos y **ni `desde` ni `hasta` si no se
eligieron fechas**: el backend entiende "sin `desde`" como "todo el historial" (SPEC-KRILINXI-040). Los pide
`pedirHistorial` (`api/historialApi.ts:84`) con `usePedidoOnline`; la respuesta pasa por `leerPagina` (`:70`),
que la compara con el contrato y la pasa a la misma `BoletaListada`. Sin internet, `Completo` dice "El
historial completo necesita conexión" y no dibuja ninguna lista.

Cada fila es un botón: abre `DetalleDeSoloLectura`, sin ninguna acción. Ana no tiene la ropa en su tablet
(CLAUDE.md §7), así que no hay con qué cobrar ni entregar. Para tocar una boleta, tiene que atender en esa sucursal.

## Dónde encaja en la arquitectura

Sigue la regla de §5: los **componentes** (`components/`) no tocan la base ni la API; piden todo a un
**hook** (`hooks/useHistorial.ts`), que llama a `api/`. Un test de arquitectura lo vigila y por eso ningún
componente de esta feature importa de `../api/`. El SQL vive en `api/historialLocal.ts`; la comprobación
del contrato, en `api/historialApi.ts`.

Respeta la regla de §6: **lecturas de SQLite local** (quien atiende, sin internet) con **una excepción
declarada** en §8, el admin, que pide online lo que no tiene sincronizado. No es una excepción nueva: es la
misma razón de las estadísticas y la auditoría.

Dos reglas que no se rompieron a propósito: el saldo se calcula en un solo lugar (`pagos/saldo.ts`, vía
`armar`) y la sucursal de trabajo sale de un solo lugar (`useSucursalDeTrabajo`).

## Fundamentos

**Un tipo común para dos orígenes.** La lista y el filtro tienen que funcionar igual aunque los datos
vengan de SQLite (centavos, `OrdenVista`) o de la API (texto `"30.25"`, JSON). En vez de que la lista
sepa de las dos, cada origen se convierte a una `BoletaListada` en su propio borde (`aBoleta` en
`historialLocal.ts`, `leerBoleta` en `historialApi.ts`) y de ahí para adelante hay un solo tipo. Sin esto, cada
componente tendría un `if (viene de la API)` y cada cambio habría que hacerlo dos veces.
`sucursalNombre` es `null` en el origen local, donde todas son de la misma sucursal: el tipo admite que un
origen no tenga un dato sin mentir.

**Achicar en SQL lo barato, decidir en JavaScript lo que es regla del negocio.** SQL es rápido para
descartar filas, pero algunas reglas viven en JavaScript y repetirlas en SQL las duplicaría: qué día de
Bolivia es un instante guardado en dos formatos (`lib/diaDelNegocio.ts`), cuál es el estado que se ve y cuánto
se debe. El SQL de `listarHistorialLocal` hace un prefiltro **grueso con margen** (`:68`): las fechas se guardan
empezando por el día en UTC y Bolivia va cuatro horas atrás, así que el día de Bolivia a lo sumo es el
anterior; se le suma un día al borde de arriba para no perder ninguna, y el día exacto se decide después.
Un prefiltro tiene que ser **más ancho** que el filtro real, nunca más angosto: si lo fuera, perdería filas
sin avisar.

**Una clave estable para no repetir un pedido.** `useHistorialCompleto` tiene que pedir de nuevo solo si
cambia algo que **viaja** a la API. Pero el filtro es un objeto que cambia de identidad con cada tecla, aunque
lo que se manda sea lo mismo (una sola letra no se manda, ver `textoParaBuscar`). Comparar objetos por
identidad pediría de más y volvería a la página 1 sin motivo. La solución (`useHistorial.ts:87`): se
serializan los parámetros que de verdad se mandan (`JSON.stringify`) y esa cadena es la clave: si la cadena
es igual, no cambió nada. Dos objetos distintos que dicen lo mismo dan la misma clave.

**Ya explicado antes:**

- **Paginación con limit/offset y total aparte** → SPEC-ALE186-012 (`specs/notas/SPEC-ALE186-012-auditoria-consulta.md`)
- **Comprobar una respuesta externa contra su contrato** → SPEC-KRILINXI-015 (`specs/notas/SPEC-KRILINXI-015-estadisticas-panel.md`)
- **Descartar una respuesta que llega tarde** → SPEC-KRILINXI-010 (`specs/notas/SPEC-KRILINXI-010-renovar-sesion.md`)
- **Reiniciar un estado cuando cambia otro, sin `useEffect`** → SPEC-KRILINXI-016 (`specs/notas/SPEC-KRILINXI-016-estadisticas-volumen.md`)
- **Esperar a que se deje de escribir (debounce)** → SPEC-KRILINXI-032 (`specs/notas/SPEC-KRILINXI-032-buscador-vivo.md`)
- **Listas de definiciones (`dl`/`dt`/`dd`)** → SPEC-KRILINXI-025 (`specs/notas/SPEC-KRILINXI-025-estilo-mostrador.md`)

## Decisiones y por qué

- **Fechas elegidas pueden pasar de los 30 días, también en la sucursal.** La spec dice "los últimos 30
  días" como lo que se ve al abrir. La base local tiene toda la ropa de la sucursal, así que si alguien pide
  una fecha de hace tres meses, se la damos. *Descartado:* limitar siempre a 30 días, que obligaría a pedirle
  al admin una historia que el empleado, con los datos en la mano, no puede ver.
- **El texto espera 400 ms antes de pedirse a la API; en la base local, no.** Local es instantáneo y cada
  tecla afina la lista a la vista. A la API, una tecla es un pedido de red: se espera la pausa.
- **Un texto de una sola letra no filtra** (ni acá ni en la API). Usa `alcanzaParaBuscar`: con menos, casi todo
  coincide y la lista parpadearía sin ayudar. Una sola regla, la del buscador de SPEC-KRILINXI-032.
- **"Con saldo" excluye las anuladas**, igual que el servidor (SPEC-KRILINXI-040) y que `/saldos`.
- **Las anuladas dicen "Anulada: no se cobra"** en vez de "Falta pagar": una anulada sin cobros tiene un
  saldo positivo en la cuenta, pero nadie lo debe, y mostrarlo como deuda confundiría.
- **Menú, después de Clientes.** Va junto a las demás búsquedas y no desplaza al Mostrador.
- **Local pagina en el hook, sobre lo ya leído** (20 por página); la API pagina ella. Misma barra
  (`Paginas`) y mismo tamaño, así que se ven igual.
- **Dos botones "Limpiar filtros" cuando no hay resultados:** el de la barra y el del aviso. El del aviso
  está donde se mira cuando la lista queda vacía; el de la barra, siempre a mano. Se aceptó la repetición.

## Los tests

- `filtro.test.ts` — las funciones puras: qué cuenta como filtro, qué parámetros viajan.
- `api/historialLocal.test.ts` — contra **SQLite de verdad** (`baseLocalDePrueba`): las ventanas de fechas y el
  borde de Bolivia (las dos formas de guardar la fecha), el buscador, el estado efectivo y el saldo.
- `api/historialApi.test.ts` — el contrato: una respuesta rota (o una sola boleta rota) se rechaza entera.
- `components/PantallaHistorial.test.tsx` — la `App` entera, de la pantalla al SQL o a la API falsa.

**Se reusó** todo el kit existente: `baseLocalDePrueba`/`sembrar`, `renderEnRuta`, `simularApi`,
`tabletConRelojCorrido`, `sinJerga`, `accionesPrincipales` y las factories de `filasDePrueba`. **Se creó**
`test/historialDePrueba.ts` (`boletaDePrueba`, `paginaDeBoletas`), el equivalente de `auditoriaDePrueba` para
`GET /api/ordenes`: una próxima spec que necesite esa respuesta la arma así:
`simularApi(() => ({ status: 200, data: paginaDeBoletas([boletaDePrueba({ estado: 'ENTREGADO' })]) }))`.

Los tests del menú (`rutas.test.ts`, `Marco.test.tsx`, `App.test.tsx`) cambiaron solo en la lista de
destinos: ahora incluyen "Historial de boletas".

## Si mañana tenés que tocar esto

Empezá por `PantallaHistorial.tsx` (la elección del modo) y seguí al hook. Con cuidado:

- Un filtro nuevo se agrega en **cuatro** lugares: `FiltroHistorial` y `parametrosHistorial` (`filtro.ts`), el
  filtrado en `historialLocal.ts` y el control en `FiltroDelHistorial.tsx`. Si falta uno de los dos
  orígenes, la pantalla se comporta distinto según quién la mire.
- La búsqueda del backend (`ILIKE`) distingue tildes y la local no (`plegar`): "Perez" encuentra "Pérez" en la
  tablet del empleado y no en el historial del admin. Es una diferencia conocida (SPEC-KRILINXI-040); si molesta,
  el arreglo es `unaccent` en Postgres, una migración aparte.
- `FiltroDelHistorial` repite el `Elegir` de `FiltroAuditoria` (opciones grandes con "Todas"). Si aparece una
  tercera pantalla con lo mismo, es hora de pasarlo a `components/`.
