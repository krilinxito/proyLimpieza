---
id: SPEC-KRILINXI-031
name: Conexión en una esquina
slug: aviso-conexion-discreto
status: in-progress
owner: krilinxito
created: 2026-10-18
scope:
  - frontend/src/components/AvisoConexion*
  - frontend/src/components/marco/**
  - frontend/src/pages/Marco.tsx
  - frontend/src/pages/Marco.test.tsx
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

El aviso de conexión (SPEC-KRILINXI-007) ocupa una franja ancha arriba de cada pantalla, y en el día a día (con internet y todo guardado) es ruido. Pasa a ser una píldora chica en una esquina de la cabecera, que sigue diciendo en palabras cómo están las cosas ("Con internet", "Sin internet · 3 por guardar"). Al tocarla se abre el detalle de siempre.

Solo vuelve a ser un aviso grande, arriba del contenido, cuando hay algo que la persona tiene que hacer: registros para corregir. Se corrige CLAUDE.md §9 ("el estado de conexión está siempre visible y en palabras") para que diga esto: visible y en palabras, pero discreto salvo cuando pide una acción.

## Criterios de aceptación

- [ ] Con internet y nada pendiente, la cabecera muestra una píldora chica con el texto "Con internet", y no hay franja de aviso arriba del contenido.
- [ ] Sin internet, la píldora dice "Sin internet" y, si hay registros sin subir, cuántos ("Sin internet · 3 por guardar"), con un color que la distingue además del texto.
- [ ] Al tocar la píldora se abre el detalle con la frase completa de hoy ("Trabajando sin internet — 3 registros se guardarán cuando vuelva la conexión"), y se cierra con Escape o tocando fuera.
- [ ] Cuando hay registros para corregir, además de la píldora aparece el aviso grande arriba del contenido con el enlace a "Registros para corregir", como hoy.
- [ ] La píldora sigue siendo `role="status"` y anuncia los cambios al lector de pantalla; nunca es un ícono sin texto.
- [ ] En pantalla chica (menos de 1024px) la píldora cabe en la cabecera sin empujar el botón Salir fuera de la pantalla.
- [ ] CLAUDE.md §9 dice cómo se muestra ahora el estado de conexión.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-031', () => { ... })

Así un `grep SPEC-KRILINXI-031` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
