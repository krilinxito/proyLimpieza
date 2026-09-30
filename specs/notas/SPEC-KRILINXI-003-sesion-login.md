---
id: SPEC-KRILINXI-003
spec: specs/SPEC-KRILINXI-003-sesion-login.md
explica:
  - contexto de React (provider)
  - doble de prueba en el borde HTTP (adapter de axios)
  - interceptores de axios
  - inversion de dependencia
  - leer estado de React desde fuera (useRef)
  - prueba de mutacion
  - redirigir recordando a donde se iba
---

# SPEC-KRILINXI-003 — Ingresar al sistema y guardar la sesión

## Qué se construyó

La tablet ya sabe quién la está usando.

- **Ingresar:** se entra con usuario y contraseña. La sesión queda guardada en el
  dispositivo y sobrevive a recargar la página o cerrar el navegador, aunque no haya internet.
- **Pantallas protegidas:** sin sesión, ninguna pantalla del negocio se abre.
- **Menú por rol:** un empleado no ve Estadísticas; el administrador ve todo.
- **Quién atiende:** arriba de cada pantalla está el nombre de esa persona y un botón
  "Salir", que pide confirmación.

Por debajo quedó el **cliente único de la API** (`lib/api.ts`). Todas las features van a hablar
con el servidor a través de él.

## Cómo funciona, paso a paso

### Recorrido 1: Rosa abre /cobrar sin haber entrado, se loguea y llega a Cobrar

1. `main.tsx` monta `BrowserRouter` → `SesionProvider` → `App`.
   `SesionProvider` (`features/auth/SesionProvider.tsx:16`) arranca leyendo el
   dispositivo con `leerSesion` (`features/auth/api/almacen.ts:18`). No hay nada guardado,
   así que `sesion` es `null`.
2. `App` monta cada ruta con `elementoDe` (`App.tsx:10`). `/cobrar` no es pública
   (`App.tsx:11`), así que queda detrás de `RutaProtegida`.
3. `RutaProtegida` ve que no hay sesión y redirige a `/ingresar`
   (`features/auth/components/RutaProtegida.tsx:25`). Antes de irse **anota en el estado de la
   navegación** que se venía de `/cobrar`.
4. En `/ingresar` se ve `FormularioIngreso`. Rosa escribe y toca "Entrar". `enviar`
   (`FormularioIngreso.tsx:41`) primero comprueba que no haya campos vacíos. Esa validación
   es local y no gasta una llamada a la red.
5. `ingresar` del contexto (`SesionProvider.tsx:41`) llama a `login`
   (`features/auth/api/login.ts:11`), que hace `api.post('/auth/login', …)`.
6. En `lib/api.ts:71` el interceptor de petición pregunta si hay token. No hay, así que la
   petición sale sin `Authorization`.
7. El servidor responde 200. `login` comprueba la forma con `esSesion` (un type guard, ver la
   bitácora de SPEC-KRILINXI-002) y devuelve la sesión.
8. `cambiarSesion` (`SesionProvider.tsx:22`) hace tres cosas a la vez: actualiza la ref, la
   guarda en `localStorage` y actualiza el estado de React.
9. De vuelta en el formulario, `navigate(volverA)` (`FormularioIngreso.tsx:53`) va a
   `/cobrar`, que era lo que había anotado el portero en el paso 3. Ahora `RutaProtegida`
   deja pasar y se ve la pantalla, con la `BarraSesion` arriba.

### Recorrido 2: la contraseña está mal

Pasos 1 a 6, iguales. El servidor responde 401 con
`{ error: { codigo: 'NO_AUTENTICADO', mensaje: 'El usuario o la contraseña no coinciden…' } }`.

1. Axios rechaza la promesa. El interceptor de respuesta (`lib/api.ts:77`) se la pasa a
   `traducirError` (`lib/api.ts:92`).
2. Hay respuesta, así que no es una falla de red. Hay 401, pero **la petición no llevaba
   token** (`lib/api.ts:100`), así que no es una sesión vencida: es una contraseña incorrecta.
   No se cierra ninguna sesión.
3. `leerCuerpoError` reconoce el formato uniforme y devuelve un `ErrorApi` con `status`,
   `codigo` y el mensaje del servidor.
4. En el formulario, `mensajeDe` (`FormularioIngreso.tsx:19`) lo convierte en texto:
   - para un `ErrorApi`, el mensaje del servidor, que ya viene escrito para el mostrador;
   - para un `ErrorSinConexion`, "Para entrar hace falta internet".

   Ese texto se ve en un `role="alert"`.

