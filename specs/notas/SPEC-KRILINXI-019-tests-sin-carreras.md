---
id: SPEC-KRILINXI-019
spec: specs/SPEC-KRILINXI-019-tests-sin-carreras.md
explica:
  - competir por la CPU no es lo mismo que ser lento (maxWorkers)
  - modo lento al azar para destapar carreras
  - un test intermitente es una pregunta y no ruido
---

# SPEC-KRILINXI-019 — Una suite del frontend sin carreras

## Qué se construyó

La suite del frontend fallaba de vez en cuando sin que el código estuviera mal, o eso parecía.
Medido de verdad, **fallaba la mitad de las corridas completas**, cada vez en un test distinto.
Esta spec encontró tres causas distintas debajo del mismo síntoma:

1. **Un error real de la app**, que un empleado podía ver: buscar una boleta mientras la lista
   del local todavía se leía mostraba "No se encontró" con la boleta en la base.
2. **Demasiados procesos de tests a la vez**, compitiendo por la CPU: la primera lectura de la
   base local pasaba el segundo que espera `findBy…`.
3. **Una carrera en un test:** un `getBy…` que miraba el aviso de conexión antes de que se
   calculara.

Se arreglaron las tres. Además quedó una herramienta, el **modo lento**, para encontrar
carreras sin esperar a que aparezcan solas.

## Cómo funciona, paso a paso

### El diagnóstico

1. **Medir antes de suponer.** El síntoma anotado en §13 era "un test de entregas falla 2 de
   cada 10". Se corrió la suite completa 8 veces seguidas, guardando la salida entera de cada
   una: **4 de 8 fallaron, en 4 tests distintos** de tres features. El problema era más grande
   y más general que el anotado.
2. **Leer el error, no el nombre del test.** Los cuatro eran `findBy…` que se rindieron al
   segundo. En tres, la pantalla tenía "Buscando…" o le faltaba el aviso de conexión: la espera
   era la correcta, pero se quedó corta. En el cuarto, la búsqueda de "001234" decía "No se
   encontró": **un resultado equivocado no se arregla esperando más.**
3. **Cargar la CPU a propósito no lo reproducía:** con todos los núcleos ocupados, el test de
   entregas aislado pasó 15 de 15. La causa no era "la máquina está lenta", sino "la suite
   entera corre a la vez".

### El error de la app

`PantallaRopa` pide la lista del local al abrirse. Si el empleado busca antes de que esa lista
llegue, quedan dos lecturas en vuelo. La de la lista llegaba **última** y pisaba la búsqueda: la
pantalla decía "Resultados para 001234" y mostraba la lista general, sin esa boleta porque ya
estaba entregada.

- **El test que lo reproduce siempre**
  (`features/ordenes/components/PantallaRopa.test.tsx:162`) envuelve la base para que la lista
  tarde 300 ms y la búsqueda no. Así la respuesta vieja llega última en todas las corridas, no
  una de cada tantas. **Falló antes del arreglo**: es la prueba de que prueba lo que dice.
- **El arreglo** (`PantallaRopa.tsx:32-33`): el efecto marca su lectura como `vigente` y la
  descarta si, mientras tanto, cambió lo que se pidió. Es el mismo guardia que ya tenían
  `useParaCorregir`, `usePedidoOnline` y los hooks de la 017; a esta pantalla le faltaba.

### La competencia por la CPU

Con el error arreglado quedaban fallos, todos del mismo tipo: una espera correcta que pasaba el
segundo mientras la base local todavía leía. Hubo dos experimentos, de 8 corridas completas cada
uno:

| Experimento | Fallos | Tiempo |
|---|---|---|
| Sin los intentos de conexión a PowerSync de cada test | 2 de 8 | igual |
| **La mitad de los procesos** (8 en vez de 15) | **0 de 8** | 35 s contra 33 s |

La suite tarda casi lo mismo con la mitad de procesos: los que sobraban solo competían por la
CPU. Quedó como `maxWorkers: '50%'` (`frontend/vite.config.ts:78`), un porcentaje y no un
número fijo, porque cada máquina del equipo tiene distintos núcleos.

### La comprobación

Con los tres arreglos puestos:

| Prueba | Resultado |
|---|---|
| El test de entregas, aislado | 30 de 30 |
| La suite completa del frontend, 30 veces seguidas | **30 de 30**, 685 tests cada una |
| El modo lento a 200 ms, 6 veces | 6 de 6 |

Antes, la misma suite completa fallaba 4 de cada 8 corridas. La primera vez que se lanzaron las
30, la vuelta 2 falló: así apareció la carrera del aviso. Se frenó la prueba, se encontró la
carrera con el modo lento, se arregló, y recién después se corrieron las 30 sobre el código final.

## Dónde encaja en la arquitectura

Toca tres capas, y en cada una lo que corresponde:

- **La app (`PantallaRopa.tsx`):** el guardia de respuesta vieja es una regla del código, no
  del test. Si la pantalla puede recibir dos respuestas fuera de orden, tiene que saber cuál
  vale.
- **La configuración de los tests (`vite.config.ts`):** cuántos procesos corren a la vez es
  infraestructura. Sigue el camino que ya abrió la 011, que separó el test del build en su
  propio grupo por el mismo motivo.
- **Los helpers de test (`test/baseLocalDePrueba.ts`):** el modo lento vive en el único lugar
  por donde pasan todas las consultas de prueba, así cualquier test lo hereda sin tocarse.

