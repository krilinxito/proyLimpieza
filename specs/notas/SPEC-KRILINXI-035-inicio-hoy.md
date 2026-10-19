---
id: SPEC-KRILINXI-035
spec: specs/SPEC-KRILINXI-035-inicio-hoy.md
explica:
  - fijar la zona horaria de los tests
  - leer una fecha guardada sin zona (dos formatos en la base local)
---

# SPEC-KRILINXI-035 — Un Inicio que dice qué hay que hacer hoy

## Qué se construyó

El Inicio dejó de repetir el menú. Para quien atiende es **"Hoy en la sucursal"**:
- la ropa lista esperando que la recojan;
- la ropa atrasada;
- lo cobrado hoy, en total y por forma de pago;
- un aviso si hay registros para corregir.

Cada boleta lleva directo a ella en el Mostrador. Todo sale de la tablet, también sin internet. El
ADMIN que no atiende ve "Atender en una sucursal" y los cuatro números del tablero de estadísticas.

## Cómo funciona, paso a paso

Son las 21:00 en La Paz y Rosa acaba de pagar Bs 20 en efectivo. Ese pago llegó a la tablet desde
el servidor. Sigamos cómo termina en "Cobrado hoy".

1. **El Inicio elige qué mostrar** (`frontend/src/pages/Inicio.tsx:25`): con sucursal de trabajo,
   `HoyEnLaSucursal`; si es un ADMIN sin sucursal, "Atender en una sucursal" y `ResumenDelInicio`.
2. **El hook pide lo de hoy y lo vuelve a pedir cada vez que cambia algo en la base**
   (`frontend/src/features/mostrador/hooks/useHoy.ts:27`). "Hoy" es `hoyEnBolivia()` (`:23`): el
   día de La Paz con la hora corregida de la tablet.
3. **La consulta** (`frontend/src/features/mostrador/api/hoyLocal.ts:64`) junta la ropa en el local
   (`listarAbiertas`, la de siempre) con los cobros.
   - **Lista para recoger** son las que están en LISTO (`:67`).
   - **Atrasada** son las RECIBIDO o EN_PROCESO con la fecha estimada antes de hoy (`:33`).
4. **El cobro de Rosa en la base.** Bajó del servidor como `fecha_pago = '2026-10-19 01:00:00'`:
   una columna `TIMESTAMP` de Postgres, en UTC y **sin zona**.
   - El SQL trae los pagos con `fecha_pago >= hoy` (`:46`). Es una comparación de texto, gruesa,
     solo para no leer meses enteros.
   - El día de cada pago se decide después (`:54`): `instanteGuardado` lo entiende como UTC
     (`frontend/src/lib/diaDelNegocio.ts:36`) y `diaEnBolivia` dice que es del 18. Es de hoy.
5. **La suma** va en centavos (`sumar` de `lib/money`), por forma de pago, en el orden de siempre.
6. **Tocar una boleta** de cualquier lista lleva a `/mostrador?cliente=…&boleta=…`
   (`enlaceABoleta`, `PantallaMostrador.tsx:33`). El Mostrador lee esa dirección al abrirse
   (`vistaInicial`, `:40`) y muestra la ficha de su cliente con esa boleta abierta.

## Dónde encaja en la arquitectura

- **`lib/diaDelNegocio.ts`** es nuevo, pero no es nuevo de verdad: `hoyEnBolivia` vivía en
  `features/estadisticas/periodo.ts` y ahora lo necesitaba también el Mostrador. Pasó a `lib/`, y
  `periodo.ts` lo reexporta, así ninguna importación de estadísticas cambió.
- **`features/mostrador/api/hoyLocal.ts`** reusa `listarAbiertas`, y con ella la regla de qué está
  cerrado (`estado.ts`). Una boleta entregada en la tablet que todavía no subió no figura como
  "lista para recoger".
- **Lo del ADMIN es online** (CLAUDE.md §8): `ResumenDelInicio` usa el mismo `usePanel` e
  `Indicadores` que la pantalla de Estadísticas. No se copió ninguna cuenta.
- **Lo que no le toca al Inicio**: sumar montos a mano o leer el reloj. Los montos los suma
  `lib/money`, y el día lo da `lib/diaDelNegocio`. La regla de arquitectura de SPEC-KRILINXI-012
  sigue prohibiendo `new Date()` sin argumentos en `features/`.

## Fundamentos

### Leer una fecha que viene sin zona

Una fecha escrita sin zona ("2026-10-18 22:00:00") no dice en qué hora del mundo está. El servidor
la guarda en UTC (CLAUDE.md §8). Pero JavaScript, cuando le falta la zona, supone la **hora local
de la tablet**: en La Paz, `new Date('2026-10-18 22:00:00')` da las 22:00 de La Paz, es decir las
02:00 del 19 en UTC. Queda corrida cuatro horas, sin ningún error.