### Recorrido 3: al día siguiente, el servidor rechaza el token

1. Rosa recarga la página. `leerSesion` encuentra la sesión y `sesion` arranca con
   valor, **sin llamar a la API**. Es lo que permite abrir la app sin internet.
2. Al montar, el `useEffect` de `SesionProvider.tsx:31` le **presta** la sesión al cliente con
   `conectarSesion` (`lib/api.ts:58`): cómo obtener el token y qué hacer si lo rechazan.
3. Alguna feature hace una petición. El interceptor le pone `Bearer <token>`.
4. El servidor responde 401. Esta vez la petición llevaba token, así que
   `sesion.alRechazarSesion()` (`lib/api.ts:101`) llama a `cambiarSesion(null)`, que borra el
   almacenamiento y el estado.
5. Con `sesion` en `null`, `RutaProtegida` redirige a `/ingresar`. Nadie tuvo que acordarse de
   hacerlo: el portero reacciona al estado.

## Dónde encaja en la arquitectura

| Pieza | Capa (CLAUDE.md §5) | Qué NO le toca |
|---|---|---|
| `lib/api.ts` | `lib/`: infraestructura compartida | Saber dónde vive la sesión. Solo la recibe prestada. |
| `features/auth/api/` | La `api/` de la feature | Mostrar nada. `login` devuelve datos o lanza. |
| `features/auth/api/almacen.ts` | Idem: el único que toca `localStorage` | Decidir cuándo se guarda o se borra. |
| `SesionProvider` + `contexto` | Estado de la feature | Pintar pantallas. |
| `hooks/useSession` | `hooks/`, transversal | Nada más que leer el contexto. |
| `components/` de auth | UI de la feature | Llamar a axios o leer el almacenamiento (lo vigila `test/arquitectura.test.ts`). |
| `pages/rutas.tsx`, `App.tsx` | Composición | Lógica: solo declaran quién abre qué y lo arman. |

La dirección de las dependencias: `features` puede importar de `lib`, pero **`lib` no importa
de `features`**. Por eso `lib/api` no llama a `leerSesion()`, sino que espera a que alguien le
conecte la sesión. Si lo importara directamente, el cliente de la API quedaría atado a una
feature concreta. Además cualquier test del cliente arrastraría la sesión, y en el día en
que PowerSync también necesite el token habría un ciclo de imports.

**Control de acceso:** el menú por rol y `RutaProtegida` son comodidad. La seguridad la
pone el backend, con el middleware de rol de SPEC-ALE186-002 (CLAUDE.md §8). Un empleado que
se salte la pantalla recibe un 403 igual.

**Fuera de scope, a propósito:** `main.tsx` no estaba en el scope de la spec, pero es
el único lugar donde tiene sentido montar `SesionProvider`, por la misma razón que ahí vive
`BrowserRouter`: los tests montan el suyo. Es un cambio de una línea.

## Fundamentos

### Interceptores (de axios)

**Qué es.** Funciones que axios ejecuta en **todas** las peticiones: las de petición antes de
mandar, y las de respuesta al volver. En este repo hay una de cada: `lib/api.ts:71` pone el
token y `lib/api.ts:77` traduce los errores.

**Por qué existe el patrón.** Hay cosas que valen para cada petición del sistema: la
cabecera `Authorization`, qué hacer con un 401, cómo leer un error. Sin interceptores, cada
llamada tendría que acordarse de las tres. La primera que se olvide manda una petición sin
token o muestra "Request failed with status code 409" en el mostrador.

**Qué pasaría sin él:** un `try/catch` con la misma traducción copiado en cada feature,
y cada copia un poco distinta.

### Contexto de React (Provider)

**Qué es.** La forma que tiene React de que un valor esté disponible para **cualquier**
componente de un árbol sin pasarlo por props de padre a hijo a nieto. El `Provider`
(`SesionProvider.tsx:47`) lo ofrece y `useContext` lo lee, que aquí se hace siempre a través
de `useSession` (`hooks/useSession.ts`).

**Por qué.** La sesión la necesitan pantallas que están a distintas profundidades: el menú,
el portero de cada ruta, la barra de arriba y el formulario. Pasarla por props obligaría a
cada componente intermedio a recibir y reenviar algo que no usa.

