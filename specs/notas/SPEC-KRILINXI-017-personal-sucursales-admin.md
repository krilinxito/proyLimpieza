---
id: SPEC-KRILINXI-017
spec: specs/SPEC-KRILINXI-017-personal-sucursales-admin.md
explica:
  - consistencia eventual (lo escrito tarda en verse)
  - un secreto que no puede tocar el almacenamiento del dispositivo
  - un test que pasa por construccion no prueba nada
---

# SPEC-KRILINXI-017 — Administrar el personal y las sucursales

## Qué se construyó

El admin tiene dos pantallas nuevas en su menú:

- **Personal:** ver las cuentas, dar de alta a alguien, cambiarle el nombre, el teléfono, la
  sucursal o la contraseña, y darlo de baja.
- **Sucursales:** verlas, dar de alta una, cambiar sus datos, cerrarla y volver a abrirla.

Sin red, se puede mirar todo pero los botones de cambio se deshabilitan y lo dicen.

Es **la primera parte del front que escribe sin pasar por la cola**. Todo lo que escribe el
mostrador va primero a la base local y sube después (CLAUDE.md §6). Lo del admin va directo a
la API. El porqué está en Fundamentos; la regla quedó escrita en §6.

## Cómo funciona, paso a paso

El admin da de alta a Juan Mamani, empleado del Centro.

1. **La lista.** `PantallaPersonal` usa `useCuentas`, que lee `usuarios` de la base local con
   un `LEFT JOIN` a `sucursales` para mostrar el nombre de la sucursal
   (`features/usuarios/api/cuentasLocal.ts`). En SQLite sí hay JOIN; el límite de los JOIN es
   de las sync rules de PowerSync, no de la base del dispositivo. La lista se vuelve a leer
   cada vez que cambia algo en la base (`observarEstado`, `hooks/useCuentas.ts:23`).
2. **El formulario.** "Agregar una persona" abre `FormularioCuenta`. Las sucursales para elegir
   salen de `useSucursalesAbiertas`, de la otra feature: una cerrada no aparece.
3. **Guardar.** `enviarFormulario` (`components/FormularioCuenta.tsx:80`) llama a `guardar`
   (`:84`), que la pantalla conecta con `cambiosDeCuenta.crear` (`PantallaPersonal.tsx:46`).
4. **Validar y mandar.** `crearCuenta` (`api/cuentasApi.ts:32`) revisa nombre, usuario,
   contraseña de 8 y sucursal, con los textos del backend. Si todo está bien, arma el cuerpo
   con un id del dispositivo y la contraseña (`:47`), y lo manda con
   `enviar(() => api.post('/usuarios', cuerpo))` (`:53`).
5. **`enviar` traduce el final.** (`lib/api.ts:140`) Un 2xx da `hecho`, `ErrorSinConexion` da
   `sin-conexion` (`:144`) y `ErrorApi` da `rechazado`, con el código y el mensaje del servidor
   (`:145`). Cualquier otra cosa es un error de programación y se deja pasar.
6. **El aviso.** Si sale bien, la pantalla vuelve a la lista con "Guardado. Puede tardar unos
   segundos en verse en la lista." (`components/AvisosAdmin.tsx:30`). Si el servidor dijo que
   no (un usuario repetido), el formulario queda abierto con su mensaje para corregir.
7. **Juan aparece.** El backend escribió en Postgres. PowerSync lo replica y lo baja por el
   bucket `global`, el `observarEstado` de la lista se entera, y Juan aparece. Son unos
   segundos sin que nadie toque nada.

Un caso con traducción: **cerrar una sucursal que todavía tiene ropa.** El backend responde 409
`SUCURSAL_CON_ROPA` con "Quedan 2 **órdenes** con ropa…", y "orden" es una palabra prohibida
en pantalla (CLAUDE.md §9). `resultadoDe` (`features/sucursales/api/sucursalesApi.ts:23`)
reconoce el código y pone su propio texto: "Todavía hay ropa en esta sucursal… primero hay que
entregar o anular esa ropa."

