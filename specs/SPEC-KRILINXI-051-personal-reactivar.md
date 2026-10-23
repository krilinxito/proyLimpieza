---
id: SPEC-KRILINXI-051
name: 'Personal: volver a dar de alta y tarjetas que marcan la excepción'
slug: personal-reactivar
status: in-progress
owner: krilinxito
created: 2026-10-22
scope:
  - frontend/src/features/usuarios/**
priority: medium
depends_on:
  - SPEC-KRILINXI-047
tests: []
---

## Descripción

En /personal una cuenta dada de baja no tiene ninguna acción: si se dio de baja por error, desde la pantalla no hay camino de vuelta (una sucursal cerrada sí se puede volver a abrir, SPEC-KRILINXI-017). El backend ya lo permite: PATCH /api/usuarios acepta activo: true (usuarios.controller.ts). Además, la crítica de diseño notó que cada tarjeta lleva la insignia verde 'Activa' —marcar lo normal en todas es ruido; lo que debería destacar es la excepción— y que 'Entra como «jperez» · Administrador · Centro' mete tres datos en una sola línea.

Esta spec agrega 'Volver a dar de alta' a las cuentas dadas de baja (directo a la API con enviar(), como el resto de lo que escribe el admin, con su confirmación), quita la insignia de las activas y deja solo 'Dada de baja' como marca, y separa usuario, rol y sucursal en pares dato/valor. No cambia el backend.

## Criterios de aceptación

- [ ] Una cuenta dada de baja muestra el botón 'Volver a dar de alta'; una activa no lo muestra, y sigue mostrando 'Cambiar datos' y 'Dar de baja' (este último no en la propia cuenta del admin).
- [ ] 'Volver a dar de alta' pide confirmación con ModalConfirmacion diciendo a quién y qué pasa (vuelve a poder entrar), y al confirmar manda PATCH /api/usuarios/:id con { activo: true } por enviar() de lib/api, nunca por la base local.
- [ ] Sin internet el botón está deshabilitado y la pantalla lo dice con el aviso de siempre; si el servidor rechaza el pedido, se muestra su mensaje en palabras y la cuenta no cambia.
- [ ] Después de reactivar, el aviso dice que la lista puede tardar unos segundos en mostrarlo (como las demás escrituras del admin).
- [ ] Las cuentas activas ya no llevan la insignia 'Activa'; las dadas de baja siguen llevando 'Dada de baja' (la insignia marca solo la excepción) y la tarjeta se distingue sin depender del color, por su texto.
- [ ] Cada tarjeta muestra usuario, rol y sucursal como pares dato/valor (dt/dd) en vez de una sola línea; el nombre de usuario sigue entre comillas angulares y el texto es el del negocio (sinJerga).
- [ ] El test de arquitectura que vigila que /personal no escriba en la base local sigue en verde, y la suite completa también.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-051', () => { ... })

Así un `grep SPEC-KRILINXI-051` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
