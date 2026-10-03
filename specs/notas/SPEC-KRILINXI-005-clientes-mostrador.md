---
id: SPEC-KRILINXI-005
spec: specs/SPEC-KRILINXI-005-clientes-mostrador.md
explica:
  - errores esperados como valor de retorno
  - estado inicial sembrado (ya sincronizado)
  - hook como puerta a los datos
---

# SPEC-KRILINXI-005 — Buscar y dar de alta clientes en el mostrador

## Qué se construyó

La pantalla **Clientes**: el empleado escribe el teléfono, ve los datos del cliente y, si
no existe, lo registra en el momento. Todo pasa en la tablet, con o sin internet. El cliente
nuevo queda esperando en la cola hasta que exista la subida (`cola-subida`).

Es la primera pantalla del negocio, así que importa menos por lo que hace que por el
**patrón** que deja: las de órdenes, cobros y entregas se van a armar igual.

## Cómo funciona, paso a paso

Seguimos a una empleada que busca `7012-3456` y no lo encuentra, y entonces registra a
"Juan Mamani".

1. **La ruta.** `/clientes` monta `<PantallaClientes />` dentro de `<Pantalla>`
   (`frontend/src/pages/rutas.tsx:62`). Solo se cambió el `elemento` del hueco que ya
   estaba reservado desde SPEC-KRILINXI-001.
2. **La pantalla pide sus herramientas al hook.** `PantallaClientes.tsx:27` llama a
   `useClientes()`. Mientras la base local se abre, el hook devuelve `{ lista: false }` y
   el botón dice "Preparando…". Cuando la base está lista, devuelve `buscar` y `registrar`.
3. **El hook une React con los datos.** `hooks/useClientes.ts:21` saca la base del
   contexto (`useBaseLocal()`) y en `:27-28` la pasa como primer argumento a las funciones
   de `api/clientesLocal.ts`. La pantalla nunca ve la base.
4. **Buscar.** Al tocar "Buscar cliente" (`PantallaClientes.tsx:33`) primero se comprueba
   que haya algún dígito. Después `clientes.buscar('7012-3456')` (`:43`) llega a
   `buscarPorTelefono` (`api/clientesLocal.ts:33`), que normaliza a `70123456` (`:34`, con
   la misma regla que el backend) y hace `SELECT … WHERE telefono = ?` en SQLite (`:37`).
   Esto pasa por `BaseLocal.consultar` (`lib/powersync/control.ts:37`) y no por la API.
5. **No está.** Devuelve `null`, la pantalla pasa al paso `no-encontrado` y ofrece
   "Registrar cliente nuevo". Al tocarlo, el formulario abre con el teléfono ya cargado.
6. **Registrar.** `FormularioAltaCliente.tsx:36` llama a `registrar(datos)` →
   `registrarCliente` (`api/clientesLocal.ts:54`), que:
   - limpia y normaliza (`:56`) y, si falta algo, **devuelve** `{ tipo: 'invalido' }`
     (`:62`) en vez de lanzar un error;
   - busca el teléfono otra vez (`:67`): si ya es de alguien, devuelve
     `{ tipo: 'telefono-ocupado', cliente }`;
   - si no, genera el id con `crypto.randomUUID()` (`:69`) y hace el `INSERT` (`:70`).
7. **La cola.** Ese `INSERT` no va a una tabla común: PowerSync lo anota como un `PUT` en
   su cola de subida, con `opData = { nombre, telefono, carnet }`. Es justo lo que acepta
   `POST /api/clientes` (SPEC-ALE186-003). Hoy la cola espera, porque `uploadData` todavía
   no sube nada.
8. **La respuesta.** El formulario recibe `{ tipo: 'registrado', cliente }` y se lo pasa a
   la pantalla con `alTerminar` (`FormularioAltaCliente.tsx:42`). La pantalla muestra
   "Cliente registrado." y la tarjeta con los datos. El servidor no intervino en ningún paso.

## Dónde encaja en la arquitectura

Las tres capas de una feature del frontend, como quedan desde esta spec:

| Capa | Archivo | Qué hace | Qué **no** hace |
|---|---|---|---|
| `api/` | `clientesLocal.ts` | SQL contra la base local, validación, normalización | No sabe de React, ni de contextos, ni de qué pantalla la llama |
| `hooks/` | `useClientes.ts` | Saca la base del contexto y la presta | No tiene lógica: si un `if` del negocio termina acá, está mal ubicado |
| `components/` | `PantallaClientes.tsx` y los demás | Qué se ve y en qué paso está la empleada | No escribe SQL ni toca la base: lo vigila `features/clientes/arquitectura.test.ts` |

Es la regla de CLAUDE.md §5 ("ningún componente consulta PowerSync directamente") puesta
en código. Si se rompe, la pantalla solo se puede probar con una base real abierta, y la
consulta se termina copiando en cada pantalla que necesita un cliente. Registrar ropa va a
necesitar `buscarPorTelefono` mañana, y lo importará de `api/` sin tocar esta pantalla.

`api/` se llama así por la convención de CLAUDE.md §5, aunque aquí no hay HTTP: es la capa
de acceso a datos de la feature, sea SQLite o API. En esta feature es solo SQLite, como pide
§6 (las lecturas y escrituras van primero a la base local).

## Fundamentos

### El hook como puerta a los datos

**Qué es.** Un hook propio (`useClientes`) que le da a la pantalla funciones listas para
usar (`buscar`, `registrar`) y esconde de dónde salen los datos.

**Por qué existe.** Las funciones de `api/` necesitan la base, y la base vive en un
contexto de React (`useBaseLocal`). Una opción sería que cada componente haga
`useBaseLocal()` y llame a `buscarPorTelefono(base, …)`. Funciona, pero el componente pasa
a saber que hay una base, que puede ser `null` mientras se abre y qué función recibe qué.
El hook concentra ese conocimiento en un solo lugar (`hooks/useClientes.ts:20-33`) y la
pantalla solo pregunta "¿está lista?" (`clientes.lista`).

**Qué pasaría sin él.** Cuando llegue `cola-subida` o cambie cómo se abre la base, habría
que tocar cada pantalla en vez de un hook. Y el test de arquitectura no podría prohibir
`useBaseLocal` en los componentes, que es lo que hoy lo mantiene honesto.

**El `useMemo`** (`useClientes.ts:22`) evita armar un objeto nuevo en cada render: así
`clientes.registrar` es la misma función mientras la base no cambie, y un componente que la
reciba como prop no se vuelve a renderizar sin motivo.

### Los errores esperados se devuelven, no se lanzan

**Qué es.** `registrarCliente` devuelve una de tres respuestas (`types.ts:29`):
`registrado`, `invalido` o `telefono-ocupado`. Ninguna es una excepción. La excepción queda
solo para lo inesperado, como que SQLite no pueda escribir.

**Por qué.** "Falta el nombre" y "ese teléfono ya es de Rosa" no son fallas del sistema:
son respuestas normales que la pantalla **tiene** que mostrar, cada una de una forma
distinta. Si se lanzaran, el `catch` tendría que averiguar con `instanceof` qué pasó, y un
caso olvidado terminaría en el mensaje genérico "No se pudo guardar". Con un valor de
retorno, TypeScript obliga a mirar `resultado.tipo` antes de usar `resultado.cliente`
(es la unión discriminada, ya explicada en SPEC-ALE186-004).

**En el código.** `FormularioAltaCliente.tsx:36-42`: el `invalido` se resuelve ahí mismo
(muestra los errores en cada campo), los otros dos suben a la pantalla, y el `catch` queda
solo para lo inesperado.

**Contraste con el backend.** El backend sí lanza (`TelefonoOcupadoError`, SPEC-ALE186-003)
porque Express necesita convertir cualquier problema en una respuesta HTTP, y su manejador
de errores centralizado está pensado para eso. Aquí no hay HTTP: la pantalla es quien
recibe la respuesta, y le conviene recibirla como un dato.

### Estado inicial sembrado ("ya sincronizado")

**Qué es.** Para probar "buscar a Rosa" hace falta que Rosa ya esté en la base del test.
`sembrar` (`test/baseLocalDePrueba.ts:53`) la inserta y después da por subida la cola
(`:67`), así que queda como si hubiera bajado del servidor.

**Por qué no un `INSERT` común.** Con un `INSERT` común, Rosa también quedaría en la cola
de subida. El test de "registrar a Juan deja **un** cambio en la cola" vería dos, y habría
que filtrar a mano qué parte de la cola es preparación y qué parte es lo que se está
probando. Un test cuya preparación se confunde con el resultado termina afirmando cosas
equivocadas.

