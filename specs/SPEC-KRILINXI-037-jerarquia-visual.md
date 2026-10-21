---
id: SPEC-KRILINXI-037
name: 'Más visual, menos letra: cada cosa con su estilo'
slug: jerarquia-visual
status: in-progress
owner: krilinxito
created: 2026-10-19
scope:
  - frontend/src/components/**
  - frontend/src/index.css
  - frontend/src/test/tema.test.ts
  - frontend/src/features/mostrador/components/**
  - frontend/src/features/ordenes/components/**
  - frontend/src/pages/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

Hoy casi todos los botones son grandes, del mismo ancho y uno debajo del otro, y casi todas las tarjetas son el mismo recuadro blanco: lo importante y lo secundario se ven igual, y hay mucho texto de explicación. Para alguien mayor, de pie en el mostrador, eso es confuso: no se ve de un vistazo qué tocar.

Esta spec fija una jerarquía visual en los componentes compartidos, para que las pantallas la usen: botones de acción principal, secundaria, de peligro y de navegación ("Volver…") que se distinguen por su forma y su peso, no solo por el color; tarjetas que se tocan distintas de las que solo informan y de las que destacan un número; y menos letra: los textos de ayuda que repiten lo que ya dice una etiqueta se quitan, y los estados y acciones llevan su ícono junto a la palabra. Se aplica al Mostrador y al Inicio, que es donde más se nota; las pantallas siguientes la adoptan en sus propias specs.

## Criterios de aceptación

- [ ] `Boton` tiene cuatro usos que se distinguen a simple vista y no solo por el color: principal (lleno), secundario (con borde), peligro y navegación (discreto, como un enlace), y un tamaño `compacto` para filas de acciones; `components/README.md` dice cuándo usar cada uno.
- [ ] `Tarjeta` distingue tres tipos: la que se toca (con señal de que lleva a algo), la que solo informa (más liviana) y la que destaca un número; cada una con su estilo del tema, en claro y en oscuro.
- [ ] Los colores nuevos que haga falta pasan el test de contraste en los dos temas (`test/tema.test.ts`).
- [ ] En el Mostrador y en el Inicio, cada pantalla tiene una sola acción principal a la vista; volver y cambiar de vista usan el estilo de navegación.
- [ ] Se quitan los textos de ayuda que repiten lo que ya dice la etiqueta o el título (por ejemplo "Buscá al cliente por su nombre, teléfono o carnet." encima de un campo que se llama así); ningún mensaje de error ni confirmación se acorta (CLAUDE.md §9).
- [ ] Cada ícono sigue yendo con su palabra (CLAUDE.md §9), salvo la excepción ya documentada del tema.
- [ ] La regla de la paleta cruda sigue cubriendo toda la app, y los tests existentes que buscan botones por su nombre siguen pasando.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-037', () => { ... })

Así un `grep SPEC-KRILINXI-037` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
