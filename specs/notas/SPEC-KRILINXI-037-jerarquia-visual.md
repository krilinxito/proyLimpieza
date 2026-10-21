---
id: SPEC-KRILINXI-037
spec: specs/SPEC-KRILINXI-037-jerarquia-visual.md
explica:
  - jerarquia visual (forma ademas del color y una sola accion principal)
  - probar el estilo leyendo la clase (jsdom no pinta)
  - tailwind solo genera las clases escritas enteras
---

# SPEC-KRILINXI-037 — Más visual, menos letra: cada cosa con su estilo

## Qué se construyó

Hasta acá casi todos los botones eran grandes, del mismo ancho y apilados, y todas las tarjetas el
mismo recuadro blanco: "Empezar a lavar", "Cobrar", "Anular" y "Volver" pesaban lo mismo. Ahora cada
cosa tiene su estilo: una sola acción principal llena por pantalla, las secundarias con borde, lo
peligroso en rojo y con su ícono, y volver o cambiar de vista como un enlace subrayado. Las tarjetas
que se tocan llevan borde firme, sombra y una flecha; las que solo informan son más livianas, y "Cobrado
hoy" destaca. Se aplicó al Mostrador y al Inicio; el resto de las pantallas lo adopta en sus specs.

## Cómo funciona, paso a paso

El caso: en el Mostrador se abre la boleta 000001, que está RECIBIDA. ¿Cómo decide la pantalla qué
botón es el principal y cómo termina pintado?

1. **El detalle elige su acción principal.** `DetalleOrden` parte los avances posibles en el
   siguiente y el resto (`frontend/src/features/ordenes/components/DetalleOrden.tsx:82`). Para RECIBIDO
   el siguiente es "Empezar a lavar", que se dibuja con el `Boton` por defecto, `primario` (`:155`).
   Los demás avances van `secundario`.
2. **Le avisa a quien agrega acciones si la suya es la principal.** `accionesExtra` recibe ahora un
   tercer argumento, `{ principal: !siguiente }` (`DetalleOrden.tsx:161`). La ficha del cliente lo
   pasa a `AccionEntregar` (`frontend/src/features/mostrador/components/FichaCliente.tsx:71`), que
   elige su variante con eso (`frontend/src/features/entregas/components/AccionEntregar.tsx:25`). Con
   la ropa RECIBIDA, "Entregar la ropa" es secundario; con la ropa LISTA (sin avances), es el principal.
3. **Lo que no es el paso siguiente baja de peso.** Cobrar y Anular van en una fila, con
   `tamano="compacto"` (`DetalleOrden.tsx:162` en adelante). Anular es `peligro`.
4. **El Mostrador cede su principal.** "Registrar ropa", arriba de todo, es primario salvo cuando hay
   una boleta abierta, que trae la suya (`frontend/src/features/mostrador/components/PantallaMostrador.tsx:174`).
5. **Del nombre de la variante a las clases.** `Boton` no tiene colores propios: llama a
   `estiloBoton(variante, tamano)` (`frontend/src/components/Boton.tsx:93`), que junta las clases de
   cuatro tablas de `frontend/src/components/estilosBoton.ts` —color (`:21`), hover (`:32`), medidas
   (`:47`)— y decide el ancho (`:65`). Antes, `Boton` agrega lo de deshabilitado, y si la variante es
   `peligro` o `navegacion` y no se le pasó ícono, pone el de alerta o la flecha (`Boton.tsx:11` y `:72`).
6. **Sale** un `<button>` con `bg-marca … w-full` para "Empezar a lavar", `min-h-12 … bg-peligro` para
   Anular y `underline bg-transparent … w-auto` para "Ver toda la ropa de Rosa Quispe".

Las tarjetas siguen el mismo camino con `ESTILO_TARJETA` (`frontend/src/components/Tarjeta.tsx:16`):
`Tarjeta` usa `informa` o `destaca`, y `TarjetaOrden` y la fila del Inicio, que son un `<button>` y un
`<Link>`, toman `ESTILO_TARJETA.toca` y agregan `<SenalTocable />`
(`frontend/src/features/ordenes/components/TarjetaOrden.tsx:24` y `:40`).

## Dónde encaja en la arquitectura

