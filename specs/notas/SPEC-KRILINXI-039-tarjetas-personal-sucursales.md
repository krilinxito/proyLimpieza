---
id: SPEC-KRILINXI-039
spec: specs/SPEC-KRILINXI-039-tarjetas-personal-sucursales.md
explica:
  - aria-hidden para lo decorativo que repite un nombre
  - contar en la base local con group by (y los grupos vacios)
---

# SPEC-KRILINXI-039 — Personal y Sucursales en tarjetas

## Qué se construyó

Personal y Sucursales dejaron de ser una columna de recuadros: son una grilla de tarjetas, una por fila
en pantalla angosta y dos desde 1024px. Cada cuenta lleva el círculo con su inicial, como en la
cabecera. Cada sucursal dice cuántas personas trabajan ahí. Las acciones (cambiar datos, dar de baja,
cerrar, volver a abrir) van adentro de su tarjeta, compactas y con su ícono. Altas y cambios siguen
yendo directo a la API, como desde SPEC-KRILINXI-017.

## Cómo funciona, paso a paso

El caso: el admin abre /sucursales. En el Centro trabajan Rosa y Luz, y Beto está dado de baja.

1. **La pantalla pide dos cosas a la base local**: la lista de siempre (`useSucursales`) y, nuevo,
   cuántas personas hay en cada una (`usePersonasPorSucursal`,
   `frontend/src/features/sucursales/components/PantallaSucursales.tsx:41`).
2. **El hook observa la base.** `usePersonasPorSucursal`
   (`frontend/src/features/sucursales/hooks/useSucursales.ts:38`) lee una vez y vuelve a leer cada vez
   que la base cambia (`observarEstado`, `:50`), igual que la lista. Si mañana PowerSync baja una cuenta
   nueva, el número se actualiza solo. Devuelve `null` hasta la primera lectura.
3. **La consulta cuenta en SQLite.** `personasPorSucursal`
   (`frontend/src/features/sucursales/api/sucursalesLocal.ts:32`) hace un `COUNT(*) … GROUP BY
   sucursal_id` sobre las cuentas activas con sucursal, y arma un `Map`: `{ Centro → 2 }`. Beto no
   cuenta (`activo = 0`) y el admin tampoco (no tiene sucursal).
4. **La tarjeta lo dice en palabras.** Si el `Map` todavía es `null`, el renglón no aparece
   (`PantallaSucursales.tsx:99`). Si ya llegó, `textoPersonas(2)` da "2 personas trabajan acá", con el
   ícono de personal al lado. A una sucursal que no está en el `Map` le corresponde 0: "Nadie trabaja acá".
5. **La grilla.** El `<ul>` es `grid gap-4 lg:grid-cols-2` (`:91`). Cada `<li>` también es `grid`, así
   la tarjeta adentro se estira y las dos de una misma fila quedan del mismo alto.

En /personal el recorrido es más corto: la lista no cambió (`listarCuentas`); lo nuevo es el
`<Avatar decorativo />` al lado de los datos
(`frontend/src/features/usuarios/components/PantallaPersonal.tsx:97`).

## Dónde encaja en la arquitectura

- **El conteo es una lectura de la base local, no un pedido a la API.** CLAUDE.md §6: "lecturas, siempre
  de SQLite local". Las cuentas ya están en la tablet (bucket `global`), así que contarlas ahí funciona
  también sin internet. Pedirlo al servidor rompería eso sin que nadie lo note hasta que se corte la red.
- **El SQL vive en `api/`, el hook en `hooks/`, la pantalla solo muestra.** Es el patrón de §5: ningún
  componente consulta PowerSync directamente. `PantallaSucursales` no sabe que hay un `GROUP BY`.
- **El conteo va aparte de `Sucursal`, a propósito.** Sumarle un campo `personas` al tipo `Sucursal`
  habría obligado a cambiar cada lugar que arma una (formularios, tests de la 017 que comparan con
  `toEqual` exacto), por un dato que solo usa esta tarjeta.
- **Fuera del `scope` declarado:** `components/iconos.tsx` (lápiz, candado y candado abierto, que la
  spec pide) y `components/marco/Avatar.tsx` (la opción `decorativo`). Los dos son chicos y los necesitaba
  la spec.

## Fundamentos

### Contar en la base, no en JavaScript

Para saber cuántas personas hay en cada sucursal había dos caminos: traer todas las cuentas y contarlas
en JS, o pedirle a SQLite que cuente. `COUNT(*) … GROUP BY sucursal_id` hace lo segundo: la base agrupa
las filas por sucursal y devuelve **una fila por grupo** con su total, en vez de una por cuenta. Llega
lo que se va a mostrar, no lo que hay que procesar.

