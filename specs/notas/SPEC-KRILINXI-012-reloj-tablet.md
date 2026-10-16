---
id: SPEC-KRILINXI-012
spec: specs/SPEC-KRILINXI-012-reloj-tablet.md
explica:
  - desfase de reloj
  - estimar la hora del servidor con la mitad del viaje
  - falsear solo el reloj en un test (toFake date)
---

# SPEC-KRILINXI-012 — Corregir el reloj de la tablet con la hora del servidor

## Qué se construyó

La hora que queda en una boleta, en un cobro o en una entrega la pone la tablet. Si su reloj
está mal, el registro queda mal: una orden que el servidor rechaza por venir "del futuro", o un
cobro de las 23:55 que el reporte cuenta al día siguiente. Ahora la tablet aprende cuánto se
desvía su reloj cada vez que entra o renueva la sesión, y lo corrige al registrar, también sin
internet.

## Cómo funciona, paso a paso

Caso: el reloj de la tablet de Elena va 10 minutos adelantado.

1. **Medir.** Elena entra. `features/auth/api/login.ts:14` hace el pedido dentro de
   `conHoraDelServidor` (`frontend/src/lib/reloj.ts:56`), que anota la hora de la tablet
   antes de enviar y al recibir. La respuesta trae `ahora`, la hora del servidor
   (SPEC-ALE186-015).
2. **Calcular.** `registrarHoraDelServidor` (`reloj.ts:40`) parsea `ahora` (`reloj.ts:42`).
   Si no es una fecha válida, no toca nada. Si lo es, compara contra la mitad del viaje
   (`reloj.ts:44`): el desfase es de −10 minutos.
3. **Guardar.** El desfase va a `localStorage` con la clave `lavanderia.desfaseReloj`
   (`reloj.ts:17`), aparte de la sesión (`lavanderia.sesion`,
   `features/auth/api/almacen.ts:14`). Cuando Elena sale, `borrarSesion` borra solo la suya: el
   desfase se queda, porque es de la tablet.
4. **Aplicar.** Horas después, sin internet, Elena registra ropa. `registrarRopa` pide la hora
   a `horaOficial()` (`features/ordenes/api/ordenesLocal.ts:108`), que suma el desfase guardado
   al reloj de la tablet (`reloj.ts:72-80`) y la devuelve en ISO 8601 UTC. Esa hora va a
   `fecha_entrada` y, si hay adelanto, a `fecha_pago`. Lo mismo pasa al cobrar
   (`features/ordenes/api/ropaLocal.ts:193`) y al entregar
   (`features/entregas/api/entregasLocal.ts:127`).
5. **Recalibrar.** Cada renovación (`features/auth/api/renovar.ts`, SPEC-KRILINXI-010) trae
   otro `ahora` y vuelve a medir. Si alguien movió el reloj entre medio, se corrige ahí.

**De paso, el token.** El renovador de SPEC-KRILINXI-010 compara el `exp` del token de
PowerSync, que está en la hora del servidor, contra "ahora". Antes, ese "ahora" era el reloj
de la tablet: una tablet atrasada creía vigente un token ya vencido y PowerSync lo rechazaba en
bucle. Ahora `SesionProvider` le pasa `ahoraOficialMs` (`features/auth/SesionProvider.tsx:82`).

## Dónde encaja en la arquitectura

- **`lib/reloj.ts`** es infraestructura transversal, como `lib/money`: no sabe nada de
  órdenes ni de pagos, solo de la hora. Va en `lib/` porque lo usan tres features, y CLAUDE.md
  §6 pide que lo que se calcula en el cliente esté "en un único lugar".
- **Las features no leen el reloj.** Piden `horaOficial()`. El test de
  `frontend/src/test/arquitectura.test.ts:93` lo vigila: falla si un archivo de `features/`
  llama a `new Date()` sin argumentos o a `Date.now()`. Si una feature necesita "ahora" para
  algo que no se guarda, lo recibe como argumento, como hace el renovador.
- **`features/auth/api/`** es quien habla con login y renovar, así que es quien entrega `ahora`
  a `lib/reloj`. Cronometrar el pedido es cosa de `lib/reloj` (`conHoraDelServidor`), para que
  `login.ts` no tenga que leer el reloj.
- **Lo que no hace:** no corrige la hora que se **muestra** en pantalla (eso sale de las
  fechas ya guardadas), ni la de `para_corregir` en `lib/powersync/conector.ts`, que es solo
  local y no viaja al servidor.

## Fundamentos

### Desfase de reloj

Cada aparato tiene su propio reloj, y ninguno es perfecto: se atrasan, se adelantan, se
reinician en una fecha vieja si la batería se agota, o alguien los mueve a mano. Cuando la
hora de un registro importa (un reporte por día, un rechazo por "fecha futura"), no se puede
confiar en el reloj de cada tablet. Tampoco se le puede preguntar al servidor en cada registro:
sin internet no hay servidor.

