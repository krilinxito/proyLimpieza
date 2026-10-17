---
id: SPEC-KRILINXI-015
spec: specs/SPEC-KRILINXI-015-estadisticas-panel.md
explica:
  - comprobar una respuesta externa contra su contrato
  - el evento online del navegador
  - un valor por defecto que esconde datos
---

# SPEC-KRILINXI-015 — Panel de estadísticas: ingresos, saldos y ropa sin recoger

## Qué se construyó

El admin entra a **Estadísticas** y ve tres cosas: cuánto se cobró hoy (por sucursal y por
forma de pago), cuánto falta cobrar y qué ropa sigue sin recoger. Las dos últimas vienen
agrupadas por antigüedad: hasta 7 días, de 8 a 30, más de 30. Puede elegir una sucursal y
unas fechas.

Sin internet, la pantalla dice "Las estadísticas necesitan conexión" y no muestra ningún
número. Cuando vuelve la conexión, carga sola.

Es la **primera pantalla del front que lee de la API en vez de la base local**, y deja el
patrón que van a copiar volumen y productividad (016), personal y sucursales (017) y la
auditoría (018).

## Cómo funciona, paso a paso

El admin abre `/estadisticas` el 16/10/2026 a las 10:05 de Bolivia.

1. **La ruta.** `pages/rutas.tsx` monta `PantallaEstadisticas` solo para `ADMIN`. El hueco
   `EnConstruccion` ya no lo usa nadie.
2. **El filtro inicial.** La pantalla arranca con `FILTRO_INICIAL`: sin fechas y sin sucursal
   (`components/PantallaEstadisticas.tsx`), y se lo pasa a `usePanel(filtro)` (`:19`).
3. **Qué se pide.** `usePanel` (`hooks/usePanel.ts:31`) calcula "hoy" con `hoyEnBolivia`
   (`periodo.ts:37`). Usa la hora corregida de la tablet (→ SPEC-KRILINXI-012) y la zona
   `America/La_Paz`, así que da `2026-10-16` aunque en UTC ya sea otra hora. Con eso arma
   dos juegos de parámetros:
   - `parametrosIngresos` (`periodo.ts:49`) → `{ desde: '2026-10-16', hasta: '2026-10-16' }`.
   - `parametrosPendientes` (`:54`) → `{ desde: '2000-01-01', hasta: '2026-10-16' }`. El
     `'2000-01-01'` es `DESDE_SIEMPRE` (`:22`); el porqué está en Fundamentos.
4. **Las tres a la vez.** `Promise.all` (`usePanel.ts:42`) llama a `pedirIngresos`,
   `pedirSaldos` y `pedirSinRecoger`. Las tres pasan por `pedir`
   (`api/estadisticasApi.ts:115`), que hace `api.get('/estadisticas/…', { params })`. El
   token lo pone `lib/api`, y el backend vuelve a comprobar que es ADMIN.
5. **La respuesta se comprueba antes de usarla.** `leerIngresos` (`estadisticasApi.ts:49`) y
   sus hermanas revisan la forma del contrato de SPEC-ALE186-008 campo por campo: cada monto
   tiene que ser texto con dos decimales (`esMonto`, `:34`), cada tramo uno de los tres
   conocidos. Si algo no encaja, `pedir` lanza `RespuestaRara` (`:118`) y el panel muestra un
   mensaje en vez de números a medias.
6. **Un solo estado.** Si llegan las tres, el estado pasa a `listo`. Si una falla, `mensajeDe`
   (`usePanel.ts:16`) lo traduce: `ErrorSinConexion` pasa a `sin-conexion`, y `ErrorApi` o
   `RespuestaRara` pasan a `error` con su mensaje. Si el admin cambió el filtro mientras
   tanto, `vigente &&` (`:43-44`) descarta la respuesta vieja.
7. **Se muestra, no se suma.** Cada sección formatea con `bs()` (`components/montos.ts:4`):
   "125.50" pasa a "Bs 125,50". Ningún total se calcula en el navegador (CLAUDE.md §8).
8. **Sin internet.** La pantalla muestra el aviso (`PantallaEstadisticas.tsx:27`). El hook
   escucha el evento `online` del navegador (`usePanel.ts:51`) y, cuando llega, vuelve a
   pedir todo.

