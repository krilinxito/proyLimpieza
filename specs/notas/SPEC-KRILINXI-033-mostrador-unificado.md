---
id: SPEC-KRILINXI-033
spec: specs/SPEC-KRILINXI-033-mostrador-unificado.md
explica:
  - componer funcionalidades en vez de copiarlas
  - leer de nuevo antes de mostrar y no despues
  - redirigir una direccion vieja (Navigate replace)
---

# SPEC-KRILINXI-033 — Una sola pantalla de mostrador

## Qué se construyó

Ropa en el local, Cobrar y Entregar ropa eran tres tareas del menú, y quien atendía tenía que
elegir una antes de saber qué necesitaba el cliente. Ahora son una sola: el **Mostrador**. Se
busca al cliente (o la boleta), se elige, y en la **ficha del cliente** aparece su ropa de esta
sucursal; cada boleta se abre ahí mismo con lo que se puede hacer: avanzar, cobrar, entregar o
anular. Sin buscar nada, el Mostrador muestra la ropa en el local, como antes. Las direcciones
viejas (`/ropa`, `/cobrar`, `/entregar`) llevan al Mostrador.

## Cómo funciona, paso a paso

Rosa viene a buscar su ropa. Quien atiende escribe "rosa" en el Mostrador.

1. **Un buscador para todo.** `PantallaMostrador` monta el `BuscadorVivo` de SPEC-KRILINXI-032
   (`frontend/src/features/mostrador/components/PantallaMostrador.tsx:108`). Lo que busca es
   `useMostrador().buscar`, que llama a `buscarEnMostrador`.
2. **Dos búsquedas, una lista.** `buscarEnMostrador`
   (`frontend/src/features/mostrador/api/mostradorLocal.ts`) corre a la vez la de clientes y la de
   ropa, y de la ropa se queda solo con las boletas que coinciden **por su número** (`:30`). Con
   "rosa", ninguna boleta coincide por número: la lista trae a Rosa (cliente). Con "001234", la
   boleta exacta va primero (`:31`), después los clientes y después las otras boletas (`:34`).
3. **Elegir lleva a la ficha.** `elegir` (`PantallaMostrador.tsx:100`) cambia la vista a
   `{ tipo: 'ficha', clienteId, abierta: null }`. Si se eligió una boleta, la ficha es la de su
   cliente, con esa boleta abierta (`abrirBoleta`, `:96`). Por eso `OrdenVista` ahora trae
   `clienteId`.
4. **La ficha lee al cliente y su ropa** (`FichaCliente.tsx:34`): `obtenerCliente` y
   `ropaDelCliente` (`frontend/src/features/ordenes/api/ropaLocal.ts:147`), toda su ropa de esta
   sucursal, la que sigue en el local primero.
5. **Tocar una boleta la abre en la ficha.** Es el `DetalleOrden` de siempre (`FichaCliente.tsx:66`),
   con las mismas reglas de SPEC-KRILINXI-008 (solo los avances que permite su estado, anular con
   confirmación, cobrar sin pasarse del saldo) y "Entregar la ropa" (`AccionEntregar`, `:72`), con
   las de SPEC-KRILINXI-009.
6. **Rosa paga y retira.** Al entregar, la ficha muestra el resumen de la entrega (`:51`) y,
   **al mismo tiempo**, vuelve a leer la ropa del cliente (`:78`). Cuando se toca "Entregar otra
   ropa", la lista ya dice Entregado. Al cobrar, el detalle dice "Cobro guardado." y el saldo nuevo,
   sin salir de la boleta.
7. **Una dirección vieja.** Alguien abre `/cobrar` desde un acceso directo: el registro de rutas la
   tiene como `haciaElMostrador` (`frontend/src/pages/rutas.tsx:71`), un `<Navigate replace>` a
   `/mostrador`.

## Dónde encaja en la arquitectura

- **`features/mostrador/`** es una feature nueva que **compone** otras, sin duplicarlas. Su `api/`
  junta las búsquedas de clientes y de ropa; sus componentes usan `DetalleOrden` (ordenes),
  `AccionEntregar` y `ResumenEntrega` (entregas) y `TarjetaCliente` (clientes). Las reglas siguen
  donde estaban: si mañana cambia qué avances permite un estado, cambia en `ordenes/estado.ts` y el
  Mostrador lo toma solo.
- **`useMostrador` solo lee.** Las acciones sobre una boleta (avanzar, cobrar, entregar, anular)
  no pasan por él: las sigue haciendo el detalle con sus propios hooks (`useRopa`, `useEntregar`).
  Si el Mostrador las reimplementara, habría dos caminos para cobrar y uno se quedaría atrás.
- **La sucursal** es la de trabajo (`useSucursalDeTrabajo`, SPEC-KRILINXI-029): el ADMIN que
  atiende también usa el Mostrador.
- **`pages/rutas.tsx`** sigue siendo el único registro de rutas. Una dirección vieja es una entrada
  más, que redirige, y no una regla aparte en `App.tsx`.

## Fundamentos

### Componer funcionalidades en vez de copiarlas

El riesgo de "juntar tres pantallas en una" es terminar con una cuarta copia de cada cosa. El
Mostrador evita eso porque lo que ya existía era reusable:

- el detalle de una boleta aceptaba acciones de afuera (`accionesExtra`, SPEC-KRILINXI-009), así que
  "Entregar la ropa" se le agrega desde la ficha sin tocarlo;
- las búsquedas de 032 devuelven `{ resultados, hayMas }`, así que combinarlas es juntar dos listas.

Lo único que hubo que agregar a lo existente: `clienteId` en la orden (para ir de la boleta a su
cliente), un texto configurable en el botón de volver, y el aviso "Cobro guardado." en el detalle.

### Redirigir una dirección vieja

Cuando una pantalla desaparece, su dirección no desaparece con ella: hay accesos directos en la
tablet, el historial del navegador, y el ingreso recuerda "a dónde ibas" (SPEC-KRILINXI-003). Si
`/cobrar` diera "esa página no existe", alguien que tenía la app abierta en Cobrar se encontraría con
un error al recargar. `<Navigate to="/mostrador" replace />` lo lleva a donde está ahora eso.
`replace` reemplaza la entrada del historial en vez de agregar una: así "atrás" no vuelve a
`/cobrar` para rebotar otra vez al Mostrador.

### Leer de nuevo antes de mostrar, no después

La primera versión volvía a leer la ropa del cliente **al volver** a la ficha. Funcionaba, pero
durante unos milisegundos la lista mostraba la boleta como estaba antes (Listo), y la suite completa
lo atrapó una vez: el test vio "Listo" donde esperaba "Entregado". El arreglo fue leer **en el
momento de entregar**, mientras se muestra el resumen (`FichaCliente.tsx:78`). La regla general:
si después de una acción la pantalla va a mostrar algo que esa acción cambió, conviene empezar a
leerlo apenas termina la acción, no cuando la persona vuelve a mirarlo.

**Ya explicado antes:**

- **Unión discriminada** (la `Vista` y el `Encontrado` del Mostrador) → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Hook como puerta a los datos** → SPEC-KRILINXI-005 (`specs/notas/SPEC-KRILINXI-005-clientes-mostrador.md`)
- **Esperar lo que se afirma (findBy, waitFor)** → SPEC-KRILINXI-018 (`specs/notas/SPEC-KRILINXI-018-auditoria-admin.md`)
- **Modo lento al azar** → SPEC-KRILINXI-019 (`specs/notas/SPEC-KRILINXI-019-tests-sin-carreras.md`)

## Decisiones y por qué

- **El buscador no lista las boletas que coinciden solo por su cliente.** Buscar "rosa" mostraría a
  Rosa y, al lado, cada una de sus boletas. Están en su ficha, a un toque.
- **Mostrador va primero en el menú**, antes que Registrar ropa: es la tarea de casi todo el día.
  Registrar ropa se suma al Mostrador en SPEC-KRILINXI-034.
- **`PantallaRopa` y `PantallaEntregar` se borraron**, y sus tests se movieron (`git mv`) y se
  reescribieron contra `/mostrador`, conservando la etiqueta de su spec original (008, 009, 019,
  025) junto a la 033. Así `grep SPEC-KRILINXI-009` sigue llevando al test de entregar.
- **Fuera del scope declarado**: el enlace de "Registros para corregir" ("Ir a Ropa en el local")
  pasó a "Ir al Mostrador", junto con dos textos que lo nombraban, y se actualizaron los tests de
  otras specs que miraban el menú viejo (App, Marco, rutas, ingreso, atención, para corregir).

## Los tests

- **Reusados**: `elegirEnBuscador` de SPEC-KRILINXI-032 (el Mostrador lo usa en casi todos los
  tests: `await elegirEnBuscador('000004', /Boleta 000004/)`), `baseLocalDePrueba` + `sembrar`, las
  fábricas de `filasDePrueba`, `simularApi`, `sinJerga`.
- **Movidos y reescritos**: los recorridos de Ropa en el local, Cobrar y Entregar. Cubren lo mismo
  que antes, ahora entrando por el buscador o por la ropa en el local, y suman lo nuevo: la ficha,
  ir de la boleta a su cliente, "Cobro guardado.", la lista actualizada después de entregar, las
  direcciones viejas.
- **El test de la carrera de SPEC-KRILINXI-019** se mantuvo con el mismo espíritu: la lista del local
  llega tarde a propósito, y la boleta elegida no se pierde.
- **Un test de rutas** vigila que `/ropa`, `/cobrar` y `/entregar` no vuelvan a ser pantallas
  propias del menú.
- Diez corridas en modo lento sin fallos, después del arreglo de "leer antes de mostrar".

## Si mañana tenés que tocar esto

- ¿Qué encuentra el buscador del Mostrador? `features/mostrador/api/mostradorLocal.ts`. ¿Qué es
  coincidir con un cliente? Sigue siendo `features/clientes/api/busqueda.ts`.
- ¿Una acción nueva sobre una boleta? Va en `DetalleOrden` (si es de la orden) o como
  `accionesExtra` desde la ficha (si es de otra feature, como entregar).
- Registrar ropa todavía es una pantalla aparte: SPEC-KRILINXI-034 la trae al Mostrador, y el
  Inicio "Hoy en la sucursal" (SPEC-KRILINXI-035) abre boletas en él.
