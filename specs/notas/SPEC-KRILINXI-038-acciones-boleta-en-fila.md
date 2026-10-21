---
id: SPEC-KRILINXI-038
spec: specs/SPEC-KRILINXI-038-acciones-boleta-en-fila.md
explica:
  - estilos que cambian con el ancho de pantalla (primero lo angosto)
  - grupo con nombre (role group)
---

# SPEC-KRILINXI-038 — Las acciones de la boleta en fila, con su símbolo

## Qué se construyó

En el detalle de una boleta, las acciones (Empezar a lavar, Marcar como lista, Cobrar, Entregar la
ropa, Anular) dejaron de ser barras apiladas a todo el ancho. Ahora son botones compactos en una fila,
cada uno con su ícono y su palabra: en la tablet en vertical van de a dos por renglón, y en pantalla
ancha, todos de corrido. Anular queda aparte, al final, y "Ver toda la ropa de…" sigue debajo, fuera
de la fila.

## Cómo funciona, paso a paso

El caso: se abre en el Mostrador la boleta 000001, RECIBIDA, con saldo pendiente.

1. **Qué acciones hay.** `DetalleOrden` parte los avances posibles en el siguiente y el resto, como
   desde SPEC-KRILINXI-037. Desde RECIBIDO hay dos: "Empezar a lavar" (el siguiente) y "Marcar como
   lista" (secundario).
2. **Cada avance con su ícono.** `ICONO_AVANCE` (`frontend/src/features/ordenes/components/DetalleOrden.tsx:30`)
   da `lavar` para EN_PROCESO y `listo` para LISTO. Está tipado con `Record<Avance['destino'], …>`: si
   mañana se agrega un avance en `AVANCES` (`features/ordenes/estado.ts`), TypeScript no compila hasta
   que tenga su ícono.
3. **La fila.** El contenedor es un `role="group"` con nombre, "Qué hacer con esta ropa"
   (`DetalleOrden.tsx:166`), y sus clases salen de `CLASE_FILA` (`:38`): `grid grid-cols-2` y, desde `sm`,
   `sm:flex sm:flex-wrap`. Adentro van, en orden, el avance principal (`:168`), los otros avances,
   Cobrar, lo que agregue `accionesExtra` (Entregar la ropa, compacto, en
   `features/entregas/components/AccionEntregar.tsx`) y Anular.
4. **Anular aparte.** Va envuelto en un `div` con `col-span-2 justify-self-start sm:ml-auto`
   (`DetalleOrden.tsx:198`): en la grilla ocupa su propio renglón, pero el botón conserva su ancho; en
   flex, `ml-auto` lo empuja al final de la fila, lejos de las demás.
5. **Si se abre la entrega.** `AccionEntregar` cambia el botón por el formulario dentro de la misma
   fila, envuelto en `col-span-2 sm:basis-full` (`AccionEntregar.tsx:39`): ocupa las dos columnas, o el
   renglón entero en flex, en vez de quedar apretado en media columna.
6. **Sale** una fila de cinco botones de 48px (`min-h-12`), cada uno con un `<svg aria-hidden>` y su
   palabra, y debajo, fuera del grupo, el "Ver toda la ropa de Rosa Quispe" de navegación.

## Dónde encaja en la arquitectura

- **La disposición de la fila es de `DetalleOrden`, no de `components/`.** `Boton` sabe cómo se ve un
  botón compacto (SPEC-KRILINXI-037); cómo se ordenan las acciones de una boleta es del detalle. Si
  algún día otra pantalla necesita una fila de acciones igual, ese es el momento de llevar `CLASE_FILA` a
  un componente compartido, no antes.
- **`AccionEntregar` conoce un poco la fila donde va** (el `col-span-2 sm:basis-full` de su formulario).
  Es un acoplamiento chico y a propósito: la alternativa era que `DetalleOrden` supiera cuándo el
  formulario de entrega está abierto, y ese estado es de `AccionEntregar`. Si se la usara fuera de una
  grilla o un flex, esas clases no hacen nada.

## Fundamentos

### De angosto a ancho: estilos que cambian con el tamaño de pantalla

Tailwind se escribe **primero para la pantalla chica**: una clase sin prefijo vale siempre, y una con
prefijo (`sm:`, `lg:`) vale **desde** ese ancho para arriba (`sm` son 640px). Así,
`grid grid-cols-2 sm:flex` dice: "en cualquier pantalla, grilla de dos columnas; desde 640px, en cambio,
flex". No hace falta escribir nada para "solo en chico".