## Dónde encaja en la arquitectura

| Pieza | Qué hace | Qué no le toca |
|---|---|---|
| `api/*Local.ts` | Leer de la base local | Escribir en ella |
| `api/*Api.ts` | Validar, mandar a la API con `enviar`, traducir el resultado | Tocar la base local |
| `hooks/` | La lista al día (`observarEstado`) y los cambios disponibles | Mostrar |
| `components/` | Formularios, confirmaciones, avisos | Importar de `api/` |
| `lib/api.ts` → `enviar` | Una escritura online pasa a ser un valor | Saber de cuentas o sucursales |
| `hooks/useEnLinea` | Si el navegador tiene red | Decidir qué se deshabilita |

La regla de §6 ("escrituras: primero local") tiene ahora una excepción escrita, y la vigila un
test (`test/arquitectura.test.ts:152`): **ninguna de las dos features escribe en la base
local**, ni con `ejecutar` ni armando un `INSERT`, `UPDATE` o `DELETE`. Se probó rompiéndolo a
propósito, con un `UPDATE` de mentira, y el test falló.

Dos piezas cambiaron de lugar:

- **`usePedidoOnline` pasó a `src/hooks/`.** Lo va a usar la auditoría (018). Al principio dije
  que lo usaba esta spec, y no es así: estas pantallas leen de la base local. El comentario del
  hook dice el motivo real.
- **El panel de estadísticas dejó de tener su propia lectura de sucursales** y usa
  `useSucursalesAbiertas`. Ningún archivo de estadísticas toca ya la base local, y la regla de
  la 015 se quedó sin excepciones.

## Fundamentos

### Un secreto que no puede tocar el almacenamiento del dispositivo

Lo que se escribe en la base local **queda en el disco de la tablet**: en la fila y en la cola
de subida (`ps_crud`), que es otra tabla del mismo SQLite. Para una boleta está bien; para una
contraseña, no.

Una tablet de mostrador la usan varias personas, se puede perder, y alguien puede abrir las
herramientas del navegador. La contraseña quedaría guardada como texto hasta que la cola suba,
y una tablet sin internet puede tardar días.

Por eso la contraseña **solo existe en dos lugares**: el estado del formulario, en memoria,
que desaparece al cerrarlo, y el cuerpo del pedido HTTP (`cuentasApi.ts:47`). El test de
pantalla lo comprueba de las tres formas que importan: la cola vacía, ninguna fila de
`usuarios` con la contraseña, y nada en `localStorage`.

La regla general: **antes de guardar algo "para después", preguntate qué pasa si alguien lee
ese almacenamiento**. El modo offline es una garantía para los datos del negocio, no para los
secretos.

### Lo escrito tarda en verse: consistencia eventual

Acá **lectura y escritura van por caminos distintos**: se escribe en la API y se lee de la base
local. Entre que Postgres guarda y la lista lo muestra pasan unos segundos, lo que tarda
PowerSync en replicar y bajar el cambio. Durante ese rato, la pantalla muestra datos viejos,
aunque correctos.

Eso se llama **consistencia eventual**: no está todo igual en todas partes en cada instante,
pero termina estándolo. En el mostrador no se nota, porque se escribe y se lee de la misma base
local. Acá sí, y hay tres formas de manejarlo:

1. **Agregar la fila a mano en la lista**, sin esperar. Es rápido de ver, pero se puede
   equivocar: si el servidor la guardó distinta, o la rechazó después, la pantalla miente.
2. **Esperar a que baje** antes de volver a la lista. Es exacto, pero el admin queda mirando un
   "Guardando…" que depende de PowerSync, no del servidor.
3. **Decirlo** y dejar que llegue sola. Es lo que se hizo: "Guardado. Puede tardar unos segundos
   en verse en la lista." La lista se actualiza sola con `observarEstado`.

Se eligió la tercera porque es la única que **nunca muestra algo falso**. A cambio cuesta una
línea de texto, y con un admin que hace pocas altas eso alcanza.

### Un test que pasa por construcción no prueba nada