**El detalle de este repo:** `useSession` lanza si no hay provider. Es un error de
programación, y es mejor que salte en el primer test que devolver `null` y que el menú
aparezca vacío sin explicación.

### Leer estado de React desde fuera de React (useRef)

**Qué es.** El interceptor de axios no es un componente: no puede usar hooks ni se entera de
cuándo React vuelve a renderizar. Pero necesita el token **actual** en cada petición. La
solución (`SesionProvider.tsx:20`) es una **ref**: una caja que React no toca, que se
actualiza en `cambiarSesion` y que el interceptor lee cuando le hace falta.

**Qué pasaría sin ella:** si `conectarSesion` recibiera el token como valor fijo, se quedaría
con el que había al montar, para siempre. Después de un login, las peticiones saldrían sin
token. El test "pide el token en cada petición" (`lib/api.test.ts`) está para eso.

### Inversión de dependencia

**Qué es.** En lugar de que el módulo de abajo (`lib/api`) busque lo que necesita en uno de
arriba (`features/auth`), **el de arriba se lo entrega**. `conectarSesion` (`lib/api.ts:58`)
recibe dos funciones, `obtenerToken` y `alRechazarSesion`, y devuelve la función que
desconecta, lista para usarse como limpieza del `useEffect`.

**Por qué.** `lib/api` queda sin saber nada de React, de `localStorage` ni de la feature
auth. Se testea solo pasándole dos funciones inventadas (`conSesion` en `lib/api.test.ts`), y
mañana cualquier otra cosa podría conectarle la sesión sin tocarlo.

### Redirigir recordando a dónde se iba

**Qué es.** `Navigate` con `state` (`RutaProtegida.tsx:25`) viaja a `/ingresar` llevando
`{ desde: '/cobrar' }` en el estado de la navegación, un dato que va con la entrada del
historial y no se ve en la URL. El formulario lo lee con `useLocation().state` y lo estrecha
desde `unknown` antes de usarlo (`destino`, en `FormularioIngreso.tsx`).

**Por qué.** Sin esto, después de entrar todo el mundo termina en el inicio y tiene que
volver a buscar la pantalla que quería. Para una persona mayor con prisa, es un paso de más
en cada login.

### Doble de prueba en el borde HTTP (adapter de axios)

**Qué es.** Axios delega el envío real a una pieza intercambiable, el **adapter**.
`test/apiFalsa.ts:73` la reemplaza por una función que responde lo que diga el test. Todo lo
demás corre de verdad: los interceptores ponen el token y traducen los errores.

**Por qué ahí y no más arriba.** Si se simulara `login()` con `vi.mock`, el test pasaría aunque
el interceptor no pusiera el token o tradujera mal los errores. El criterio de a qué altura
va el doble ya está explicado en SPEC-ALE186-003. Esto es su versión para el frontend: **lo
más abajo posible sin salir del proceso**.

**Un detalle que muerde:** un adapter propio tiene que decidir él mismo qué status es error
(`apiFalsa.ts:64`). Los adapters de axios lo hacen por dentro; si el nuestro devolviera un 401
como respuesta normal, axios no lo rechazaría y ningún test de error fallaría por la razón
correcta.

### Prueba de mutación

**Qué es.** Romper a propósito una línea del código y comprobar que algún test falla. Si
todos siguen en verde, esos tests no estaban probando esa línea, aunque digan que sí.

**En esta spec:** se comentó `sesion.alRechazarSesion()` (`lib/api.ts:101`) y fallaron dos
tests, el unitario del cliente y el de punta a punta de `App`. Después se restauró el
archivo. Es barato, y es la respuesta honesta a "¿y si los tests pasan porque no prueban
nada?".

**Ya explicado antes:**