A la base local llegan dos formatos:
- **lo escrito en la tablet**, con zona: `2026-10-18T22:00:00.000Z`, porque sale de `horaOficial()`;
- **lo que bajó del servidor**, sin zona: `2026-10-18 22:00:00`.

Una misma columna puede tener los dos: un pago recién cobrado está con zona hasta que se sincroniza,
y después el servidor lo devuelve sin zona.

`instanteGuardado` (`lib/diaDelNegocio.ts:36`) unifica los dos formatos: pone la `T` y, si no hay
zona, agrega `Z` (UTC). Recién ahí se pregunta qué día es en Bolivia. Sin esto, un cobro de las
21:00 o de las 23:00 caería en el día equivocado, según la tablet y según si ya había sincronizado.

### Fijar la zona horaria de los tests

Ese error solo se ve si la máquina **no** está en UTC: en una máquina en UTC, leer "sin zona" como
local y como UTC da lo mismo, y el test pasaría aunque el arreglo no estuviera. Por eso los tests
corren con `TZ: 'America/La_Paz'` (`frontend/vite.config.ts:82`), la zona de las tablets: el test
falla igual en cualquier máquina. Se comprobó corriendo con `TZ=UTC` desde afuera y el arreglo
deshecho: la configuración se impone y el test lo atrapa.

**Ya explicado antes:**

- **Timestamp sin zona horaria** (del lado de Postgres) → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **La zona horaria del negocio** → SPEC-ALE186-008 (`specs/notas/SPEC-ALE186-008-estadisticas-cobros.md`)
- **Dinero en centavos enteros** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Falsear solo el reloj en un test** → SPEC-KRILINXI-012 (`specs/notas/SPEC-KRILINXI-012-reloj-tablet.md`)
- **El estado de la pantalla en la dirección** → SPEC-KRILINXI-034 (`specs/notas/SPEC-KRILINXI-034-mostrador-registrar.md`)
- **Hook como puerta a los datos** → SPEC-KRILINXI-005 (`specs/notas/SPEC-KRILINXI-005-clientes-mostrador.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)

## Decisiones y por qué

- **Atrasada no incluye la LISTO**: si está lista, ya no está atrasada. Está esperando, y para eso
  está la otra lista.
- **Una lista vacía lo dice en palabras** ("No hay ropa atrasada."). Una tarjeta en blanco no deja
  saber si no hay nada o si todavía no cargó.
- **Registros para corregir aparece también en el Inicio**, aunque el aviso grande del marco ya lo
  dice (SPEC-KRILINXI-031): el Inicio es "lo que pide atención hoy", y eso pide atención.
- **El Inicio del ADMIN pide los números a la API**, con el aviso "necesitan conexión" de siempre.
  No se calculan en la tablet: el admin no tiene la ropa de las sucursales (CLAUDE.md §7).
- **Fuera del scope declarado**:
  - `features/estadisticas/periodo.ts` pasó a reexportar el día del negocio;
  - se sumó `ResumenDelInicio` en estadísticas;
  - se fijó la zona horaria en `vite.config.ts`;
  - los tests de otras specs que navegaban con las tarjetas del Inicio pasaron a usar el menú.

## Los tests

- **Contra SQLite real** (`hoyLocal.test.ts`):
  - las dos listas y su orden;
  - lo cobrado con fechas en los dos formatos y un cobro de las 21:00, que en UTC ya es mañana;
  - lo de ayer y lo de otra sucursal, que no cuentan;
  - 20,10 + 0,20 da exactamente 20,30.
- **`lib/diaDelNegocio.test.ts`**: el día de Bolivia y los formatos de fecha.
- **`pages/Inicio.test.tsx`**, reescrito: el recorrido entero con `tabletConRelojCorrido(0)`, que deja
  "hoy" fijo en el 16/10/2026. También ir de una boleta al Mostrador, las listas vacías, los
  registros para corregir (con `controlFalso({ estado })` de SPEC-KRILINXI-031) y el ADMIN con y sin
  internet (`simularEstadisticas`).
- Diez corridas en modo lento sin fallos.

## Si mañana tenés que tocar esto

- ¿Una lista más en el Inicio (por ejemplo, "Recibida hoy")? Va en `hoyLocal.ts`, con su test contra
  SQLite, y en `HoyEnLaSucursal`.
- ¿Una fecha guardada que hay que comparar por día? Usá `instanteGuardado` y `diaEnBolivia`, nunca
  `new Date(texto)`. `diaDe` de `ordenes/components/fechas.ts` todavía usa `new Date(instante)` y la
  hora de la tablet: con una fecha bajada del servidor puede mostrar el día anterior o el siguiente.
  Queda para una spec aparte.
