---
id: SPEC-KRILINXI-052
name: Carácter visual propio sin romper contraste ni tema oscuro
slug: caracter-visual
status: draft
owner: krilinxito
created: 2026-10-22
scope:
  - frontend/src/index.css
  - frontend/src/components/Tarjeta.tsx
  - frontend/src/components/piezas.test.tsx
  - frontend/src/test/tema.test.ts
  - frontend/DESIGN.md
  - frontend/.impeccable/design.json
priority: low
depends_on:
  - SPEC-KRILINXI-047
  - SPEC-KRILINXI-048
  - SPEC-KRILINXI-049
  - SPEC-KRILINXI-050
  - SPEC-KRILINXI-051
tests: []
---

## Descripción

La crítica de diseño concluyó que el contenido de la app está pensado para este negocio (vocabulario, flujos, la letra Atkinson Hyperlegible) pero su piel visual es genérica: un azul de SaaS, tarjetas redondeadas y nada que diga lavandería ni Bolivia. PRODUCT.md deja la marca abierta ('el tema azul actual puede evolucionar'), y el usuario pidió darle algo de carácter. El detector además marcó el borde grueso de un solo lado en Tarjeta 'destaca' (border-l-8), redundante con su fondo y su borde.

Esta spec propone y aplica un acento o detalle propio —elegido con la persona, con /impeccable colorize o delight, partiendo del DESIGN.md— y lo hace en un solo lugar: los tokens de src/index.css, en el bloque claro y en el oscuro, con su par de contraste en test/tema.test.ts, y el DESIGN.md y su complemento actualizados en el mismo PR (el test de SPEC-KRILINXI-047 los ata). Va después de las cuatro anteriores porque toca colores que esas pantallas usan. No cambia la estructura de ninguna pantalla ni los componentes más allá de Tarjeta 'destaca'.

## Criterios de aceptación

- [ ] Antes de implementar se acuerda con la persona el detalle visual (qué acento o carácter, y dónde se nota); la decisión queda escrita en la bitácora de la spec y en el DESIGN.md.
- [ ] Todo color nuevo o cambiado se define solo en src/index.css, en el bloque claro (@theme) y en el oscuro ([data-tema='oscuro']), y los componentes lo usan por su token, sin paleta cruda (lo vigila el test de arquitectura).
- [ ] test/tema.test.ts mide el contraste de cada par nuevo o cambiado en los dos temas y pasa con AA (4.5:1 para texto, 3:1 para bordes y elementos de interfaz).
- [ ] Los colores de las series de los gráficos (serie-1…4 y antiguedad-1…3) siguen siendo distinguibles entre sí para daltonismo, o se vuelve a validar el conjunto y queda anotado en la bitácora.
- [ ] Tarjeta 'destaca' ya no usa border-l-8: se distingue por su fondo y su borde completo, sin pérdida de contraste, y el detector de impeccable no vuelve a marcar el rasgo en ese archivo.
- [ ] frontend/DESIGN.md y frontend/.impeccable/design.json describen el sistema actualizado, y src/test/disenoDocumentado.test.ts (SPEC-KRILINXI-047) pasa sin excepciones nuevas: ningún color queda sin documentar ni documentado de más.
- [ ] Ninguna pantalla cambia de estructura ni de texto, y la suite completa sigue en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-052', () => { ... })

Así un `grep SPEC-KRILINXI-052` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
