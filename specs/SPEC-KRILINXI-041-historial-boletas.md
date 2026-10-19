---
id: SPEC-KRILINXI-041
name: Historial de boletas
slug: historial-boletas
status: draft
owner: krilinxito
created: 2026-10-19
scope:
  - frontend/src/features/historial/**
  - frontend/src/features/ordenes/api/**
  - frontend/src/pages/rutas.tsx
  - frontend/src/pages/rutas.test.ts
  - frontend/src/components/iconos.tsx
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-040
  - SPEC-KRILINXI-037
tests: []
---

## Descripción

Las boletas pasadas hoy solo se encuentran desde el Mostrador, de a una. Esta spec agrega **Historial de boletas** (/boletas): una lista con buscador vivo (SPEC-KRILINXI-032) y filtros (estado, fechas, con saldo pendiente y, para el admin, sucursal), con los estilos de SPEC-KRILINXI-037.

El EMPLEADO (o el ADMIN mientras atiende) ve los **últimos 30 días** de su sucursal de trabajo, desde la base local, también sin internet. El ADMIN ve el **historial completo** de todas las sucursales, pedido a la API (SPEC-KRILINXI-040, con `usePedidoOnline`): sin internet lo dice, como las estadísticas.

## Criterios de aceptación

- [ ] El menú tiene "Historial de boletas" para todos; cada uno ve lo que le corresponde.
- [ ] Quien atiende ve las boletas de su sucursal de trabajo de los últimos 30 días (por fecha de entrada en Bolivia), de la base local, sin pedir nada a la API, también sin internet.
- [ ] El ADMIN que no atiende ve el historial completo de todas las sucursales, de la API, paginado; sin internet dice "El historial completo necesita conexión" y no muestra una lista vacía.
- [ ] Se puede buscar mientras se escribe por número de boleta, nombre o teléfono del cliente, y filtrar por estado, por fechas y por "con saldo pendiente"; el admin, además, por sucursal. Los filtros se combinan y se pueden limpiar de un toque.
- [ ] Cada boleta de la lista muestra número, cliente, fecha de entrada, estado (insignia) y lo que falta pagar.
- [ ] Tocar una boleta de la sucursal de trabajo la abre en el Mostrador (`enlaceABoleta`); el admin que no atiende ve su detalle de solo lectura.
- [ ] Sin resultados, lo dice en palabras y ofrece limpiar los filtros.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-041', () => { ... })

Así un `grep SPEC-KRILINXI-041` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
