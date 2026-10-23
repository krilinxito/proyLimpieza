---
id: SPEC-KRILINXI-053
name: Textos en tuteo neutro, sin voseo
slug: textos-tuteo
status: draft
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/src/**
  - backend/src/**
  - backend/tests/**
priority: medium
depends_on: []
tests: []
---

## Descripción

Los textos que ve la persona están escritos en voseo argentino ("Elegí", "Escribí", "Probá", "Revisá", "Volvé"). El público es boliviano y de edad avanzada, y el producto pide un idioma claro y neutro (CLAUDE.md §9). Esta spec reescribe todos esos textos en tuteo neutro ("Elige", "Escribe", "Prueba", "Revisa", "Vuelve"): mensajes de error de la API que la pantalla muestra tal cual, avisos, etiquetas, ayudas, confirmaciones y textos de los tests que los buscan. No cambia ninguna regla ni ninguna estructura de pantalla. "Qué deja" ya quedó resuelto en la SPEC-KRILINXI-051. Los ejemplos de código y de comandos de CLAUDE.md quedan como están, salvo los textos que ejemplifican lo que ve el usuario.

## Criterios de aceptación

- [ ] Ningún texto que vea la persona en la app usa formas de voseo (-á, -é, -í al imperativo: "Elegí", "Escribí", "Probá", "Revisá", "Volvé", "Intentá", "Fijate", "Mirá", "Tené") ni el pronombre "vos"; todos pasan a tuteo neutro.
- [ ] Los mensajes de error de la API que el frontend muestra tal cual (backend/src) están en tuteo, con el mismo significado y la misma instrucción de qué hacer.
- [ ] Un test de arquitectura (o de texto) recorre el código fuente que no es de test y falla si encuentra una forma de voseo de una lista explícita, para que no vuelva.
- [ ] Los tests que buscaban los textos viejos se actualizan a los nuevos, sin perder cobertura, y cada bloque nuevo lleva el id SPEC-KRILINXI-053 en su describe.
- [ ] No cambia ninguna regla de negocio, ruta, nombre de campo ni estructura de pantalla; la suite completa (frontend y backend) sigue en verde.
- [ ] CLAUDE.md recoge la regla: los textos de la app van en tuteo neutro.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-053', () => { ... })

Así un `grep SPEC-KRILINXI-053` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