La solución es guardar **la diferencia**, no la hora. "El servidor va 10 minutos por detrás
de mí" sigue siendo cierto una hora después, sin preguntar de nuevo. Por eso `horaOficial()`
suma el desfase al reloj de ahora en vez de guardar una hora fija (lo prueba «sigue corrigiendo
con el paso del tiempo» en `lib/reloj.test.ts`). Lo que no corrige es un reloj que **cambia**
entre dos mediciones: eso lo arregla la siguiente renovación, y mientras tanto el servidor
sigue rechazando una fecha más de 5 minutos en el futuro (SPEC-ALE186-014).

### Estimar la hora del servidor con la mitad del viaje

El servidor lee su reloj en algún momento entre que el pedido sale de la tablet y que vuelve
la respuesta. Si la tablet compara contra el momento en que **llega** la respuesta, el error
puede ser el viaje entero; en un wifi lento, varios segundos. Comparar contra el **punto
medio** (`(enviado + recibido) / 2`, `reloj.ts:44`) deja el error en medio viaje como mucho, y
casi siempre menos, porque la ida y la vuelta suelen tardar parecido. Es la misma idea que usa
NTP, el protocolo con el que las computadoras ponen su hora en internet, en su versión más
simple.

### Falsear solo el reloj en un test

Para probar "con el reloj 10 minutos adelantado", el test tiene que controlar la hora de la
tablet. Vitest puede reemplazar `Date` por uno falso con `vi.useFakeTimers()`, pero por
defecto también falsea `setTimeout`, y entonces las promesas de SQLite y los `waitFor` de
Testing Library se quedan esperando para siempre. `toFake: ['Date']`
(`frontend/src/test/reloj.ts:22`) falsea **solo** la hora: el reloj queda congelado donde el
test diga y todo lo demás sigue andando. El helper `tabletConRelojCorrido` lo deja listo y lo
restaura al terminar el test.

**Ya explicado antes:**

- **No confiar en el reloj de quien manda el dato** → SPEC-ALE186-014 (`specs/notas/SPEC-ALE186-014-ordenes-sucursal-cerrada.md`)
- **Cambio aditivo en una API con clientes desplegados** (por qué `ahora` llegó antes que su uso) → SPEC-ALE186-015 (`specs/notas/SPEC-ALE186-015-hora-del-servidor.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)

## Decisiones y por qué

- **El desfase vive en `localStorage`, con su propia clave.** Podría ir dentro de la sesión,
  pero entonces salir lo borraría, y el siguiente que entra arrancaría sin corrección hasta su
  login. Es una propiedad de la tablet.
- **Un `ahora` inválido no borra el desfase de antes.** Una corrección de hace unas horas es
  mejor que ninguna, y mucho mejor que una inventada a partir de basura.
- **El test de arquitectura prohíbe leer el reloj en toda `features/`**, no solo en las
  escrituras. Distinguir "esta fecha se guarda" de "esta no" con una expresión regular no es
  posible; prohibir todo y pasar "ahora" como argumento donde haga falta sí lo es.
- **Se corrigió también el vencimiento del token**, que no figuraba en los criterios. Lo había
  dejado anotado la bitácora de SPEC-KRILINXI-010, y `features/auth/**` está en el scope de
  esta spec. Sin eso, una tablet atrasada dejaba de bajar datos sin aviso.

## Los tests

- **Creado:** `test/reloj.ts`, con `tabletConRelojCorrido(adelantoMs)` y `HORA_DEL_SERVIDOR_ISO`.
  Lo usan los tests de `lib/reloj`, de auth y de las tres escrituras. La próxima spec que
  escriba una fecha hace:

  ```ts
  tabletConRelojCorrido(10 * 60_000);          // la tablet va 10 min adelantada
  await registrarAlgo(...);
  expect(fila.fecha_algo).toBe(HORA_DEL_SERVIDOR_ISO);
  ```

- **Reusados:** `baseLocalDePrueba` (SQLite real), `simularApi(() => 'sin-conexion')` para
  probar que la corrección vale sin internet, los helpers de cada archivo (`datosRopa`,
  `sucursalConRopa`, `preparar`, `datosEntrega`), `controlFalso` y `jwtDePrueba` para el
  token, y `archivosFuente` para el test de arquitectura.
- **Pruebas de mutación:** volver a poner `new Date()` en la entrega hace fallar su test y
  también el de arquitectura. Quitar `ahora: ahoraOficialMs` del renovador hace fallar el test
  del token.

## Si mañana tenés que tocar esto

- **Una escritura nueva con fecha** usa `horaOficial()`. Si escribís `new Date()`, el test de
  arquitectura te avisa.
- **Si el backend cambia `ahora`** (nombre o formato), la tablet se queda con el último desfase
  medido y deja de recalibrarse, sin decir nada. Está anotado en CLAUDE.md §13.
- **Para ver el desfase de una tablet:** en DevTools → Application → Local Storage, la clave
  `lavanderia.desfaseReloj`, en milisegundos (negativo: la tablet va adelantada).
