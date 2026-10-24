---
id: SPEC-KRILINXI-066
spec: specs/SPEC-KRILINXI-066-cabecera-paginacion-movil.md
explica:
  - responsive con clases de Tailwind (un DOM y dos tamaños)
---

# SPEC-KRILINXI-066 — Cabecera y paginación compactas en el celular

## Qué se construyó

En un celular (menos de 640 px) la cabecera ocupaba dos renglones altos y la barra de páginas pesaba demasiado. Ahora la cabecera es de **un
solo renglón bajo** (menú, "Lavandería" con la sucursal debajo en letra pequeña, conexión y el círculo de quien atiende), y el tema, "Dejar de
atender" y Salir se abren tras ese círculo. La paginación muestra una flecha por botón y el contador "Página 2 de 3". Desde 640 px todo se ve como antes.

## Cómo funciona, paso a paso

Se sigue a Rosa (EMPLEADO) en su celular, de abrir la app a salir.

1. `Marco` arma la cabecera (`pages/Marco.tsx:82`). Con sesión pasa por `acciones` un `<MenuPerfil nombre="Rosa Quispe">` con cuatro hijos: el tema,
   "Dejar de atender", un círculo con su inicial y `BarraSesion` (que ahora solo dibuja Salir y su confirmación). El tema ya **no** va por la prop `tema`
   de `Cabecera` cuando hay sesión; sin sesión (el ingreso) sigue suelto.
2. `Cabecera` (`components/marco/Cabecera.tsx:34`) es una fila sin `flex-wrap`, con `py-2` en angosto y `sm:py-3` desde 640 px. El bloque del nombre es
   `flex-1 min-w-0`, así que es lo único que se encoge (la sucursal se corta con `truncate`). Se quitó el corte de renglón que había puesto la 054.
3. `PildoraConexion` y el botón "Menú" bajan a 44 px de alto y letra pequeña en angosto. La píldora cambia su ícono por un punto de color en el celular;
   el **texto** ("Con internet") no cambia: es lo que dice el estado.
4. `MenuPerfil` (`components/marco/MenuPerfil.tsx`) dibuja dos cosas: un botón con el círculo (`sm:hidden`, "Opciones de Rosa Quispe") y un panel con los
   hijos. El panel es `hidden` cerrado o `flex` abierto (`:75`), y desde `sm` es `sm:contents`: deja de ser una caja y sus hijos quedan como hijos directos de
   la cabecera, en su orden de siempre. Por eso la pantalla ancha no cambia.
5. Rosa toca el círculo: `abierto` pasa a `true`, el foco va al primer botón del panel (`:42`) y el panel aparece debajo de la cabecera.
   Escape, tocar fuera o cambiar de ruta lo cierran (`:37-48`); Escape además devuelve el foco al círculo.
6. Toca Salir: `BarraSesion` abre su `ModalConfirmacion`, que está **dentro** del panel. Por eso el panel **no** se cierra al tocar Salir: si se cerrara
   (`display: none`), se llevaría el diálogo con él.
7. `Paginas` (`components/Paginas.tsx`): cada botón lleva su palabra en un `<span class="sr-only sm:not-sr-only">` y su flecha en un `<span class="sm:hidden">`.
   En angosto la palabra queda solo para el lector de pantalla y se ve la flecha; desde `sm` se ve la palabra y no la flecha.

## Dónde encaja en la arquitectura

- `components/marco/` solo recibe props y no conoce `features/` (CLAUDE.md §5). Por eso `MenuPerfil` recibe `children` y es `Marco` (en `pages/`) quien junta
  `DejarDeAtender` y `BarraSesion`, que sí son de `features/`. Si `MenuPerfil` los importara, `components/` dependería de las pantallas.
- **Una sola copia de cada pieza en el DOM.** La alternativa obvia —dibujar el tema y Salir una vez para el celular y otra para la pantalla ancha, y esconder
  una con CSS— duplica los botones para el lector de pantalla y rompe los tests, porque jsdom no aplica CSS y vería dos "Salir". Con `sm:contents` hay una copia y
  solo cambia su caja. Es una lectura mía del patrón, no una regla del repo.
- `Paginas` sigue siendo el único lugar donde se dibuja la barra (lo vigila el test de arquitectura de la 054); esto solo cambia cómo se ve.

## Fundamentos

**Responsive con clases de Tailwind (un DOM y dos tamaños).** Tailwind trabaja "primero el celular": una clase sin prefijo vale en todos los tamaños y
`sm:` la reemplaza desde 640 px. `hidden sm:contents` significa "escondido en el celular; desde 640 px, sin caja propia". Sirve para que **una misma
pieza** se acomode distinto según el ancho sin duplicarla. Sin ese patrón habría que duplicar el HTML o medir el ancho con JavaScript. Aquí:
`MenuPerfil.tsx:75` (el panel) y `Paginas.tsx:43` (la palabra del botón solo para el lector de pantalla en angosto). Las clases se escriben enteras: Tailwind
no genera las que no ve escritas.

## Si mañana tienes que tocar esto

- jsdom no mide ni aplica CSS: los tests comprueban las **clases**, no cómo se ve. Que la cabecera quepa en un celular de 360 px y quede baja es una prueba
  a mano, en el celular o en las herramientas del navegador.
- Se quitó el corte de renglón (`data-corte-de-renglon`) y los `order-*` de la 054; si ves un test que los busca, es de antes.
- Una pieza nueva en el panel va como hijo de `MenuPerfil` en `Marco.tsx`, no como pieza suelta de la cabecera.