- **`components/` decide cómo se ve cada uso; la feature decide qué uso le toca a cada botón.**
  `Boton` no sabe nada de boletas; `DetalleOrden` sabe que el próximo avance es lo que hay que hacer.
  Es la misma partición que `Insignia` y `TONO_ESTADO` (SPEC-KRILINXI-025). Si una pantalla pintara su
  botón con clases a mano, el día que cambie el estilo de "navegación" quedaría desparejo, y la regla de
  la paleta cruda (`test/arquitectura.test.ts`) no la atraparía: usaría colores del tema, pero no la
  jerarquía.
- **`estilosBoton.ts` es solo datos y una función pura.** No es un componente: lo comparten `Boton` y
  `EnlaceBoton`, que siguen siendo distintos porque uno hace algo y el otro lleva a otro lado
  (SPEC-KRILINXI-024). Así "Ver las estadísticas" (enlace) y "Ver toda la ropa en el local" (botón) se
  ven iguales sin ser lo mismo.
- **El cambio de `AccionEntregar` cae fuera del `scope` declarado** (`features/entregas/`). Fue
  inevitable: sin él, una boleta RECIBIDA mostraba dos principales ("Empezar a lavar" y "Entregar la
  ropa"). Se quitó también el texto de ayuda de "Atender en una sucursal" (`features/atencion/`) y se
  pasó a navegación "Ver las estadísticas" (`features/estadisticas/`): los dos están en el Inicio, que
  la spec sí nombra.

## Fundamentos

### Jerarquía visual: la forma además del color

Una pantalla tiene jerarquía cuando, sin leer, se ve qué es lo importante. Se logra con **peso** (lleno
contra hueco, grande contra chico, con sombra o sin ella) y con **posición**, no solo con el color: un
8% de los hombres no distingue bien el rojo del verde, y bajo la luz de un mostrador un azul y un gris
se confunden. Por eso cada variante de `estilosBoton.ts` tiene una forma propia: `primario` lleno y de
todo el ancho, `secundario` con borde, `peligro` con su ícono de alerta (`Boton.tsx:11`), `navegacion`
sin caja y subrayado. Si les sacás el color, todavía se distinguen.

La otra mitad es **una sola acción principal por pantalla**. Dos botones llenos se anulan: la persona
tiene que leer los dos para decidir. Con uno, el ojo va directo. El resto se ofrece, pero más bajo:
`tamano="compacto"` (48px, todavía cómodo para el dedo; lo normal es 56px).

Sin esto, que era lo de antes, "Anular" (lleno de rojo) era lo que más llamaba la atención de una
boleta: exactamente lo que menos se quiere tocar sin querer.

### Tailwind solo genera las clases que ve escritas enteras

Tailwind no ejecuta tu código: **lee los archivos como texto** y busca cosas que parezcan clases.
Genera CSS solo para las que encuentra. Si una clase se arma en tiempo de ejecución, nunca aparece
entera en el texto y no se genera: el botón sale sin ese estilo, y ningún test de jsdom lo nota (jsdom
no aplica CSS).

Pasó durante esta spec: la primera versión de `estilosBoton.ts` hacía
`VARIANTE[variante].replaceAll('hover:', 'enabled:hover:')`. En el código no figuraba
`enabled:hover:bg-marca-fuerte` por ningún lado, así que en la tablet el botón no habría reaccionado al
pasarle por encima. Por eso hay dos tablas con las clases escritas enteras, `HOVER_BOTON` y
`HOVER_ENLACE` (`estilosBoton.ts:32` y `:39`), aunque se parezcan. Lo mismo vale para las medidas de la
navegación (`px-1` en vez de `px-6`), que están escritas en `TAMANO.suelto` en vez de sacarse con un
`replace`. La regla: **elegir entre clases completas está bien, armarlas con pedazos no.** Para
comprobarlo, después de `npx vite build`, `grep -c decoration-4 dist/assets/*.css` tiene que dar 1.

(¿Por qué dos tablas de hover? `enabled:` hace que un botón deshabilitado no reaccione; pero un enlace
no tiene estado "habilitado", `:enabled` no lo alcanza nunca, y con esa clase el enlace no reaccionaría
jamás.)

### Probar el estilo leyendo la clase

jsdom no pinta, así que un test no puede "ver" que un botón resalta. Lo que sí puede es leer con qué
estilo se armó: cada uso deja una clase que lo delata (`bg-marca` para el principal, `underline` con
`bg-transparent` para la navegación). `frontend/src/test/jerarquia.ts` concentra esa lectura en dos
funciones, así los tests dicen lo que importa y no repiten nombres de clases:

```ts
expect(accionesPrincipales()).toEqual(['Empezar a lavar']);
expect(usoDe(boton('Ver toda la ropa de Rosa Quispe'))).toBe('navegacion');
```

El límite: comprueba que se eligió el estilo correcto, no que el navegador lo pinte bien. Eso último lo
cubren el test del tema (los colores) y la prueba a mano de §4 del CLAUDE.md.

**Ya explicado antes:**

- **Contraste WCAG** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`). Los pares
  nuevos (`marca` sobre `fondo`, `texto-suave` sobre `marca-suave`) se agregaron a `test/tema.test.ts`.
- **El tema como variables** → SPEC-KRILINXI-030 (`specs/notas/SPEC-KRILINXI-030-tema-oscuro.md`). No hizo
  falta ningún color nuevo: los estilos nuevos combinan tokens que ya existían en los dos temas.
- **Enlace o botón según lo que hace** → SPEC-KRILINXI-024 (`specs/notas/SPEC-KRILINXI-024-inicio-ingreso.md`).
- **Tarjeta tocable con nombre accesible corto** → SPEC-KRILINXI-024 (misma bitácora).
- **Qué puede ir dentro de un botón** → SPEC-KRILINXI-025 (`specs/notas/SPEC-KRILINXI-025-estilo-mostrador.md`):
  es la razón de `ESTILO_TARJETA.toca` en vez de un `tipo="toca"` en `Tarjeta`.
- **Helper de test** → SPEC-KRILINXI-001 (`specs/notas/SPEC-KRILINXI-001-frontend-scaffold.md`).

## Decisiones y por qué

- **`peligro` sigue lleno de rojo, pero siempre con ícono.** Se probó la idea de un peligro "con borde
  rojo", más discreto en el detalle; pero el mismo botón confirma en `ModalConfirmacion` ("Sí, anular"),
  donde tiene que ser fuerte. Se dejó lleno y se bajó de peso con `compacto` donde no es el paso siguiente.
- **La navegación lleva la flecha de volver por defecto.** Casi todos los usos son "Volver…" o "Ver
  toda…", que vuelven a una vista anterior. Un `EnlaceBoton` de navegación no la pone sola: "Ver las
  estadísticas" lleva adelante, y usa su propio ícono.
- **Los enlaces siguen siendo del ancho de su texto**, como desde SPEC-KRILINXI-024; solo el `Boton`
  normal (no de navegación) ocupa todo el ancho.
- **"Cobrado hoy" destaca; "Cuentas" de una boleta no.** "Falta pagar" va en rojo o verde, y sobre el
  azul suave de `destaca` se veía mal. Cuentas quedó como `informa`, con su número grande de siempre.
- **El texto de ejemplo de la spec ya no existía** ("Buscá al cliente por su nombre…" se fue en
  SPEC-KRILINXI-032). En el alcance quedaba uno: "Para registrar, cobrar o entregar ropa…" debajo de
  "Atender en una sucursal", que el título y el botón ya dicen. Los mensajes de error, "no hay nada" y
  confirmaciones no se tocaron.

## Los tests

- **Reusado:** la base local de prueba, `renderEnRuta`, `elegirEnBuscador` y las filas de prueba. Los
  tests del Mostrador agregan una boleta LISTA sin entrega a los datos de siempre, para ver que la
  principal cambia con el estado.
- **Creado:** `frontend/src/test/jerarquia.ts`, con `usoDe(elemento)` y `accionesPrincipales(dentro?)`.
  Es un helper y no un test suelto porque la spec dice que las demás pantallas adoptan la jerarquía en
  specs propias: cada una va a querer decir "una sola principal" en una línea. Por defecto mira dentro
  de `main`, así el menú y la cabecera del marco no cuentan.
- **Actualizado:** `estilos.test.tsx` pedía `bg-superficie` en "Cobrado hoy"; ahora es la tarjeta que
  destaca (`bg-marca-suave`). Los tests que buscan botones por su nombre no cambiaron.

## Si mañana tenés que tocar esto

- Para cambiar cómo se ve un uso, `components/estilosBoton.ts` o `ESTILO_TARJETA` en `Tarjeta.tsx`. Las
  clases van escritas enteras (ver arriba).
- Para pasar otra pantalla a la jerarquía: elegí su única principal, lo que vuelve a `navegacion`, y una
  fila `compacto` para lo demás; después `accionesPrincipales()` en su test. La tabla de
  `components/README.md` dice cuándo va cada uno.
- `usoDe` reconoce los usos por sus clases. Si cambiás `bg-marca` o `underline` en `estilosBoton.ts`,
  cambialo también en `test/jerarquia.ts`.
