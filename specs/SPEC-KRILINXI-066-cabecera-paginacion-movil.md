---
id: SPEC-KRILINXI-066
name: Cabecera y paginación compactas en el celular
slug: cabecera-paginacion-movil
status: in-progress
owner: krilinxito
created: 2026-10-24
scope:
  - frontend/src/components/marco/**
  - frontend/src/pages/Marco.tsx
  - frontend/src/features/atencion/components/DejarDeAtender.tsx
  - frontend/src/features/auth/components/BarraSesion.tsx
  - frontend/src/components/Paginas.tsx
  - frontend/src/components/iconos.tsx
  - frontend/src/test/arquitectura.test.ts
  - frontend/DESIGN.md
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

En el celular (menos de 640 px) la cabecera ocupa dos renglones altos —menú, nombre del negocio y sucursal, tema y avatar arriba; conexión, "Dejar de atender" y Salir abajo— y se come buena parte de la pantalla. La barra de páginas, con sus dos botones con palabras y el texto, también pesa. Se compactan las dos piezas solo en angosto, sin cambiar lo que se ve desde `sm` (640 px) ni el orden del DOM. La cabecera pasa a un solo renglón bajo: el menú, "Lavandería" en letra más chica con la sucursal debajo en letra pequeña, la conexión reducida a un punto de color con su texto corto, y el avatar. El tema, "Dejar de atender" y Salir salen de la fila y se abren tras el botón del avatar, en un menú de perfil. La paginación en angosto muestra un botón con flecha, "Página 2 de 5" en letra chica y otro botón con flecha, cada uno con su nombre accesible en palabras ("Anteriores", "Siguientes"); el contador sigue a la vista siempre. Desde `sm` ambas piezas son las de siempre. Toca CLAUDE.md, DESIGN.md y el test de arquitectura, que también toca la SPEC-KRILINXI-065 (en draft): el choque es solo de documentación y se resuelve en el rebase.

## Criterios de aceptación

- [ ] En una pantalla de menos de 640 px la cabecera es de un solo renglón: el menú, el nombre del negocio con la sucursal debajo en letra pequeña, la conexión y el avatar; no existe el corte de renglón (`data-corte-de-renglon`) y su altura es menor que la actual (un test o la revisión en el navegador lo comprueba).
- [ ] En angosto, el tema, "Dejar de atender" (solo si el ADMIN atiende en una sucursal) y Salir están dentro de un menú que abre el botón del avatar (nombre accesible "Perfil" o similar); se abre con el dedo y con el teclado, se cierra con Escape o tocando fuera, y devuelve el foco al avatar.
- [ ] Salir conserva su confirmación de siempre (con el número de registros sin guardar que se perderían) y Dejar de atender conserva su comportamiento, también al activarlos desde el menú del avatar.
- [ ] La píldora de conexión en angosto es corta (un punto de color más el texto breve, "Con internet" / "Sin internet · 3 por guardar") y sigue diciendo la frase completa al tocarla; el estado nunca queda como un ícono suelto sin palabras.
- [ ] Desde 640 px la cabecera se ve como hoy (una sola fila con todas las acciones a la vista) y el orden del DOM no cambia.
- [ ] La barra de páginas, en menos de 640 px, muestra un botón con flecha, el texto "Página N de M" en letra chica y otro botón con flecha, en un solo renglón dentro de su recuadro; los botones llevan nombre accesible en palabras ("Anteriores", "Siguientes") y se apagan en la primera y la última página como hoy.
- [ ] Desde 640 px la barra de páginas muestra los botones con palabras como hoy; con la lista vacía no se dibuja, y con una sola página dice "Página 1 de 1".
- [ ] Los botones del menú de perfil y de la paginación tienen un área tocable de al menos 44 px aunque se vean chicos, y la letra no baja de lo legible para quienes usan la app (se respeta lo de PRODUCT.md).
- [ ] Todo funciona en el tema claro y en el oscuro, sin colores nuevos fuera de `index.css`, y sin jerga en pantalla.
- [ ] Los tests de arquitectura (nadie arma su propia barra de páginas, íconos solos solo en las excepciones declaradas) siguen valiendo, y CLAUDE.md y DESIGN.md reflejan el cambio.
- [ ] Tests con el id de esta spec y la suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-066', () => { ... })

Así un `grep SPEC-KRILINXI-066` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