Acá son pocas cuentas y la diferencia no se nota. Pero es el mismo criterio que usa el backend para el
tablero (CLAUDE.md §8: "los montos se suman en Postgres"), y deja el "qué cuenta" en un solo lugar: si
mañana una cuenta suspendida no debe contar, se cambia el `WHERE` (`sucursalesLocal.ts:32`), no un
`filter` repetido en cada pantalla.

Lo que el `GROUP BY` no devuelve: los grupos vacíos. Una sucursal sin nadie **no aparece** en el
resultado. Por eso la pantalla trata "no está en el `Map`" como 0 (`personas.get(s.id) ?? 0`), y por eso
el hook distingue `null` (todavía no se leyó) de un `Map` sin esa sucursal (se leyó y no hay nadie). Si
los confundiera, mientras carga diría "Nadie trabaja acá", que es un cero falso: lo que §8 pide no
mostrar nunca.

### Lo decorativo, oculto al lector de pantalla (`aria-hidden`)

`aria-hidden="true"` le dice al lector de pantalla: "esto no existe". Se usa para lo que **repite** algo
que ya se lee en otro lado. En la cabecera, el círculo con la inicial es lo único que dice quién atiende,
así que se anuncia ("Perfil de Rosa Quispe"). En una tarjeta de Personal, el nombre ya es el título: si
el círculo también se anunciara, cada tarjeta diría "Rosa Quispe, región. Perfil de Rosa Quispe,
imagen", veinte veces seguidas en la lista. Con `decorativo` (`Avatar.tsx:15`), el mismo componente se
ve igual y no se anuncia.

La regla para decidir: tapale los ojos a la pantalla y escuchala. Si algo se dice dos veces, una sobra.
Los íconos de la app ya siguen esta regla (todos son `aria-hidden`, SPEC-KRILINXI-022); el `Avatar` es el
primer componente que puede ser una cosa o la otra según dónde va.

**Ya explicado antes:**

- **Jerarquía visual, una sola acción principal, probar el estilo leyendo la clase** → SPEC-KRILINXI-037
  (`specs/notas/SPEC-KRILINXI-037-jerarquia-visual.md`). La principal de cada pantalla sigue siendo dar de
  alta; cerrar y dar de baja son de peligro.
- **Estilos según el ancho de pantalla** → SPEC-KRILINXI-038 (`specs/notas/SPEC-KRILINXI-038-acciones-boleta-en-fila.md`):
  `lg:grid-cols-2` vale desde 1024px.
- **Por qué el admin escribe directo a la API** → SPEC-KRILINXI-017 (CLAUDE.md §6). No cambió.

## Decisiones y por qué

- **Se dejó "Entra como «rosa» · Empleado · Centro" en un renglón.** La spec pide usuario, rol y
  sucursal, y ese renglón ya los da, corto. Partirlo en tres datos habría sido más letra, no menos, y los
  tests de la 017 lo buscan así.
- **"Activa" sigue con su insignia**, aunque la spec solo pide una para la dada de baja: que las dos
  tengan insignia hace que se vea la diferencia de un vistazo, y los tests de la 027 la esperan.
- **Dos columnas, no tres.** Las pantallas viven dentro de `Pantalla`, que tiene un ancho máximo de
  768px (`pages/Pantalla.tsx`). Tres tarjetas ahí no entran con botones de dedo. Ensanchar `Pantalla` es
  de `pages/`, fuera de esta spec.
- **Dar de baja usa el ícono `anular`, cerrar el `candado`.** Dar de baja corta el acceso, que es lo que
  dice el círculo tachado; cerrar una sucursal se puede deshacer, como un candado.

## Los tests

- **Reusado:** `usoDe` y `accionesPrincipales` (`test/jerarquia.ts`, SPEC-KRILINXI-037), y `abrir` y
  `tarjeta` de cada archivo de pantalla.
- **Generalizado:** el `abrir` de Sucursales ahora acepta cuentas para sembrar, como ya lo hacía el de
  Personal con `otras`, en vez de escribir otra preparación para el conteo.
- **Nuevo:** la consulta se prueba sola, contra la base de prueba de verdad (`api/sucursales.test.ts`):
  cuenta activas, no cuenta bajas ni el admin. `textoPersonas` se prueba con `it.each` en 0, 1 y 3, que
  son los tres casos de la frase.

## Si mañana tenés que tocar esto

- Quién "trabaja" en una sucursal se decide en el `WHERE` de `personasPorSucursal`.
- Si ensanchan `Pantalla` para estas dos pantallas, la grilla puede sumar `xl:grid-cols-3`.