## Dónde encaja en la arquitectura

| Pieza | Qué hace | Qué no le toca |
|---|---|---|
| `periodo.ts` | Puro: qué fechas pedir y cómo decirlas | Pedir nada |
| `api/estadisticasApi.ts` | Pedir a la API y comprobar la forma | Tocar la base local |
| `api/sucursalesLocal.ts` | Leer el catálogo de sucursales de la tablet | Leer métricas |
| `hooks/usePanel.ts`, `useSucursales.ts` | La puerta de la pantalla a cada fuente | Formatear |
| `components/` | Mostrar | Importar de `api/`, sumar montos |

Es la excepción que CLAUDE.md §8 declara: **las métricas son lo único del sistema que se lee
de la API**. Todo lo demás, incluso el catálogo de sucursales que usa este mismo filtro, se
lee de SQLite. Las dos fuentes viven en archivos separados para que la regla se pueda
comprobar sola:

- `test/arquitectura.test.ts` (`LEEN_LA_BASE_LOCAL`, `:122`) falla si cualquier otro archivo
  de la feature toca la base local.
- Se probó rompiéndola a propósito: una línea con `useBaseLocal` en `usePanel.ts` hizo fallar
  el test.

¿Qué se rompe si se salta la regla? Si una métrica saliera de la tablet, sin internet el panel
mostraría lo poco que haya bajado como si fuera el total, sin avisar. CLAUDE.md lo dice así:
"un cero falso en un panel de ingresos es peor que una pantalla honesta".

## Fundamentos

### Comprobar una respuesta externa contra su contrato

En TypeScript, `api.get<Ingresos>(…)` **no comprueba nada**: el `<Ingresos>` es una promesa
que el código se hace a sí mismo, y desaparece al compilar. Lo que llega por la red es lo que
el servidor haya mandado: un campo renombrado en una versión nueva, un número donde se
esperaba texto, un HTML de error de un proxy. Si se le cree al tipo, el error aparece lejos
de su causa: un `undefined` en medio de la pantalla, o un `NaN` en un total de caja.

Por eso las respuestas entran como `unknown` y se **estrechan** a mano
(`api/estadisticasApi.ts:49` en adelante). Los type guards ya los explicó SPEC-KRILINXI-002;
lo nuevo acá es el lugar donde se aplican: **en la frontera**, una sola vez, apenas llega el
dato. Después de `leerIngresos`, el resto del código trabaja con un `Ingresos` de verdad.

Dos detalles de este repo:

- **`lista` (`:38`) es todo o nada.** Si una sola fila de una lista no tiene la forma, la
  respuesta entera se rechaza. Mostrar 9 de 10 deudas sin avisar es peor que no mostrar
  ninguna y decirlo.
- **`esMonto` exige el formato exacto `"125.50"`**, sin signo. El contrato dice "texto con dos
  decimales", y `desdeDecimal`, que se usa para mostrar, no acepta otra cosa. Validar en la
  entrada evita que la pantalla reviente al formatear.

### Un valor por defecto que esconde datos

La spec decía "por defecto, el día de hoy". Al leer el contrato del backend apareció un
problema: `/saldos` y `/sin-recoger` filtran por **`fecha_entrada` dentro del período**. Con
"hoy", la ropa que lleva 40 días sin recoger no aparece, y el tramo "más de 30 días" queda
siempre en 0, justo cuando ese número es el que más importa. El panel diría "todo bien" en el
peor caso.

Un valor por defecto no es neutro: es lo que ve el 90 % de las veces quien no toca nada. Cuando
la misma palabra ("el período") significa cosas distintas en dos secciones, aplicarla igual a
las dos es un error.

La decisión, tomada con la dueña de la spec antes de escribir código:
- Los **ingresos** arrancan en hoy, que es la caja del día.
- **Lo pendiente** arranca en todo: `DESDE_SIEMPRE` (`periodo.ts:22`).

Hace falta una fecha explícita porque el backend, sin `desde`, toma los últimos 30 días, y eso
escondería lo mismo con otro número. El criterio de la spec se corrigió para que diga lo que
hace el código.

### El evento `online` del navegador

