---
id: SPEC-KRILINXI-032
name: Buscar mientras se escribe
slug: buscador-vivo
status: draft
owner: krilinxito
created: 2026-10-18
scope:
  - frontend/src/features/clientes/**
  - frontend/src/features/ordenes/api/**
  - frontend/src/components/**
  - frontend/src/lib/texto*
priority: high
depends_on: []
tests: []
---

## Descripción

Hoy se busca un cliente solo por su teléfono exacto, y la ropa por boleta o teléfono exactos, siempre tocando "Buscar" (`buscarPorTelefono`, `buscarOrdenes`). En el mostrador eso obliga a saberse el número de memoria.

Esta spec trae la búsqueda que van a usar el mostrador unificado y el registro de ropa: mientras se escribe aparecen los resultados más cercanos, por nombre (sin importar tildes ni mayúsculas: "jose" encuentra a "José"), por parte del teléfono, por carnet o por número de boleta. Todo en la base local, también sin internet (CLAUDE.md §6). Incluye un componente reutilizable, `BuscadorVivo`: un campo grande y debajo hasta 6 resultados como tarjetas tocables, con una acción fija al final (por ejemplo "Cliente nuevo"). No es un `<select>`: con miles de clientes, una lista desplegable no se puede usar. La pantalla /clientes pasa a usarlo.

## Criterios de aceptación

- [ ] Al escribir al menos 2 letras o 3 dígitos, aparecen los resultados sin tocar ningún botón; dejar de escribir unos 300 ms basta para que se actualicen.
- [ ] Se encuentra un cliente por cualquier parte de su nombre, sin importar tildes ni mayúsculas ("jose qui" encuentra a "José Quispe").
- [ ] Se encuentra un cliente por parte de su teléfono (con la misma normalización que el backend) o por su carnet.
- [ ] Se encuentra una orden de la sucursal de trabajo por su número de boleta, y las de un cliente por su nombre o teléfono.
- [ ] Se muestran como mucho 6 resultados, los que coinciden desde el principio primero; si hay más, dice "Hay más resultados: escribí un poco más".
- [ ] Una respuesta vieja nunca pisa a la nueva: si se escribe rápido, lo que queda en pantalla corresponde a lo último escrito.
- [ ] `BuscadorVivo` se usa solo con el teclado (flechas, Enter, Escape) y con el lector de pantalla (patrón combobox de ARIA, con el número de resultados anunciado).
- [ ] La acción fija ("Cliente nuevo") está siempre visible, haya resultados o no, y recibe lo escrito para no tener que volver a tipearlo.
- [ ] /clientes usa el buscador nuevo; sus tests de alta y edición siguen pasando.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-032', () => { ... })

Así un `grep SPEC-KRILINXI-032` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
