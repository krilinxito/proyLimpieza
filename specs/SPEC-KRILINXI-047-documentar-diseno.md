---
id: SPEC-KRILINXI-047
name: Documentar el diseño actual de la interfaz
slug: documentar-diseno
status: in-progress
owner: krilinxito
created: 2026-10-22
scope:
  - frontend/DESIGN.md
  - frontend/PRODUCT.md
  - frontend/.impeccable/**
  - frontend/src/test/disenoDocumentado.test.ts
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

La app ya tiene un sistema visual propio (el tema de src/index.css, la letra Atkinson Hyperlegible, los componentes de src/components, el marco de pantallas) pero no está escrito en ningún lado fuera del código y de las notas de cada spec. Esta spec lo registra en un DESIGN.md, derivado del código existente con la skill impeccable (/impeccable document, modo scan), junto con el PRODUCT.md que dice para quién es el producto. Es la base para pulir la interfaz en specs posteriores: quien la pula parte de lo que hay, no de lo que cree que hay.

No cambia ninguna pantalla: el diff solo trae documentación y un test. Para que el documento no se desfase en silencio, un test compara los colores del DESIGN.md con los tokens de index.css (el mismo patrón con que el proyecto ata una tabla copiada a su original). La carpeta de la skill (.claude/skills/impeccable, sus agentes y hooks) no se versiona: se versiona el resultado, no la herramienta; quien quiera usarla la instala con `npx impeccable install`.

## Criterios de aceptación

- [ ] Existe frontend/DESIGN.md con el frontmatter de tokens (colores, tipografía, radios, espaciados y componentes) y las secciones canónicas del formato en su orden (Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts), omitiendo las que no apliquen en vez de inventar reglas.
- [ ] Cada color del frontmatter existe como token en frontend/src/index.css, y el documento describe el tema claro y el oscuro (los dos bloques de tokens); no hay ningún color documentado que el código no use.
- [ ] La tipografía documentada es la del código (Atkinson Hyperlegible, propia y sin pedir nada afuera, con 18px de base), y los radios y espaciados que se documentan son los que usan los componentes.
- [ ] Los componentes compartidos de src/components (Boton con sus variantes primario, secundario, peligro y navegacion; Tarjeta con informa, destaca y toca; CampoTexto, Insignia, Aviso, ModalConfirmacion, Paginas, EnlaceBoton) están descritos con su cuándo usarlos, derivado de components/README.md y del código.
- [ ] Los patrones de pantalla quedan escritos: el marco (cabecera, menú lateral o cajón, pie), las listas paginadas, las tarjetas de dato, los gráficos del dashboard y las reglas de CLAUDE.md §9 (una sola acción principal, confirmar lo irreversible, el color nunca es lo único que dice algo) como Do's and Don'ts.
- [ ] Existe frontend/.impeccable/design.json (el complemento del DESIGN.md) coherente con él, y frontend/PRODUCT.md queda versionado junto con ellos.
- [ ] Un test (frontend/src/test/disenoDocumentado.test.ts) lee el frontmatter del DESIGN.md y falla si un color documentado no existe en index.css, y también falla si falta alguna de las secciones canónicas que el documento declara.
- [ ] No cambia ninguna pantalla ni ningún componente: el diff solo contiene PRODUCT.md, DESIGN.md, el complemento de .impeccable, el test nuevo y CLAUDE.md; la suite completa sigue verde.
- [ ] La carpeta de la skill (.claude/skills/impeccable, .claude/agents y .claude/settings.local.json) no se commitea.
- [ ] CLAUDE.md dice que PRODUCT.md y DESIGN.md existen, para qué sirven y que los colores siguen viviendo en index.css (el DESIGN.md los documenta, no los reemplaza).

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-047', () => { ... })

Así un `grep SPEC-KRILINXI-047` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