El primer test de "la contraseña no queda en la tablet" llamaba a `crearCuenta` y miraba que la
cola estuviera vacía. Pasaba, pero `crearCuenta` **ni siquiera recibe la base**: no podía
escribir en ella aunque quisiera. El test no podía fallar, y un test que no puede fallar no
protege nada. El día que alguien agregue una escritura, por otro lado, seguiría en verde.

Se cambió por dos cosas que sí pueden fallar:

- **Una regla de arquitectura** que lee el código de las dos features y falla si alguna
  escribe en la base local. Se rompió a propósito para verla fallar.
- **El test de pantalla**, que recorre el alta de punta a punta con la base real y mira la cola,
  la tabla y `localStorage`.

Para saber si un test vale, preguntá **"¿qué cambio en el código lo pondría en rojo?"**. Si la
respuesta es "ninguno", hay que reemplazarlo.

**Ya explicado antes:**

- **Ids generados por el cliente** y **reintento idempotente frente a choque de id** → SPEC-ALE186-003 y -009: el `crypto.randomUUID()` de cada alta.
- **Errores esperados como valor de retorno** → SPEC-KRILINXI-005: `Envio` y los `Resultado…`.
- **El evento `online` del navegador** → SPEC-KRILINXI-015: `useEnLinea` escucha también `offline`.
- **Test de arquitectura** → SPEC-KRILINXI-002 · **Prueba de mutación** → SPEC-KRILINXI-003
- **Sync rules y buckets** → SPEC-KRILINXI-004: por qué el teléfono no está en la tablet.

## Decisiones y por qué

- **El teléfono arranca vacío al editar.** La alternativa era bajarlo por PowerSync, y eso
  significaba más datos personales en todas las tablets para un campo que casi no se usa.
  Vacío quiere decir "no cambiar". Lo decidió la dueña de la spec.
- **Una sucursal cerrada se puede volver a abrir.** No estaba en la spec original; el backend ya
  lo admitía y evita arreglar un cierre por error tocando la base a mano. Se agregó el criterio.
- **La baja no tiene "volver a dar de alta".** El backend lo permite (`activo: true`), pero la
  spec no lo pide. Es un botón más si hace falta.
- **Sin red se deshabilita, y además se maneja el fallo.** `useEnLinea` es una pista (`online`
  quiere decir que hay red, no que el servidor conteste). Si el pedido igual falla, `enviar` da
  `sin-conexion` y el aviso dice "no se guardó".

## Los tests

- **Helper nuevo: `test/red.ts`.** `sinRed()` hace que `navigator.onLine` dé `false` y dispara
  `offline`; `volverLaRed()` hace lo contrario. jsdom siempre cree que hay red. La 018 lo puede
  usar si deshabilita algo sin red.
- **Reusados:** `simularApi` (para ver el cuerpo exacto que viaja), `baseLocalDePrueba` y
  `sembrar` (cuentas y sucursales "ya sincronizadas"), `renderEnRuta` con
  `sesionDePrueba({ rol: 'ADMIN' })`, `ModalConfirmacion` y `sinJerga`.
- **Dos trampas que aparecieron:**
  - El nombre del admin está en su tarjeta **y** en la barra de quién está adentro, así que el
    helper `tarjeta` busca el que está dentro de la lista.
  - Las sucursales del formulario cargan de la base local de forma asíncrona, así que se
    esperan con `findByRole`, no con `getByRole`.
- **`App.test.tsx`:** el menú del admin ahora tiene Personal y Sucursales, y un EMPLEADO que
  escribe esas direcciones ve el aviso de solo administrador.

## Si mañana tenés que tocar esto

- **Otra escritura del admin:** su función en `api/*Api.ts` con `enviar`, y el resultado
  traducido con `avisoDe` (`components/AvisosAdmin.tsx`). Si el servidor manda un texto con
  palabras del sistema, traducilo por su **código**, como `SUCURSAL_CON_ROPA`.
- **Nunca** escribas en la base local desde estas dos features: el test de arquitectura te va a
  frenar, y es a propósito.
