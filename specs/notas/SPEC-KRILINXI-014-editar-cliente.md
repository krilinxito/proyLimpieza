---
id: SPEC-KRILINXI-014
spec: specs/SPEC-KRILINXI-014-editar-cliente.md
explica:
  - extraer una regla compartida sin cambiar lo que hace (refactor con los tests como red)
---

# SPEC-KRILINXI-014 — Editar los datos de un cliente

## Qué se construyó

Si el empleado se equivocó al escribir el nombre o el teléfono de un cliente, ahora lo puede
arreglar. La tarjeta del cliente en `/clientes` (también la que aparece al registrar ropa)
tiene un botón **Cambiar datos**. El cambio se guarda en la tablet al momento, con o sin
internet, y sube después por la cola, igual que el alta.

## Cómo funciona, paso a paso

Rosa busca a "Rosa Quispe" y corrige su teléfono a "70 99-88 77".

1. **El botón.** Las tres tarjetas de la pantalla (encontrado, registrado, teléfono ocupado)
   usan `Acciones` (`clientes/components/PantallaClientes.tsx:172`), que pone "Cambiar datos"
   siempre y "Es este cliente" solo cuando la pantalla se usa para elegir. Al tocarlo, la
   pantalla pasa al paso `editando` (`:23`) y muestra `FormularioEditarCliente` (`:130`),
   que arranca con el nombre y el teléfono actuales.
2. **Guardar.** El formulario llama a `editar(cliente, datos)`
   (`FormularioEditarCliente.tsx:35`). Esa función la da el hook
   (`hooks/useClientes.ts:31`), que la ata a la base local.
3. **Validar.** `editarCliente` (`api/clientesLocal.ts:118`) llama a `validarCliente`
   (`:65`) pasándole el id del propio cliente (`:119`):
   - Normaliza el teléfono a "70998877".
   - Exige nombre y teléfono.
   - Busca si otro cliente ya tiene ese número. El propio cliente no cuenta: si no, ningún
     cliente podría guardar sin cambiar su teléfono.
   - Si el número es de otro, el error dice de quién es: `telefonoDeOtro` (`:46`).
4. **Escribir solo lo que cambió.** Compara con lo que tenía. Si no cambió nada, devuelve
   `sin-cambios` y no escribe (`:126`). Si cambió, arma un `UPDATE` solo con esas columnas
   (`:129`).
5. **La cola.** PowerSync anota el `UPDATE` como un `PATCH` con `{ telefono: "70998877" }`. El
   conector ya sabía mandar los `PATCH` de clientes (`lib/powersync/conector.ts:49`, desde
   SPEC-KRILINXI-007), así que sube como `PATCH /api/clientes/:id`. El backend acepta nombre,
   teléfono y carnet desde SPEC-ALE186-003.
6. **La pantalla** pasa al paso `editado`: muestra "Datos del cliente guardados." y la
   tarjeta con el teléfono nuevo, sin esperar al servidor.

## Dónde encaja en la arquitectura

Es el patrón de la feature tal como lo dejó SPEC-KRILINXI-005, sin piezas nuevas:

- El SQL vive en `api/clientesLocal.ts`.
- El hook `useClientes` es la puerta: ahora da `buscar`, `registrar` y `editar`.
- Los componentes solo muestran lo que les contestan.

Lo que sí cambió es **dónde vive la regla del cliente**. Antes estaba metida dentro de
`registrarCliente`, y SPEC-KRILINXI-013 había tenido que copiar parte de ella en la
corrección de rechazos. Ahora es una sola función, `validarCliente`, que usan las tres:

- el alta (`clientesLocal.ts:96`),
- la edición (`:119`),
- la corrección (`pendientes/api/corregirLocal.ts:87`).

Cada una decide qué hacer con el teléfono ocupado. El alta muestra al cliente que ya existe
("no hace falta registrarlo otra vez"). La edición y la corrección lo tratan como un error del
campo. Por eso `ocupadoPor` sale aparte de `errores`.