Por qué dos disposiciones distintas y no una sola:

- **En angosto, grilla de dos columnas.** Con flex y `flex-wrap`, cinco botones de largos distintos
  quedan desparejos: tres en un renglón, uno solo en el siguiente, y a veces uno ocupa todo el renglón
  y parece una barra otra vez. La grilla los alinea de a dos, del mismo ancho, que es lo que pide la spec
  ("dos columnas, nunca una barra por renglón").
- **En ancho, flex.** Ahí hay lugar para todos en un renglón, cada uno del ancho de su texto, y
  `ml-auto` puede empujar Anular al final, que en una grilla no se puede.

`col-span-2` (ocupar las dos columnas) y `sm:basis-full` (ocupar el renglón entero en flex) son las dos
caras de "esto va en su propio renglón", una por cada disposición. Por eso Anular y el formulario de
entrega llevan las dos.

Un test no puede comprobar la disposición: jsdom no calcula tamaños (ver "probar el estilo leyendo la
clase" en la bitácora de SPEC-KRILINXI-037). Lo que se prueba es que se armó con esas clases; que se vea
bien en una tablet se mira a mano, en el navegador, achicando la ventana.

### Un grupo con nombre: `role="group"`

`role="group"` con `aria-label` le dice al lector de pantalla "acá empieza un conjunto de controles que
van juntos, y se llama así". Al entrar dice "Qué hacer con esta ropa, grupo", y la persona sabe que lo
que sigue son las acciones de la boleta, no más datos. Sin él son cinco botones sueltos después de una
tabla de pagos.

Es más liviano que una `<section>` (que sería una región, un punto de referencia de la página) y no
requiere un encabezado visible, que acá repetiría lo obvio (SPEC-KRILINXI-037: menos letra). De yapa,
los tests lo encuentran por su nombre: `screen.getByRole('group', { name: 'Qué hacer con esta ropa' })`,
y con eso pueden decir qué hay dentro de la fila y qué no.

**Ya explicado antes:**

- **Jerarquía visual y una sola acción principal** → SPEC-KRILINXI-037 (`specs/notas/SPEC-KRILINXI-037-jerarquia-visual.md`).
- **Probar el estilo leyendo la clase** → SPEC-KRILINXI-037 (misma bitácora).
- **Tailwind solo genera las clases escritas enteras** → SPEC-KRILINXI-037: por eso `CLASE_FILA` es un
  texto fijo y no se arma según el estado.

## Decisiones y por qué

- **Anular lleva su propio ícono (`anular`, un círculo tachado) en vez del de alerta** que `peligro` pone
  por defecto. La spec pide un ícono "que la represente", y el de alerta dice "cuidado", no "anular".
  Sigue siendo rojo y lleno, así que se distingue igual.
- **"Lavar" es una gota.** Un lavarropas dibujado en 24px no se entiende; la gota es el símbolo de lavado
  de las etiquetas de ropa. Va siempre con su palabra, así que no tiene que explicarse solo.
- **"Ver toda la ropa…" no se movió.** Ya era navegación desde SPEC-KRILINXI-037 y ya estaba fuera de la
  columna de acciones; la spec pide eso, no cambiarlo de lugar.

## Los tests

- **Reusado:** `accionesPrincipales` y `usoDe` de `frontend/src/test/jerarquia.ts` (SPEC-KRILINXI-037), y
  `abrir`, `abrirDetalle` y `buscarBoleta` del propio archivo de tests del Mostrador.
- **Generalizado:** `abrirConRopaLista` y `boton` estaban dentro del `describe` de la 037. Los dos
  `describe` los necesitaban, así que pasaron a nivel del archivo en vez de copiarlos.
- **Nuevo:** el `describe` "las acciones de la boleta en fila, con su símbolo — SPEC-KRILINXI-038" en
  `PantallaMostrador.test.tsx`, con un caso por criterio. Ningún helper nuevo: era un caso único.

## Si mañana tenés que tocar esto

- La fila está en `DetalleOrden.tsx`, desde `CLASE_FILA`. Un avance nuevo en `AVANCES` necesita su ícono
  en `ICONO_AVANCE`: TypeScript lo exige.
- Mirala a mano en el navegador, en angosto y en ancho, y con el formulario de entrega abierto: ningún
  test ve la disposición de verdad.
