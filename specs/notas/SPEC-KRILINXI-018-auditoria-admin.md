---
id: SPEC-KRILINXI-018
spec: specs/SPEC-KRILINXI-018-auditoria-admin.md
explica:
  - decir solo lo que se sabe (no fabricar un dato que el dispositivo no tiene)
  - esperar lo que se afirma (findBy y waitFor contra carreras en tests)
---

# SPEC-KRILINXI-018 — Consultar la auditoría: quién hizo qué

## Qué se construyó

El admin tiene **¿Quién hizo qué?** en su menú: la lista de lo que hizo cada persona, de lo más
nuevo a lo más viejo, dicha en palabras ("Elena Choque: Registró ropa · 15/10/2026 18:30 ·
Centro"). Se puede pedir solo lo que hay que revisar, o buscar por qué se hizo, quién, en qué
sucursal y en qué fechas. Si algo se cambió, muestra lo que había antes. Sin internet, dice que
la consulta necesita conexión.

Con esta spec, todo lo que hace el backend tiene su pantalla en el frontend.

## Cómo funciona, paso a paso

El admin abre la pantalla el 16/10/2026 y encuentra un registro de Elena.

1. **Qué se pide.** `useAuditoria` (`hooks/useAuditoria.ts:17`) arma su `pedir` (`:22`) con
   `parametrosAuditoria` (`filtro.ts:22`). Sin nada elegido, eso da los últimos 30 días:
   `{ desde: '2026-09-17', hasta: '2026-10-16' }`. Los otros filtros se mandan solo si están
   puestos.
2. **El pedido.** `pedirAuditoria` (`api/auditoriaApi.ts:71`) hace
   `GET /auditoria?…&pagina=1&por_pagina=20`, y `leerPagina` (`:44`) revisa cada registro contra
   el contrato. Si uno solo está roto, la página entera se rechaza (`:49`). `usePedidoOnline`
   (→ SPEC-KRILINXI-016) se ocupa de lo demás: cargando, sin conexión, error y recarga.
3. **Los nombres que la tablet conoce.** `useNombresConocidos` (`useAuditoria.ts:31`) arma tres
   mapas de id a nombre:
   - las personas, de `useCuentas` (SPEC-KRILINXI-017);
   - las sucursales, de `useSucursales`;
   - los clientes, pero **solo los de esta página**: `nombresDeClientes` (`:48`) hace
     `WHERE id IN (?, ?, …)` (`api/nombresLocal.ts:11`) en vez de leer miles de clientes.
4. **Ponerlo en palabras.** `TarjetaRegistro` usa cuatro funciones puras de `describir.ts`:
   - `queHizo` (`:17`) traduce el código. `CREAR` sobre `ordenes` es "Registró ropa"; `EDITAR`
     sobre `usuarios` con `activo: true` entre los valores anteriores es "Dio de baja una
     cuenta", porque si antes estaba activa, ahora no lo está.
   - `sobreQue` (`:51`) busca el nombre en los mapas. Para ropa, cobros y entregas devuelve
     `null`: no inventa.
   - `cuando` (`:68`) da cuándo pasó y, si es distinto, cuándo llegó al sistema.
   - `antes` (`:110`) da lo que había antes, dato por dato. De una contraseña dice solo "Le
     cambió la contraseña" (`:114`), porque el backend no guarda nada más.

## Dónde encaja en la arquitectura

| Pieza | Qué hace | Qué no le toca |
|---|---|---|
| `describir.ts` | Códigos → palabras (puro) | Leer ni pedir nada |
| `filtro.ts` | Elecciones → parámetros (puro) | Saber de la pantalla |
| `api/auditoriaApi.ts` | Pedir y comprobar el contrato | Tocar la base local |
| `api/nombresLocal.ts` | Nombres de clientes de la tablet | Pedir a la API |
| `hooks/useAuditoria.ts` | Página, pedido online y nombres | Formatear |
| `components/` | Mostrar | Importar de `api/` |

Es la última de las pantallas online del admin, y usa lo que dejaron las anteriores:
`usePedidoOnline` (016, que la 017 movió a `src/hooks/` justamente para esto), el patrón de
comprobar el contrato (015), las listas locales de personal y sucursales (017) y `Paginas`, que
salió de la lista de clientes de la 016.

La auditoría **no baja a ninguna tablet** (CLAUDE.md §7). Pero los nombres para mostrarla sí
salen de la tablet. No es una contradicción: se lee de la API lo que no está en el dispositivo
y de la base local lo que sí está (§6).

## Fundamentos

### Decir solo lo que se sabe

El criterio decía "sobre qué". Para un cliente es fácil: el admin tiene todos los clientes en la
tablet. Para "Registró ropa" haría falta el número de boleta, y el admin **no tiene la ropa en
su tablet**: el bucket `sucursal` le llega vacío a propósito, porque su trabajo es online (§7).
La respuesta de la API trae solo el id del registro.

Había tres caminos:

1. **Mostrar el id:** "Registró ropa — 4b9eb553-…". Es exacto pero inútil, y en pantalla parece
   un error.
2. **Pedir cada orden a la API:** veinte pedidos más por página para un dato chico, y además no
   existe un `GET` de una orden suelta.
3. **Decir solo el tipo** ("Registró ropa · Centro") y dejar anotado que el resumen lo tiene que
   mandar el backend.

Se eligió el tercero, con la dueña de la spec: es honesto y no le inventa un dato al admin. El
criterio se reescribió para decir eso, y el pendiente quedó en CLAUDE.md §13
(`auditoria-resumen`).

La regla general: **cuando un dato no está, la pantalla lo dice o no lo muestra, pero no lo
fabrica**. Un número de boleta que no es el real es peor que ninguno.

### Esperar lo que se afirma

Al empezar esta spec, un test de la 016 falló 1 vez de cada 3 o 4. Mirando el error completo
aparecieron dos causas, y las dos son el mismo error de concepto: **el test esperaba una cosa y
después afirmaba otra, que todavía no había pasado**.

- **Esperaba el título y afirmaba el pedido.** `await findByRole('heading', …)` y enseguida
  "el pedido de clientes salió con `pagina: 1`". Pero el título se dibuja **antes** de que el
  pedido llegue al servidor falso, porque axios pasa por sus interceptores, que son asíncronos.
  El arreglo es esperar el pedido mismo:
  `await waitFor(() => expect(de('/estadisticas/clientes')).toEqual(…))`
  (`features/estadisticas/components/PantallaEstadisticas.test.tsx:183`).
- **No esperaba nada antes de buscar un botón.** `getByRole('radio', { name: 'Centro' })` busca
  **ahora**, y las sucursales llegan de la base local un momento después. `findByRole` espera
  (`:106`, `:247`).

La regla: **`getBy…` es "ya tiene que estar"; `findBy…` y `waitFor` son "va a estar"**. Si lo que
se afirma depende de algo asíncrono (una lectura de la base, un pedido, un efecto), hay que
esperar **eso mismo**, no otra cosa que suele pasar al mismo tiempo. "Suele" es exactamente lo
que hace que un test falle una vez de cada cuatro.

Esta spec cayó en la misma trampa con los nombres de sucursal, y se arregló igual
(`findAllByText`). Después: 0 fallos en 20 vueltas del test de la 016 y en 10 del de la 018.

**Ya explicado antes:**

- **Test intermitente (flaky) y cómo diagnosticarlo** → SPEC-ALE186-022 (`specs/notas/SPEC-ALE186-022-bcrypt-costo-tests.md`): acá, el primer paso fue repetir hasta que fallara y guardar la salida entera.
- **Regla copiada atada al original con un test** → SPEC-KRILINXI-008: `ACCIONES` y `TABLAS` se comparan con el código del backend.
- **Comprobar una respuesta externa contra su contrato** → SPEC-KRILINXI-015
- **Reiniciar un estado cuando cambia otro sin useEffect** → SPEC-KRILINXI-016: la página de la auditoría vuelve a 1 con otro filtro.
- **Paginación con limit/offset y total aparte** → SPEC-ALE186-012 · **Dato histórico de algo que no cambia** → SPEC-ALE186-012: la sucursal de un registro es la del registro, no la de la persona hoy.

## Decisiones y por qué

- **Últimos 30 días por defecto**, igual que el backend y la historia del panel. Lo decidió la
  dueña de la spec.
- **Una sola lista "¿Qué buscar?"** en vez de dos filtros, uno de acción y otro de tipo de
  registro (`QUE_BUSCAR`, `describir.ts:135`). "Acción: COBRAR" y "Tabla: pagos" son dos
  preguntas técnicas para la misma idea. Cada opción manda `accion`, `tabla` o los dos.
- **"Solo lo que hay que revisar" a la vista, y el resto dentro de "Buscar con más detalle"**
  (`<details>`). Es lo que el admin viene a mirar más seguido, y así la pantalla no arranca con
  cinco preguntas (§9).
- **Un dato anterior que la pantalla no sabe nombrar se muestra como "Otro dato"**, nunca con su
  nombre de columna.

## Los tests

- **Helper nuevo: `test/auditoriaDePrueba.ts`.** `registroDePrueba()` arma un registro válido
  del contrato y `paginaDePrueba()` los envuelve en una página.
- **Reusados:**
  - `simularApi`, que anota los `parametros` (015).
  - `tabletConRelojCorrido(0)` (012), para que los 30 días sean del 17/09 al 16/10.
  - `baseLocalDePrueba` y `sembrar`, para los nombres.
  - `renderEnRuta` con una sesión de ADMIN, y `sinJerga`.
- **El test de "mismo contrato que el backend"** lee `backend/src/utils/dominio.ts` y
  `models/auditoria.model.ts` y compara las listas. Si alguien agrega una acción en el backend,
  este test lo avisa.
- **Las carreras de la 016** se arreglaron en un commit aparte (`554c278`), para que se vean
  solas en el diff.

## Si mañana tenés que tocar esto

- **Cuando el backend mande el resumen** (`auditoria-resumen`): leelo en `leerRegistro` y usalo
  en `sobreQue`. Es el único lugar.
- **Una acción nueva en el backend:** el test de contrato va a fallar. Agregala a `ACCIONES` y
  dale su texto en `queHizo`.
- **En cualquier test de pantalla:** si lo que mirás viene de la base local o de un pedido,
  `findBy…` o `waitFor`, nunca `getBy…`.
