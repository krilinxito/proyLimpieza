---
id: SPEC-KRILINXI-071
name: El admin corrige una boleta registrada
slug: admin-edita-boleta
status: finished
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
tests:
  - backend\tests\db\correccionOrden.db.test.ts
  - backend\tests\http\ordenes.test.ts
  - backend\tests\unit\auditoria.model.test.ts
  - frontend\src\features\historial\components\CorregirBoleta.test.tsx
  - frontend\src\features\historial\correccion.test.ts
---

## Descripción

Hoy el admin puede cambiar el estado y los datos de una orden en estados abiertos, pero no puede corregir una boleta ya entregada, ni cambiarle los renglones, ni pasarla a otra sucursal si el empleado la registró en la equivocada. El cliente quiere que el admin pueda arreglar cualquier error de sus empleados en una boleta registrada. Esta spec le da esa herramienta: edita el número de boleta, la descripción, los renglones, el precio, las fechas y la sucursal, desde el historial, directo a la API (el admin no tiene esa ropa en su tablet y necesita que el servidor le diga que no al momento). Corregir cobros y entregas queda en una spec aparte, admin-corrige-pagos-entregas. Editar el precio de una boleta ya entregada no cambia el precio_final de su entrega.

## Criterios de aceptación

- [ ] PATCH /api/ordenes/:id permite al ADMIN editar numero_boleta, descripcion, precio_total, fecha_entrada, fecha_estimada_salida y sucursal_id también en una boleta ENTREGADA, REEMBOLSADA o ANULADA; un EMPLEADO sigue sin poder editar una boleta cerrada ni cambiarle la sucursal (403).
- [ ] Cambiar la sucursal mueve la orden y también el sucursal_id duplicado de sus pagos, su entrega y sus renglones, todo en una sola sentencia o transacción; si algo falla no se escribe nada.
- [ ] Mover una boleta a una sucursal donde ya existe ese número de boleta responde 409, como en el alta, y mover a una sucursal cerrada responde 409 SUCURSAL_CERRADA; un test contra la base real lo comprueba.
- [ ] El admin puede agregar, cambiar y quitar renglones de `INGRESO` de una boleta (con cantidad y precio unitario válidos), y su suma queda igual a precio_total; quitar un renglón es la única baja de esta spec y deja su fila en la auditoría con lo que había.
- [ ] Los renglones de `ENTREGA` (los cargos al entregar) no se agregan, cambian ni quitan con esta spec: intentarlo responde 400 y no escribe nada, y el formulario del historial los muestra sin poder tocarlos.
- [ ] Un cambio de precio que dejaría el total por debajo de lo ya cobrado responde 409 y no escribe nada.
- [ ] Cada edición deja su fila de auditoría con conAuditoria, con valores_anteriores solo de lo que cambió de verdad; un cambio de sucursal anota la anterior y la nueva, y un PATCH que no cambia nada no anota.
- [ ] En el historial completo, una boleta abierta tiene para el ADMIN un botón 'Corregir esta boleta' con un formulario (datos, renglones y sucursal) que guarda con enviar() de lib/api y no por la cola; sin conexión el botón se deshabilita con la frase de siempre.
- [ ] Cada rechazo del servidor (boleta repetida, sucursal cerrada, total menor que lo cobrado) se muestra en español, en tuteo neutro y diciendo qué hacer.
- [ ] La boleta que cambió de sucursal desaparece de la tablet de la sucursal anterior y aparece en la de la nueva al sincronizar; un test de sync rules lo comprueba para los dos buckets.
- [ ] Tests de backend y frontend con el id de esta spec, CLAUDE.md actualizado y suite completa en verde.

## Notas

- **Aviso de SPEC-KRILINXI-068 (2026-10-30):** cada renglón tiene un `momento`: `INGRESO` (los de la boleta, cuya suma no pasa de `precio_total`) o `ENTREGA` (los cargos agregados al entregar, que se suman encima y forman `precio_final`). Donde esta spec dice "la suma de los renglones queda igual a precio_total", vale para los de `INGRESO`. Si el admin cambia un cargo de una boleta ya entregada, hay que decidir si recalcula `precio_final` de la entrega (la descripción de esta spec hoy dice que no). Desde la 068 el EMPLEADO no edita `precio_total` (403), y corregir un renglón mal escrito queda solo en manos del admin, en esta spec.
- **Decisión (2026-11-01): los cargos al entregar no se corrigen en esta spec.** Esta spec edita solo los renglones de `INGRESO`. Los de `ENTREGA` se corrigen en `admin-corrige-pagos-entregas`, junto con los pagos y la entrega. El motivo: en una boleta entregada, el cargo, el `precio_final` y el pago forman un paquete que deja saldo 0 (SPEC-KRILINXI-056). Cambiar el cargo sin los otros dos haría que la boleta sea incoherente (cargos que no explican el precio final) o que su saldo se mueva sobre una ropa que ya salió: con deuda si el cargo sube, o con un saldo negativo, que el sistema no puede representar, si baja.
- **Decisión (2026-11-01): en una boleta ya entregada o reembolsada, cambiar los renglones de `INGRESO` (y con ellos `precio_total`) no toca `precio_final`.** Se acepta que deje de valer `precio_final = precio_total + cargos`: el precio final es lo que se cobró de verdad en el mostrador, y el saldo, que se calcula con él, no cambia. El "total menor que lo cobrado" (409) se mira contra `precio_total` mientras la boleta no se entregó.

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-071', () => { ... })

Así un `grep SPEC-KRILINXI-071` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