- **JSON Web Token** y **autenticación vs autorización (401 y 403)** → SPEC-ALE186-002
  (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Enumeración de usuarios**, que explica por qué el mensaje de login es único →
  SPEC-ALE186-002
- **Formato de error uniforme** → SPEC-ALE186-001 (`specs/notas/SPEC-ALE186-001-backend-bootstrap.md`)
- **Factory de datos de prueba** → SPEC-ALE186-002. Aquí se usa en `test/sesion.ts`.
- **Dobles de prueba** → SPEC-ALE186-001. **A qué altura va el doble** → SPEC-ALE186-003.
- **Type guard**, **test de arquitectura**, **componente controlado** → SPEC-KRILINXI-002
  (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Enrutado del lado del cliente** y **helper de test** → SPEC-KRILINXI-001

## Decisiones y por qué

- **`localStorage` y no una cookie ni `sessionStorage`.** `sessionStorage` se borra al cerrar
  la pestaña, y la sesión tiene que sobrevivir a eso (CLAUDE.md §6). Una cookie la mandaría el
  navegador solo, a cada petición, y además el token de PowerSync no va a nuestro servidor.
  El costo conocido es que un script inyectado en la página podría leerlo. Se acepta porque
  la app no muestra HTML de terceros, y porque CLAUDE.md ya asume que el dispositivo es la
  frontera de confianza.
- **Un 401 solo cierra la sesión si la petición llevaba token.** Si no, "contraseña
  incorrecta" al entrar se trataría como "tu sesión venció".
- **Una sesión guardada con forma rara se borra.** Si la dejó una versión vieja de la app,
  es mejor pedir la contraseña que arrancar con un rol inventado.
- **Timeout de 15 segundos en el cliente.** Sin límite, un wifi que no responde deja el botón
  "Entrando…" colgado para siempre.
- **ADMIN ve todo el menú, por decisión en `/spec-new`.** No tiene sucursal, así que
  "Registrar ropa" y "Entregar ropa" no le van a funcionar. Hay que resolverlo cuando existan
  esas pantallas.
- **Vencimiento del token: no se mira.** La sesión dura hasta salir o hasta un 401. El
  vencimiento offline y la renovación van en `conexion-y-renovacion`.

## Los tests

**Helpers reusados:**
- `renderEnRuta` (`test/render.tsx`), de SPEC-KRILINXI-001. Se **amplió** en vez de crear
  uno nuevo: ahora monta también `SesionProvider` y, por defecto, con un EMPLEADO adentro. Los
  tests que ya existían no cambiaron. Solo el que recorre todas las rutas tuvo que decir
  "entrá como ADMIN", porque `/ingresar` con sesión ahora redirige.

**Helpers creados, para que los use la próxima spec:**
- **`test/apiFalsa.ts` — `simularApi(responder)`.** Es el servidor falso de todo el frontend.
  La spec de clientes lo va a usar así:

  ```ts
  const servidor = simularApi(() => ({ status: 409, data: cuerpoError('TELEFONO_DUPLICADO', '…') }));
  // … la pantalla intenta guardar …
  expect(servidor.pedidos[0]).toMatchObject({ metodo: 'POST', ruta: '/clientes' });
  ```

  Se restaura solo al terminar cada test (`onTestFinished`), así que un test no le deja el
  servidor falso puesto al siguiente.
- **`test/sesion.ts` — `sesionDePrueba({ rol: 'ADMIN' })`.** Es una factory: una sesión
  válida donde cada test cambia solo lo que le importa.
- **`test/arquitectura.ts` — `archivosFuente('pages', 'features')`.** Es lo que antes estaba
  dentro de `components/sinDatos.test.ts`, ahora generalizado. Recorre las carpetas y
  devuelve rutas siempre con `/`, también en Windows. `sinDatos.test.ts` no se migró porque
  está fuera del scope de esta spec; se puede pasar a este helper en la próxima que toque
  `components/`.

**Limpieza entre tests:** `test/setup.ts` vacía `localStorage` después de cada test. Sin eso,
la sesión que guardó un test seguiría adentro en el siguiente.

**Por qué se prueba el formulario montando `App` entera:** lo que importa es el recorrido
completo de una persona (llega, escribe, entra y ve la pantalla que pidió). Ese recorrido
cruza cinco piezas. Probar el formulario suelto dejaría sin probar justo cómo se conectan.

## Si mañana tenés que tocar esto

- **Una feature que llama a la API:** importá `api` de `lib/api` y atrapá `ErrorApi` y
  `ErrorSinConexion`. Nunca importes axios directo; `test/arquitectura.test.ts` lo va a
  detectar en tus componentes.
- **Una pantalla nueva:** agregala en `pages/rutas.tsx` con su `acceso`. El portero y el menú
  la toman solos.
- **La renovación (`conexion-y-renovacion`):** el lugar para enchufarla es `SesionProvider`.
  Ya tiene `cambiarSesion` para guardar las credenciales nuevas, y `conectarSesion` ya
  lee el token en cada petición, así que un token renovado se usa sin tocar `lib/api`.
- **Cuidado:** el login real contra el backend no se probó en esta spec, porque Docker no
  estaba levantado. Todo lo de arriba corre contra `simularApi`.
