---
id: SPEC-KRILINXI-010
spec: specs/SPEC-KRILINXI-010-renovar-sesion.md
explica:
  - descartar una respuesta que llega tarde
  - leer un jwt sin verificar su firma
  - renovar antes de que venza (margen)
  - una sola peticion en curso compartida
---

# SPEC-KRILINXI-010 — Renovar la sesión sin pedir la contraseña

## Qué se construyó

La tablet ya no deja de bajar datos a las 12 horas de entrar. Cuando el permiso para bajar
datos está por vencer, la app pide uno nuevo sola, sin molestar a quien atiende. Solo vuelve
a pedir usuario y contraseña si el servidor dice que la cuenta ya no vale. Además, el aviso
de "Salir" ahora dice cuántos registros sin guardar se perderían.

## Cómo funciona, paso a paso

Caso: Elena entró a las 8:00. A las 19:59 se corta el wifi un momento, vuelve, y PowerSync
reconecta. Su `tokenPowerSync` vence a las 20:00.

1. **PowerSync pide credenciales.** Al reconectar llama a `fetchCredentials`
   (`frontend/src/lib/powersync/conector.ts:102`), que espera la función que le pasaron
   (`conector.ts:106`). El conector no sabe nada de sesiones ni de renovar: solo pregunta
   "¿con qué token me presento?".
2. **¿Quién responde?** Esa función la puso `SesionProvider` al conectar la base
   (`frontend/src/features/auth/SesionProvider.tsx:105`): es `tokenPowerSyncVigente`, creada
   una sola vez en `SesionProvider.tsx:74` con dos piezas de la sesión: cómo leerla
   (`actual.current`) y cómo guardarla (`cambiarSesion`).
3. **¿Vale todavía el token?** `frontend/src/features/auth/renovacion.ts:54` lee cuándo vence
   con `venceEn` (`frontend/src/features/auth/token.ts:11`). Faltan menos de 2 minutos
   (`MARGEN_MS`, `renovacion.ts:20`), así que no lo devuelve: un token que vence mientras
   viaja no le sirve a nadie.
4. **Una sola renovación.** `renovacion.ts:59` arranca `renovarUnaVez` y la deja en `enCurso`.
   Si PowerSync vuelve a preguntar en ese mismo instante, recibe la misma promesa.
5. **El pedido.** `frontend/src/features/auth/api/renovar.ts` hace `POST /auth/renovar`. El
   token de la API (el de 3 días, no el de PowerSync) lo pone el interceptor de `lib/api`,
   como en cualquier otra petición. El backend comprueba que Elena siga activa y devuelve un
   par nuevo y su usuario releído.
6. **Guardar.** `renovacion.ts:41` comprueba que la sesión siga siendo la misma que al
   empezar, y `renovacion.ts:42` llama a `guardarSesion`, que es `cambiarSesion(nueva)`
   (`SesionProvider.tsx:43`): actualiza `localStorage`, la ref y el estado de React. La
   base local **no** se reabre, porque el efecto que la abre depende de `hayAlguien`
   (`SesionProvider.tsx:89`), y sigue siendo `true`.
7. **PowerSync recibe el token nuevo** y se conecta. Nadie vio nada.

Si en el paso 5 no hay internet, axios lanza `ErrorSinConexion`, `renovarUnaVez` lo deja
pasar (`renovacion.ts:46`) y `fetchCredentials` lanza. PowerSync interpreta "error temporal" y
vuelve a preguntar más tarde. La sesión y la base no se tocan.

Si responde 401, el interceptor de `lib/api` ya avisó del rechazo (`lib/api.ts:101`), y eso
cierra la sesión como `'rechazada'`, que no borra la base si hay cola sin subir
(SPEC-KRILINXI-007). `renovacion.ts:45` devuelve `null`, que para PowerSync quiere decir "no hay
nadie adentro". `RutaProtegida` manda a `/ingresar`.

## Dónde encaja en la arquitectura

- **`lib/powersync/`** es infraestructura: habla con el SDK y no sabe qué es una sesión. Por
  eso `conectar` recibe una función (`control.ts:48`) en vez de importar nada de
  `features/auth`. Si `lib/` importara de `features/`, la dependencia iría al revés de lo que
  pide CLAUDE.md §5, y el conector no se podría testear sin montar la sesión entera.