**La guarda.** Si la cola ya tiene algo cuando se llama a `sembrar`, falla. Sin esa guarda,
`sembrar` daría por subido un cambio que el test escribió antes, y el test seguiría en
verde ocultando el problema.

**Ya explicado antes:**

- **Normalizar antes de comparar** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Ids generados por el cliente** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **Unión discriminada** → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Condición de carrera al leer y luego escribir** → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Cola de subida (crud queue)** y **doble que es el sistema real con otro motor** → SPEC-KRILINXI-004 (`specs/notas/SPEC-KRILINXI-004-powersync-local.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Prueba de mutación** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`)

## Decisiones y por qué

- **Se busca el teléfono exacto, no uno parecido.** El teléfono es la clave del cliente
  (CLAUDE.md §3). Una búsqueda por parecido mostraría listas y obligaría a elegir, que es
  justo lo que §9 pide evitar.
- **El prefijo de país no se quita.** "+591 70123456" queda `59170123456`, igual que en el
  backend. Tratarlo como el mismo número que "70123456" sería una regla nueva, y tiene que
  nacer en los dos lados a la vez o la búsqueda local y el servidor dejarían de coincidir.
  `telefono.test.ts` copia los casos del backend para que la regla no se separe.
- **El local solo escribe lo que escribió la empleada.** `fecha_registro` y
  `sucursal_registro_id` los pone el servidor (la sucursal sale de la sesión, nunca del
  dispositivo) y bajan con la sincronización. Escribirlos acá sería inventar un valor que
  después igual se pisa.
- **Leer y después escribir sin transacción** (`clientesLocal.ts:67-70`). Entre el `SELECT`
  y el `INSERT` podría colarse otra alta con el mismo teléfono. En una tablet usada por una
  sola persona, con `Boton` que bloquea el doble toque, eso no pasa; y si pasara, el
  servidor tiene la restricción `UNIQUE` y responde 409. La garantía es del servidor
  (CLAUDE.md §6); lo de acá es cortesía.
- **`/clientes` sigue abierto a ADMIN y EMPLEADO.** La spec lo dejaba "a decidir al
  aprobar" y no se decidió, así que quedó como estaba. Si el admin registra un cliente, el
  servidor lo guarda con `sucursal_registro_id` NULL.

## Los tests

- **Reusados:** `renderEnRuta` (monta la App con un EMPLEADO y la base que se le pase),
  `baseLocalDePrueba` (SQLite real), `simularApi` (para comprobar que **no** sale ninguna
  petición) y `archivosFuente` (para el test de arquitectura).
- **Ampliado:** `baseLocalDePrueba` ahora devuelve también `sembrar`. Las próximas specs lo
  van a usar igual:

  ```ts
  const { control, db, sembrar } = await baseLocalDePrueba();
  await sembrar('ordenes', [{ id: randomUUID(), numero_boleta: '001234', estado: 'LISTO', … }]);
  // … la pantalla de entregas tiene que encontrar la 001234 …
  ```

- **Sin internet** se prueba con `simularApi(() => 'sin-conexion')`: cualquier petición
  fallaría como si no hubiera red. Se comprueba `servidor.pedidos` vacío, es decir, que no
  se intentó ninguna.
- **Palabras del sistema:** `PantallaClientes.test.tsx` recorre todos los pasos (buscar, no
  encontrado, error, registrado) y comprueba que en pantalla no aparezcan "servidor",
  "sincronizar", "token"… Una prueba de mutación mostró que al principio el test no llegaba
  a "Cliente registrado.", y por eso se extendió.

## Si mañana tenés que tocar esto

- Para cambiar **qué se guarda**, empezá por `api/clientesLocal.ts`; para cambiar **qué
  se ve**, por `components/PantallaClientes.tsx`. El hook casi nunca se toca.
- Si cambia la regla del teléfono, cambiala **en los dos lados** (`telefono.ts` y
  `backend/src/utils/validacion.ts`) junto con sus dos tests.
- **Editar** un cliente (PATCH) no existe todavía. Cuando llegue, va como un `UPDATE` en
  `api/clientesLocal.ts`, y la cola lo sube como `PATCH /api/clientes/:id`.
