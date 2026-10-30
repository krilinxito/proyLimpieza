---
id: SPEC-KRILINXI-068
name: Precio unitario por renglón en la boleta
slug: precio-unitario-boleta
status: draft
owner: ale186
created: 2026-10-30
scope:
  - backend/migraciones/007_orden_items.sql
  - backend/src/models/ordenes.model.ts
  - backend/src/models/ordenItems.model.ts
  - backend/src/controllers/ordenes.controller.ts
  - backend/src/controllers/ordenItems.controller.ts
  - backend/src/routes/ordenItems.routes.ts
  - backend/src/routes/index.ts
  - backend/tests/**
  - docker/powersync/sync-rules.yaml
  - frontend/src/lib/powersync/**
  - frontend/src/features/ordenes/api/**
  - frontend/src/features/ordenes/components/FormularioRopa.tsx
  - frontend/src/features/ordenes/components/DetalleOrden.tsx
  - frontend/src/features/mostrador/**
  - frontend/src/features/pendientes/**
priority: high
depends_on: []
tests: []
---

## Descripción

Hoy el empleado escribe a mano el precio total de la boleta y una descripción libre. El cliente pidió registrar el precio unitario de cada prenda y que el total se calcule solo. Se agrega la tabla orden_items (un renglón por tipo de prenda o servicio, con cantidad decimal para admitir kilos y su precio unitario), y la pantalla Registrar ropa pasa de 'descripción y total' a renglones con su subtotal y un total calculado. El precio vive en el renglón y no en un catálogo, a propósito: si mañana cambia el precio de una camisa, las boletas viejas no cambian. ordenes.precio_total se queda (entregas, saldos, estadísticas y la tablet ya dependen de esa columna) y se guarda igual a la suma de los renglones. orden_items lleva su propio sucursal_id duplicado, como pagos y entregas, porque las sync rules no admiten JOINs. Reserva la migración 007 (la 006 es de estados-simplificados). Un catálogo de precios sugeridos queda fuera de esta spec.

## Criterios de aceptación

- [ ] La migración 007 crea orden_items (id UUID, orden_id, sucursal_id, descripcion hasta 150 caracteres, cantidad NUMERIC(10,2) mayor que 0, precio_unitario NUMERIC(10,2) mayor o igual que 0) con índices por orden_id y por sucursal_id, sin tocar la línea base; un test contra la base real comprueba las restricciones.
- [ ] Las sync rules bajan orden_items en los buckets sucursal y atencion_admin, con lista explícita de columnas y sin JOINs; syncRules.test comprueba que un EMPLEADO solo recibe los de su sucursal y que sin el parámetro del ADMIN no baja ninguno; el schema local de la tablet declara la tabla y su test lo compara con las sync rules.
- [ ] POST /api/orden-items recibe un renglón con id generado por el dispositivo, es idempotente por id, copia la sucursal de la orden en el mismo INSERT … SELECT, deja su fila de auditoría con conAuditoria y rechaza con 409 los renglones de una orden anulada, entregada o reembolsada.
- [ ] El servidor rechaza con 409 el renglón que haría que la suma de los renglones de la orden pase de su precio_total, de modo que al terminar de subir la suma es exactamente el total; un test contra la base real lo comprueba con renglones subidos en cualquier orden.
- [ ] Registrar ropa pide al menos un renglón con descripción, cantidad y precio unitario, muestra el subtotal de cada renglón y el total calculado en centavos enteros con lib/money, y ya no deja escribir el total a mano; cantidad con decimales (por ejemplo 2,5 kilos) vale.
- [ ] Guardar la boleta escribe la orden (con precio_total igual al total calculado), sus renglones y el adelanto opcional en una sola transacción local, y la cola sube la orden antes que sus renglones.
- [ ] La descripción de la orden se arma sola a partir de los renglones ('2 Camisa, 1 Edredón king') para que el buscador, el historial y las boletas anteriores sigan funcionando sin cambios.
- [ ] El detalle de una boleta, en el Mostrador y en el historial, lista sus renglones con cantidad, precio unitario y subtotal; una boleta anterior, sin renglones, sigue mostrando su descripción como hasta ahora.
- [ ] GET /api/ordenes trae los renglones de cada boleta en la misma consulta, sin una consulta por boleta.
- [ ] Un renglón que el servidor rechaza cae en Para corregir como cualquier otro registro rechazado, y se puede corregir o descartar desde ahí.
- [ ] Tests de backend y frontend con el id de esta spec, CLAUDE.md actualizado y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-068', () => { ... })

Así un `grep SPEC-KRILINXI-068` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