- **`features/auth/renovacion.ts`** es la regla de negocio ("renovar con 2 minutos de margen,
  una vez, y qué hacer en cada falla"). Es TypeScript puro, sin React: recibe sus
  dependencias como argumentos. Así se prueba en milisegundos con la hora fija.
- **`features/auth/api/renovar.ts`** es el único que sabe la URL de `/renovar`, igual que
  `login.ts` para la de `/login`. Ningún componente llama a axios (CLAUDE.md §5).
- **`SesionProvider`** sigue siendo el único dueño de la sesión: el renovador no guarda nada
  por su cuenta, le pide a `cambiarSesion` que lo haga. Si guardara directo en
  `localStorage`, la ref y el estado de React quedarían con el token viejo.
- **`BarraSesion`** saca el número de pendientes de `useConexion`, el mismo hook del aviso de
  conexión. No repite la consulta a la base.

## Fundamentos

### Leer un JWT sin verificar su firma

Un JWT (explicado en SPEC-ALE186-002) tiene el contenido en base64url, legible por
cualquiera. Lo que protege es la firma, y para comprobarla hace falta el secreto, que la
tablet no tiene ni debe tener. ¿Entonces se puede confiar en el `exp` que lee la tablet? Para
lo que lo usa, sí: no decide si alguien tiene permiso (eso lo hace el servidor con la firma),
solo decide si **vale la pena presentarse** o conviene renovar antes. Si alguien manipulara
el `exp`, lo peor que pasa es una renovación de más o un rechazo de PowerSync, que es el mismo
resultado que sin el cambio. `token.ts:16` hace la conversión base64url → base64 que necesita
`atob`.

La regla general: **leer un dato del token en el cliente sirve para decidir comodidades,
nunca para decidir permisos**.

### Renovar antes de que venza (margen)

Si el token se renueva cuando "ya venció", hay una ventana en la que se manda uno que vence
en el camino: el servidor lo recibe muerto y lo rechaza. Con un margen (`MARGEN_MS`), se
renueva un poco antes. Además cubre una diferencia chica entre el reloj de la tablet y el del
servidor. Si el margen es demasiado grande se renueva de más; 2 minutos sobre 12 horas no
cuesta nada.

### Una sola petición en curso, compartida

PowerSync puede pedir credenciales varias veces casi a la vez (un reintento, una reconexión).
Si cada pedido disparara su propio `/renovar`, saldrían varias peticiones, volverían varios
pares distintos y quedaría guardado el último que llegara, no necesariamente el más nuevo. La
solución es guardar **la promesa** de la renovación en curso (`renovacion.ts:35`): el primero
la crea, los demás reciben la misma, y `finally` la limpia al terminar
(`renovacion.ts:59-61`) para que la siguiente vez se vuelva a decidir. `??=` ("asignar solo si
está vacío") es lo que lo hace en una línea. El test "varios pedidos simultáneos" falla si se
cambia por `=` (se comprobó con una prueba de mutación, ver SPEC-KRILINXI-003).

### Descartar una respuesta que llega tarde

Una petición puede tardar segundos, y mientras tanto el mundo cambia: Elena toca "Salir". Si
al llegar la respuesta se guardara sin mirar, la sesión **resucitaría** después de que ella
salió. Por eso `renovacion.ts:41` compara la sesión de ahora con la de cuando empezó (por
identidad, `!==`) y, si cambió, descarta la respuesta. Es el mismo problema que resuelve la
bandera `vigente` en el efecto que abre la base (`SesionProvider.tsx`), con otra forma.

**Ya explicado antes:**

- **JSON Web Token (jwt)** y **base64url** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Token corto para usar y largo para renovar** → SPEC-ALE186-025 (`specs/notas/SPEC-ALE186-025-token-powersync-corto.md`)
- **Interceptores de axios**, **inversión de dependencia**, **leer estado de React desde fuera (useRef)**, **prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)
- **Fallas pasajeras y permanentes (reintentar o apartar)** → SPEC-KRILINXI-007 (`specs/notas/SPEC-KRILINXI-007-cola-subida.md`)

## Decisiones y por qué

- **Lanzar ante sin conexión o 5xx, `null` ante 401.** Es el contrato del SDK
  (`PowerSyncBackendConnector.d.ts`: "Return null if the user is not signed in. Throw an error
  if credentials cannot be fetched due to a network error"). Devolver el token vencido en vez
  de lanzar haría que PowerSync se presente con algo que va a ser rechazado.
- **Un `exp` ilegible cuenta como vencido.** La alternativa era devolverlo igual. Renovar de
  más cuesta una petición; presentarse con basura cuesta dejar de bajar datos sin aviso.
- **El 401 reusa el camino que ya existía.** El interceptor de `lib/api` ya cierra la sesión
  ante un 401 con token. Repetir esa lógica en el renovador dejaría dos lugares que podrían
  dejar de coincidir.
- **El aviso de salida avisa, no impide.** La spec pide decirlo. Impedir salir con cola
  pendiente dejaría una tablet "secuestrada" si el servidor rechaza algo para siempre; si
  hace falta, va en otra spec.

## Los tests

- **Reusados:** `simularApi` (servidor falso en el adapter de axios, SPEC-KRILINXI-003), para
  que el pedido a `/renovar` pase por los interceptores de verdad y el test vea la cabecera
  con el token de la API; `controlFalso` y `renderEnRuta` para los de la app montada;
  `sinJerga` para el aviso de salida.
- **Ampliado:** `test/sesion.ts` ganó `jwtDePrueba(vence, marca)` y la constante
  `TOKEN_POWERSYNC_DE_PRUEBA` (vence en 2100). `sesionDePrueba()` la usa, así que ninguna
  pantalla dispara una renovación sin querer. La próxima spec que necesite un token por vencer
  hace `{ ...sesionDePrueba(), tokenPowerSync: jwtDePrueba(Date.now() - 60_000) }`.
- **La hora inyectada.** `crearRenovador` acepta `ahora`, así `renovacion.test.ts` fija la
  hora y no depende del reloj de la máquina (un test que depende del reloj falla a las 23:59).
- **Dos niveles.** `renovacion.test.ts` prueba la regla suelta (cuándo, cuántas veces, cada
  falla). `SesionProvider.test.tsx` prueba qué le pasa a la app (lo que queda en
  `localStorage`, que la base no se reabre, que un 401 lleva a `/ingresar`).

## Si mañana tenés que tocar esto

Empezá por `renovacion.ts`: es corto y concentra toda la regla. Cuidado con dos cosas:

- **El reloj de la tablet.** `venceEn` compara contra `Date.now()`. Si el reloj de la tablet
  atrasa más de 2 minutos, va a creer que un token vencido sigue vivo, PowerSync lo va a
  presentar y el servicio lo va a rechazar, una y otra vez. SPEC-KRILINXI-012 (reloj de la
  tablet) debería pasarle a `crearRenovador` un `ahora` corregido con el desfase.
- **Lo guardado incluye `ahora`.** La respuesta de `/renovar` se guarda entera, como la del
  login. Si algún día se lee `ahora` de la sesión, va a ser la hora del último login o
  renovación, no la actual.