## Fundamentos

### Extraer una regla compartida sin cambiar lo que hace

Sacar la validación de `registrarCliente` es un **refactor**: se cambia cómo está escrito el
código sin cambiar lo que hace. El riesgo de un refactor es romper algo sin darse cuenta, y la
red que lo evita son los tests que **ya existían**.

El orden importa. Primero se movió la regla y se corrieron los tests de SPEC-KRILINXI-005 (alta
y búsqueda) y de SPEC-KRILINXI-013 (corrección) sin tocarlos: pasaron los 59. Recién después se
escribieron los tests nuevos de la edición.

Si un test viejo hubiera fallado, el refactor habría cambiado el comportamiento, y eso se
arregla antes de seguir. Si se escriben los tests nuevos en el mismo paso, ya no se sabe si un
fallo viene de lo movido o de lo nuevo.

Lo que se gana: una sola definición de "teléfono válido y libre", con un solo texto. Si mañana
la regla cambia (por ejemplo, para tratar igual "+591 70123456" y "70123456"), se cambia en un
lugar y las tres pantallas la siguen.

**Ya explicado antes:**

- **Normalizar antes de comparar** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`)
- **UPDATE dinámico con lista blanca** → SPEC-ALE186-003 (`specs/notas/SPEC-ALE186-003-clientes-api.md`): las columnas salen de una lista fija, nunca de lo que escribe el empleado.
- **Hook como puerta a los datos** → SPEC-KRILINXI-005 (`specs/notas/SPEC-KRILINXI-005-clientes-mostrador.md`)
- **Errores esperados como valor de retorno** → SPEC-KRILINXI-005: `ResultadoEdicion` con `editado`, `sin-cambios` e `invalido`.
- **Un UPDATE que no cambia nada igual encola un PATCH vacío** → SPEC-KRILINXI-013 (`specs/notas/SPEC-KRILINXI-013-corregir-registros.md`, "Mirar cómo se comporta la librería antes de decidir")

## Decisiones y por qué

- **Solo nombre y teléfono, no el carnet.** Es lo que pide la spec. El backend también acepta
  el carnet, así que agregarlo después es un campo más en `DatosEdicion` y en el formulario.
- **"Sin cambios" no es un error.** Guardar sin haber cambiado nada vuelve a la tarjeta con
  "No cambiaste ningún dato: quedó como estaba." No hay nada mal que corregir, así que pintarlo
  de rojo confundiría.
- **La validación de la corrección (SPEC-KRILINXI-013) pasó a usar `validarCliente`**, y por
  eso esta spec toca tres archivos de `pendientes/`. El `scope` se corrigió para declararlos.

## Los tests

- **Reusados:**
  - `baseConRosa` / `ROSA` de `clientesLocal.test.ts`: en vez de crear otro cliente de prueba,
    los tests de la edición usan el de la búsqueda.
  - `abrirClientes`, `buscar`, `escribir` y `datosMostrados` de `PantallaClientes.test.tsx`.
  - `subirAceptando` (`test/rechazos.ts`, de SPEC-KRILINXI-013), para ver exactamente qué le
    llega al servidor: un `PATCH` solo con el nombre.
- **Nuevo:** `abrirEdicion()`, dentro del test de pantalla. Deja a Rosa encontrada y el
  formulario abierto, que es el punto de partida de casi todos los casos.
- **La cola se mira directo:** `db.getCrudBatch()` comprueba que "sin cambios" y "teléfono de
  otro" no dejan nada para subir. Es la prueba de que no se escribió, no solo de que la pantalla
  no lo mostró.

## Si mañana tenés que tocar esto

- **Una regla nueva del cliente va en `validarCliente`**, no en una pantalla.
- **Para editar otro dato** (el carnet), agregalo a `DatosEdicion`, a la comparación de
  `editarCliente` y al formulario. El `UPDATE` ya arma las columnas desde la lista de cambios.
