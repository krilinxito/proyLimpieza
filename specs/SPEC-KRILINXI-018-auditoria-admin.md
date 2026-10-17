---
id: SPEC-KRILINXI-018
name: 'Consultar la auditoría: quién hizo qué'
slug: auditoria-admin
status: in-progress
owner: krilinxito
created: 2026-10-16
scope:
  - frontend/src/features/auditoria/**
  - frontend/src/pages/rutas.tsx
  - frontend/src/test/**
  - frontend/src/App.test.tsx
  - frontend/src/components/Paginas.tsx
  - frontend/src/features/estadisticas/components/SeccionClientes.tsx
  - frontend/src/features/estadisticas/components/PantallaEstadisticas.test.tsx
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-015
tests: []
---

## Descripción

El backend expone `GET /api/auditoria` (SPEC-ALE186-012), paginado, con filtros por fechas, persona, acción, tabla, registro y sucursal, y `?revisar=true` para lo que subió una cuenta dada de baja (SPEC-ALE186-018). Cada registro trae `fecha` (cuándo llegó al servidor) y `fechaDelHecho` (cuándo pasó según la tablet, SPEC-ALE186-015). La auditoría no baja a ningún dispositivo, así que se lee online, con el patrón de SPEC-KRILINXI-015.

Esta spec agrega '¿Quién hizo qué?' al menú del admin, con la lista, los filtros y el detalle de cada registro en palabras del negocio.

## Criterios de aceptación

- [ ] El sistema muestra '¿Quién hizo qué?' en el menú solo al ADMIN, y a un EMPLEADO le muestra el aviso de solo administrador
- [ ] El sistema lista los registros de la auditoría pidiéndolos a GET /api/auditoria, paginados, del más nuevo al más viejo
- [ ] El sistema muestra en cada registro quién, qué hizo (en palabras: 'Registró ropa', 'Cobró', 'Entregó'), sobre qué, en qué sucursal y cuándo pasó; "sobre qué" nombra clientes, personal y sucursales con los datos de la tablet, y de ropa, cobros y entregas dice solo el tipo (decidido al implementar: el admin no tiene esos registros en su tablet)
- [ ] El sistema muestra cuándo llegó al servidor, además de cuándo pasó, cuando las dos fechas difieren
- [ ] El sistema filtra por período, persona, acción, sucursal y tipo de registro, y envía esos filtros a la API
- [ ] El sistema muestra, en el detalle de una edición, los valores anteriores que cambiaron, y de una contraseña solo que fue cambiada
- [ ] El sistema marca los registros para revisar y permite ver solo esos con un filtro 'Para revisar'
- [ ] El sistema muestra 'Esta consulta necesita conexión' sin conexión, en vez de una lista vacía
- [ ] El sistema no muestra palabras del sistema (sinJerga) en la pantalla

## Notas

**Decidido al implementar:**
- "Sobre qué": la respuesta de `GET /api/auditoria` trae la tabla y el id, no la boleta ni el cliente, y el admin no tiene en su tablet la ropa, los cobros ni las entregas (el bucket `sucursal` le llega vacío). Esos se muestran por su tipo. Mostrar el número de boleta pide una spec del backend que agregue un resumen a cada registro (anotada en CLAUDE.md §13).
- Sin fechas elegidas, los últimos 30 días, como el backend y la historia del panel.
- La acción y el tipo de registro se eligen juntos, en una sola lista en palabras ("Ropa registrada", "Cobros", "Entradas al sistema"…), que manda `accion`, `tabla` o los dos.
- De paso se corrigieron dos carreras en tests de SPEC-KRILINXI-016 (esperaban el título en vez del pedido, y las sucursales sin esperar a la base local).

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-018', () => { ... })

Así un `grep SPEC-KRILINXI-018` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
