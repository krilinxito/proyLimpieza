---
id: SPEC-KRILINXI-029
name: El admin atiende en una sucursal
slug: admin-atiende
status: draft
owner: krilinxito
created: 2026-10-18
scope:
  - frontend/src/features/atencion/**
  - frontend/src/lib/powersync/**
  - frontend/src/pages/**
  - frontend/src/components/marco/**
  - frontend/src/features/ordenes/**
  - frontend/src/features/entregas/**
  - frontend/src/features/auth/**
  - frontend/src/test/arquitectura.test.ts
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-028
tests: []
---

## Descripción

A veces el dueño atiende el mostrador, y hoy no puede hacerlo desde su cuenta: Registrar ropa, Ropa en el local, Cobrar y Entregar ropa son solo para EMPLEADO (`soloEmpleado` en `pages/rutas.tsx`), y toman la sucursal de la sesión, que un ADMIN no tiene. Con SPEC-KRILINXI-028, PowerSync ya le puede bajar al ADMIN la ropa de una sucursal si la tablet se la pide con el parámetro `sucursal_id`.

Esta spec es la parte de la tablet. Desde el Inicio, el ADMIN elige "Atender en una sucursal" y cuál. La tablet se reconecta a PowerSync con ese parámetro, baja la ropa de esa sucursal, y el mostrador funciona igual que para un empleado, también sin internet. Lo que registra queda a su nombre (la auditoría ya toma la sucursal del registro, no la de la persona). La elección queda guardada en la tablet hasta que toque "Dejar de atender" o salga de su cuenta, así un corte de luz o de internet no lo saca del mostrador. La cabecera dice dónde está atendiendo. La sucursal de trabajo (la asignada para un EMPLEADO, la elegida para un ADMIN) sale de un único lugar, y ninguna pantalla del mostrador la vuelve a leer de la sesión por su cuenta.

## Criterios de aceptación

- [ ] El Inicio del ADMIN ofrece "Atender en una sucursal": elige entre las sucursales abiertas de la base local y confirma con "Empezar a atender".
- [ ] Al empezar, la tablet se reconecta a PowerSync con el parámetro `sucursal_id` y baja la ropa de esa sucursal; la elección queda guardada en la tablet, también sin internet y al volver a abrir la app, hasta "Dejar de atender" o Salir.
- [ ] Mientras atiende, el ADMIN usa Registrar ropa, Ropa en el local, Cobrar y Entregar ropa con la sucursal elegida: la orden se guarda con ese `sucursal_id` y la boleta se valida contra esa sucursal. Sin atender, esas pantallas le dicen cómo empezar en vez de "solo para quien atiende en una sucursal".
- [ ] La cabecera dice "Atendiendo en <sucursal>" con un botón "Dejar de atender"; al dejar, la tablet deja de bajar esa ropa, y lo que estaba sin subir se sigue subiendo (no se pierde).
- [ ] Un EMPLEADO no ve la opción y trabaja siempre en su sucursal asignada.
- [ ] Las pantallas del admin (estadísticas, personal, sucursales, quién hizo qué) siguen disponibles mientras atiende.
- [ ] La sucursal de trabajo sale de un solo lugar (un hook) y ninguna pantalla del mostrador la lee de la sesión por su cuenta; lo vigila un test de arquitectura.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-029', () => { ... })

Así un `grep SPEC-KRILINXI-029` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
