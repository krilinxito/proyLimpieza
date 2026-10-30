---
id: SPEC-KRILINXI-071
name: El admin corrige una boleta registrada
slug: admin-edita-boleta
status: draft
owner: ale186
created: 2026-10-30
scope:
  - backend/src/models/ordenes.model.ts
  - backend/src/models/ordenItems.model.ts
  - backend/src/controllers/ordenes.controller.ts
  - backend/src/controllers/ordenItems.controller.ts
  - backend/src/routes/ordenes.routes.ts
  - backend/src/routes/ordenItems.routes.ts
  - backend/tests/**
  - frontend/src/features/historial/**
priority: high
depends_on:
  - SPEC-KRILINXI-068
tests: []
---

## Descripción

Hoy el admin puede cambiar el estado y los datos de una orden en estados abiertos, pero no puede corregir una boleta ya entregada, ni cambiarle los renglones, ni pasarla a otra sucursal si el empleado la registró en la equivocada. El cliente quiere que el admin pueda arreglar cualquier error de sus empleados en una boleta registrada. Esta spec le da esa herramienta: edita el número de boleta, la descripción, los renglones, el precio, las fechas y la sucursal, desde el historial, directo a la API (el admin no tiene esa ropa en su tablet y necesita que el servidor le diga que no al momento). Corregir cobros y entregas queda en una spec aparte, admin-corrige-pagos-entregas. Editar el precio de una boleta ya entregada no cambia el precio_final de su entrega.

## Criterios de aceptación

- [ ] PATCH /api/ordenes/:id permite al ADMIN editar numero_boleta, descripcion, precio_total, fecha_entrada, fecha_estimada_salida y sucursal_id también en una boleta ENTREGADA, REEMBOLSADA o ANULADA; un EMPLEADO sigue sin poder editar una boleta cerrada ni cambiarle la sucursal (403).
- [ ] Cambiar la sucursal mueve la orden y también el sucursal_id duplicado de sus pagos, su entrega y sus renglones, todo en una sola sentencia o transacción; si algo falla no se escribe nada.
- [ ] Mover una boleta a una sucursal donde ya existe ese número de boleta responde 409, como en el alta, y mover a una sucursal cerrada responde 409 SUCURSAL_CERRADA; un test contra la base real lo comprueba.
- [ ] El admin puede agregar, cambiar y quitar renglones de una boleta (con cantidad y precio unitario válidos), y la suma de los renglones queda igual a precio_total; quitar un renglón es la única baja de esta spec y deja su fila en la auditoría con lo que había.
- [ ] Un cambio de precio que dejaría el total por debajo de lo ya cobrado responde 409 y no escribe nada.
- [ ] Cada edición deja su fila de auditoría con conAuditoria, con valores_anteriores solo de lo que cambió de verdad; un cambio de sucursal anota la anterior y la nueva, y un PATCH que no cambia nada no anota.
- [ ] En el historial completo, una boleta abierta tiene para el ADMIN un botón 'Corregir esta boleta' con un formulario (datos, renglones y sucursal) que guarda con enviar() de lib/api y no por la cola; sin conexión el botón se deshabilita con la frase de siempre.
- [ ] Cada rechazo del servidor (boleta repetida, sucursal cerrada, total menor que lo cobrado) se muestra en español, en tuteo neutro y diciendo qué hacer.
- [ ] La boleta que cambió de sucursal desaparece de la tablet de la sucursal anterior y aparece en la de la nueva al sincronizar; un test de sync rules lo comprueba para los dos buckets.
- [ ] Tests de backend y frontend con el id de esta spec, CLAUDE.md actualizado y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-071', () => { ... })

Así un `grep SPEC-KRILINXI-071` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