El navegador avisa cuando cambia la conexión con dos eventos de `window`: `online` y
`offline`. Escuchar `online` (`usePanel.ts:51`) alcanza para "cuando vuelva internet, cargar
solo": no hace falta preguntar cada tantos segundos ni depender de PowerSync, que mide otra
cosa (si su servicio está conectado).

Hay que saber su límite: `online` significa "hay red", no "el servidor contesta". Puede llegar
con un wifi que no sale a internet. Por eso no se da nada por bueno: se vuelve a pedir, y si
falla se muestra el aviso otra vez. Para lo que el evento no detecta, está el botón "Probar de
nuevo".

En el test se dispara a mano: `window.dispatchEvent(new Event('online'))`.

**Ya explicado antes:**

- **Type guard** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Descartar una respuesta que llega tarde** → SPEC-KRILINXI-010 (`specs/notas/SPEC-KRILINXI-010-renovar-sesion.md`): el `vigente &&` de `usePanel`.
- **Zona horaria del negocio** → SPEC-ALE186-008 (`specs/notas/SPEC-ALE186-008-estadisticas-cobros.md`)
- **Desfase de reloj** → SPEC-KRILINXI-012 (`specs/notas/SPEC-KRILINXI-012-reloj-tablet.md`): "hoy" sale de `ahoraOficialMs()`.
- **Test de arquitectura** → SPEC-KRILINXI-002
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`): romper la regla a propósito para ver que el test falla.
- **Doble de prueba en el borde HTTP** → SPEC-KRILINXI-003

## Decisiones y por qué

- **Las tres métricas juntas (`Promise.all`)**, no una por sección. Si una falla, se ve un
  solo aviso claro, en vez de un panel con dos números y un hueco que el admin podría no
  notar.
- **La sucursal se aplica al elegirla; las fechas, con un botón.** Con una sola petición por
  cambio, escribir una fecha a mano no dispara cuatro pedidos a medio escribir.
- **Solo sucursales abiertas en el filtro.** Una cerrada no tiene caja diaria que mirar. Si el
  admin necesita mirar una cerrada, es una línea en `listarSucursales`.
- **`EnConstruccion` queda sin uso**, pero se deja: es el patrón de "hueco" del registro de
  rutas y lo pueden usar pantallas futuras.

## Los tests

- **Helper nuevo: `test/estadisticasDePrueba.ts`.**
  - `ingresosDePrueba()`, `saldosDePrueba()` y `sinRecogerDePrueba()` arman respuestas
    **válidas** del contrato, y cada test cambia solo lo que le importa.
  - `simularEstadisticas()` contesta cada ruta con la suya, o `'sin-conexion'` para todas.
  - La 016 le suma `volumenDePrueba` y su ruta, y sus tests quedan en tres líneas.
- **`test/apiFalsa.ts` ampliado:** cada pedido anota sus `parametros` (la query string). Es
  opcional y solo aparece cuando hay query, porque el test del login compara pedidos enteros
  y no tenía por qué enterarse.
- **Reusados:**
  - `tabletConRelojCorrido(0)` (SPEC-KRILINXI-012) congela "hoy" en el 16/10.
  - `baseLocalDePrueba` y `sembrar` cargan las sucursales.
  - `renderEnRuta` con `sesionDePrueba({ rol: 'ADMIN' })`.
  - `sinJerga()`. La palabra "orden" está prohibida en pantalla, así que todo dice "boleta".
- **"Sin conexión → vuelve" se prueba cambiando de servidor falso a mitad del test:** primero
  `simularEstadisticas('sin-conexion')`, después `simularEstadisticas()` y el evento `online`.

## Si mañana tenés que tocar esto

- **Una métrica nueva (016):** su `leer…` en `estadisticasApi.ts`, su tipo en `types.ts`, su
  respuesta de prueba en `estadisticasDePrueba.ts`, y sumarla al `Promise.all` de `usePanel`.
- **Cuidado con el período por defecto:** si la métrica nueva filtra por fecha de algo que
  sigue pendiente, hacete la misma pregunta que se hizo aquí.
- **Una pantalla online del admin (017, 018)** copia esto: la API en `api/`, `ErrorSinConexion`
  traducido a un aviso en palabras, y el evento `online` para volver a cargar.
