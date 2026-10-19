---
id: SPEC-KRILINXI-039
name: Personal y Sucursales como tarjetas con su información
slug: tarjetas-personal-sucursales
status: draft
owner: krilinxito
created: 2026-10-19
scope:
  - frontend/src/features/usuarios/components/**
  - frontend/src/features/sucursales/components/**
  - frontend/src/features/usuarios/api/**
  - frontend/src/features/sucursales/api/**
priority: medium
depends_on:
  - SPEC-KRILINXI-037
tests: []
---

## Descripción

Personal y Sucursales son una lista de recuadros uno debajo del otro, con mucho texto. Pasan a una grilla de tarjetas (dos o tres por fila en pantalla ancha, una en angosta) que muestran de un vistazo lo importante, con los tipos de tarjeta e íconos de SPEC-KRILINXI-037.

## Criterios de aceptación

- [ ] Personal se ve como una grilla de tarjetas; cada cuenta muestra su círculo con la inicial (como en la cabecera), nombre, usuario, rol y sucursal, y si está dada de baja, con una insignia.
- [ ] Sucursales se ve como una grilla de tarjetas; cada una muestra nombre, dirección, teléfono, si está abierta o cerrada, y cuántas personas trabajan ahí (de la base local).
- [ ] Las acciones de cada tarjeta (cambiar datos, dar de baja, cerrar, volver a abrir) van dentro de ella, compactas y con su ícono; las de peligro, con su estilo y su confirmación de siempre.
- [ ] En pantalla angosta, una tarjeta por fila; desde 1024px, al menos dos.
- [ ] Las altas y ediciones siguen yendo directo a la API como hoy (SPEC-KRILINXI-017); los tests de Personal y Sucursales siguen pasando.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-039', () => { ... })

Así un `grep SPEC-KRILINXI-039` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