## Fundamentos

### Un test intermitente es una pregunta, no ruido

La tentación con un test que falla "de vez en cuando" es reintentar hasta que pase, o subir su
tiempo de espera. Las dos cosas esconden la respuesta. Acá, un test intermitente escondía **un
error que un empleado podía ver** en el mostrador.

El método que funcionó:

1. **Repetir y guardar todo:** muchas corridas con la salida completa, no un solo intento.
2. **Agrupar por el error, no por el test:** cuatro nombres distintos eran dos causas, y una tercera apareció después.
3. **Separar "tarda" de "da otra cosa":** "Buscando…" en pantalla es tiempo; "No se encontró"
   con el dato en la base es lógica.
4. **Reproducir de forma determinista:** forzar el orden malo (la lista tarda 300 ms) hasta que
   falle siempre, y recién ahí arreglar.

### Competir por la CPU no es lo mismo que ser lento

Que un test pase aislado y falle en la suite no prueba que el código esté bien ni que esté mal:
prueba que **depende de cuánto trabajo hay alrededor**. Con 15 procesos en 16 núcleos, cada test
de pantalla abre su SQLite, monta React y lee, todo a la vez y repartiéndose la máquina.

**Más procesos no es más rápido cuando el cuello es la CPU.** Pasar de 15 a 8 dejó el tiempo
total casi igual y sacó los fallos. Subir el tiempo de espera también los habría sacado, pero a
un precio: un test que espera lo que no corresponde tardaría más en fallar, y uno lento de verdad
pasaría sin que nadie lo notara. Por eso la spec lo prohibía, salvo justificación.

### El modo lento, y por qué al azar

`LENTO_MS=200 npx vitest run` (`test/baseLocalDePrueba.ts`, `conLentitud`) demora cada consulta
de la base de prueba y cada aviso de `observarEstado`. La primera versión los demoraba **parejo**
(siempre 150 ms), y no encontró nada: pasaron los 685, incluido un test que acababa de fallar
en la suite. Una demora pareja no cambia **quién llega primero**, y una carrera es justamente
eso: dos cosas que llegan por caminos distintos (la lista y el aviso de conexión) y un test que
supone un orden.

La versión que quedó demora **al azar**, entre 0 y `LENTO_MS`. En cada corrida el orden cambia,
y un test que mira con `getBy…` algo que todavía no llegó falla en alguna de ellas. Dos
cuidados:

- **Los avisos se demoran en fila.** Llegan tarde, pero en el mismo orden en que salieron. Si se
  desordenaran, el test vería algo que la base de verdad nunca hace, y fallaría por un motivo
  falso.
- **Cuanto más alto el valor, más falsos positivos.** A 400 ms fallaron cuatro tests, y los cuatro
  eran esperas correctas (`waitFor`, `findBy…`) que encadenaban varias lecturas y pasaban el
  segundo. A 200 ms solo apareció la carrera real. Para distinguir una cosa de la otra se mira la
  traza: si pasa por `waitFor`, es tiempo; si no, el test miró antes de tiempo.

**Lo que encontró:** `PantallaParaCorregir.test.tsx` esperaba la lista de registros y enseguida
afirmaba, con `getByRole`, el enlace "1 registro no se pudo guardar" del aviso. El aviso lo
calcula **otro** suscriptor de la base, aparte de la lista. Que la lista ya estuviera no decía
nada del aviso, así que ahora se lo espera con `findByRole`. Era la carrera que se escondía
detrás de tres de los fallos "por tiempo" de ese archivo.

**Ya explicado antes:**

- **Esperar lo que se afirma** → SPEC-KRILINXI-018 (`specs/notas/SPEC-KRILINXI-018-auditoria-admin.md`)
- **Descartar una respuesta que llega tarde** → SPEC-KRILINXI-010 (`specs/notas/SPEC-KRILINXI-010-renovar-sesion.md`): el `vigente` de `PantallaRopa`.
- **Test intermitente (flaky) y cómo diagnosticarlo** → SPEC-ALE186-022 (`specs/notas/SPEC-ALE186-022-bcrypt-costo-tests.md`)
- **Un test que compila la app** → SPEC-KRILINXI-011: el antecedente de separar trabajo pesado de la suite.
- **Prueba de mutación** → SPEC-KRILINXI-003: el test nuevo falló antes del arreglo.

## Decisiones y por qué

- **Arreglar el código, no el test, en la búsqueda.** El test decía la verdad: la pantalla
  mostraba un resultado falso. Hacer esperar más al test habría dejado el error para el
  empleado. Esto amplió el scope a `PantallaRopa.tsx`, y se anotó en la spec.
- **`maxWorkers: '50%'` antes que subir `asyncUtilTimeout`.** Ver Fundamentos.
- **Los intentos de conexión a PowerSync en cada test se dejaron como están.** Sacarlos bajaba
  la carga, pero no resolvía los fallos, y la conexión es parte de lo que la App hace de verdad.

## Si mañana tenés que tocar esto

- **Un test falla de vez en cuando:** guardá la salida completa (`npx vitest run > salida.txt
  2>&1`), leé el error y corré varias veces `LENTO_MS=200 npx vitest run`. Si falla en modo
  lento y la traza no pasa por `waitFor`, es una carrera del test o de la app.
- **No subas los tiempos de espera** para que pase. Si de verdad hace falta, escribí por qué no
  era una carrera.
- **Una pantalla nueva que lea en un efecto:** ponele su `vigente`.
