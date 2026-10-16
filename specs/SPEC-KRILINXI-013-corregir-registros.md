---
id: SPEC-KRILINXI-013
name: Corregir y volver a enviar lo que el servidor rechazó
slug: corregir-registros
status: in-progress
owner: krilinxito
created: 2026-10-16
scope:
  - frontend/src/features/pendientes/**
  - frontend/src/lib/powersync/**
  - frontend/src/features/ordenes/api/ordenesLocal.ts
  - frontend/src/features/clientes/api/clientesLocal.ts
  - frontend/src/test/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

SPEC-KRILINXI-007 copia a la tabla local `para_corregir` lo que el servidor rechazó (400/403/404/409/422) y lo muestra en `/para-corregir`, pero el empleado solo puede leer el motivo y avisar. Es la deuda 'Corregir lo que el servidor rechazó' de CLAUDE.md §13.

Esta spec permite abrir un registro rechazado, corregir el dato que causó el rechazo (el caso típico: un número de boleta ya usado en la sucursal) y volver a enviarlo, o descartarlo con confirmación. Un alta rechazada nunca existió en el servidor y su fila local desaparece al sincronizar, así que reenviar es volver a escribir en la base local, a partir de lo guardado en `para_corregir`, para que la cola lo suba de nuevo; la spec decide si con el mismo id o con uno nuevo y lo justifica. Todo funciona sin internet, como el resto del mostrador.

## Criterios de aceptación

- [ ] El sistema muestra, en cada registro de /para-corregir, un botón 'Corregir' y otro 'Descartar', con el motivo del rechazo en palabras del negocio
- [ ] El sistema abre el formulario del registro con los datos que se habían enviado cuando el empleado elige 'Corregir'
- [ ] El sistema vuelve a escribir el registro corregido en la base local y lo encola para subir cuando el empleado guarda la corrección, también sin internet
- [ ] El sistema saca el registro de /para-corregir apenas se guarda la corrección, y el aviso de conexión deja de contarlo como pendiente de corregir
- [ ] El sistema vuelve a mostrar el registro en /para-corregir, con el motivo nuevo, si el servidor rechaza también la versión corregida
- [ ] El sistema pide confirmación diciendo qué se pierde antes de descartar un registro, y al confirmar lo borra de para_corregir sin enviar nada
- [ ] El sistema valida en el dispositivo la boleta corregida contra las órdenes de la sucursal antes de encolarla, con el mismo mensaje que al registrar ropa
- [ ] El sistema no muestra palabras del sistema (sinJerga) en ninguna de las pantallas nuevas

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-013', () => { ... })

Así un `grep SPEC-KRILINXI-013` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
