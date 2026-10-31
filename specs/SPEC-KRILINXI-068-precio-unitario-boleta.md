---
id: SPEC-KRILINXI-068
name: Precio unitario por renglón en la boleta
slug: precio-unitario-boleta
status: finished
owner: ale186
created: 2026-10-30
scope:
  - backend/migraciones/007_orden_items.sql
  - backend/src/models/ordenes.model.ts
  - backend/src/models/ordenItems.model.ts
  - backend/src/models/entregas.model.ts
  - backend/src/controllers/ordenes.controller.ts
  - backend/src/controllers/ordenItems.controller.ts
  - backend/src/controllers/entregas.controller.ts
  - backend/src/routes/ordenItems.routes.ts
  - backend/src/routes/index.ts
  - backend/tests/**
  - docker/powersync/sync-rules.yaml
  - frontend/src/lib/powersync/**
  - frontend/src/features/ordenes/api/**
  - frontend/src/features/ordenes/components/FormularioRopa.tsx
  - frontend/src/features/ordenes/components/DetalleOrden.tsx
  - frontend/src/features/entregas/**
  - frontend/src/features/mostrador/**
  - frontend/src/features/pendientes/**
priority: high
depends_on: []
tests:
  - backend\tests\db\auditoria.db.test.ts
  - backend\tests\db\entregas.db.test.ts
  - backend\tests\db\ordenItems.db.test.ts
  - backend\tests\http\entregas.test.ts
  - backend\tests\http\ordenItems.test.ts
  - backend\tests\http\ordenes.test.ts
  - backend\tests\http\ordenesHistorial.test.ts
  - backend\tests\unit\dominio.test.ts
  - backend\tests\unit\entregas.model.test.ts
  - backend\tests\unit\money.test.ts
  - backend\tests\unit\ordenItems.model.test.ts
  - backend\tests\unit\syncRules.test.ts
  - frontend\src\features\auditoria\describir.test.ts
  - frontend\src\features\entregas\api\entregasLocal.test.ts
  - frontend\src\features\historial\api\historialApi.test.ts
  - frontend\src\features\historial\components\PantallaHistorial.test.tsx
  - frontend\src\features\mostrador\components\EntregarEnMostrador.test.tsx
  - frontend\src\features\mostrador\components\PantallaMostrador.test.tsx
  - frontend\src\features\mostrador\components\RegistrarEnMostrador.test.tsx
  - frontend\src\features\ordenes\api\ordenesLocal.test.ts
  - frontend\src\features\ordenes\components\ListaDeRenglones.test.tsx
  - frontend\src\features\ordenes\renglones.test.ts
  - frontend\src\features\pendientes\api\corregirLocal.test.ts
  - frontend\src\features\pendientes\components\PantallaParaCorregir.test.tsx
  - frontend\src\lib\dominio.test.ts
  - frontend\src\lib\money.test.ts
  - frontend\src\lib\powersync\conector.test.ts
  - frontend\src\lib\powersync\schema.test.ts
  - frontend\src\test\arquitectura.test.ts
---

## Descripción

Hoy el empleado escribe a mano el precio total de la boleta y una descripción libre. El cliente pidió registrar el precio unitario de cada prenda y que el total se calcule solo. Se agrega la tabla orden_items (un renglón por tipo de prenda o servicio, con cantidad decimal para admitir kilos y su precio unitario), y la pantalla Registrar ropa pasa de 'descripción y total' a renglones con su subtotal y un total calculado. El precio vive en el renglón y no en un catálogo, a propósito: si mañana cambia el precio de una camisa, las boletas viejas no cambian. ordenes.precio_total se queda (entregas, saldos, estadísticas y la tablet ya dependen de esa columna) y se guarda igual a la suma de los renglones. orden_items lleva su propio sucursal_id duplicado, como pagos y entregas, porque las sync rules no admiten JOINs. Reserva la migración 007 (la 006 es de estados-simplificados). Un catálogo de precios sugeridos queda fuera de esta spec.

**Los cargos al entregar también son renglones.** Hoy el formulario de entrega tiene un campo libre "Precio final" (`entregas.precio_final`), que deja cambiar el precio sin decir por qué. Esta spec lo reemplaza: al entregar, el empleado puede **agregar uno o más renglones de cargo** (por ejemplo "Recargo por almacenamiento · 1 × 15,00", con la descripción que quiera), y el precio final sale solo: `precio_total` + la suma de los cargos. Cada renglón sabe en qué momento se agregó (`momento`: `INGRESO` al registrar la boleta, `ENTREGA` al entregarla). Al entregar **solo se puede sumar**: un renglón nunca es negativo (§3), así que ya no hay forma de entregar por menos del total. El caso de "no paga lo que falta" lo cubre SPEC-KRILINXI-070 (reembolso).

**Quién cambia el precio.** El empleado ya no edita `precio_total` de ninguna boleta: el total es la suma de sus renglones de ingreso y lo único que puede hacer después es agregar cargos al entregar. Corregir un renglón mal escrito, o el precio de una boleta, es del admin, en SPEC-KRILINXI-071.

## Criterios de aceptación

- [ ] La migración 007 crea orden_items (id UUID, orden_id, sucursal_id, momento `INGRESO` o `ENTREGA`, descripcion hasta 150 caracteres, cantidad NUMERIC(10,2) mayor que 0, precio_unitario NUMERIC(10,2) mayor o igual que 0) con índices por orden_id y por sucursal_id, sin tocar la línea base; un test contra la base real comprueba las restricciones.
- [ ] Las sync rules bajan orden_items en los buckets sucursal y atencion_admin, con lista explícita de columnas y sin JOINs; syncRules.test comprueba que un EMPLEADO solo recibe los de su sucursal y que sin el parámetro del ADMIN no baja ninguno; el schema local de la tablet declara la tabla y su test lo compara con las sync rules.
- [ ] POST /api/orden-items recibe un renglón con id generado por el dispositivo, es idempotente por id, copia la sucursal de la orden en el mismo INSERT … SELECT, deja su fila de auditoría con conAuditoria y rechaza con 409 los renglones de una orden anulada, entregada o reembolsada.
- [ ] El servidor rechaza con 409 el renglón de `INGRESO` que haría que la suma de los renglones de ingreso de la orden pase de su precio_total; un test contra la base real lo comprueba con renglones subidos en cualquier orden. Esto evita que la suma supere el total, pero no garantiza que lo alcance: si un renglón se rechaza, la boleta queda con menos renglones que su total hasta que se corrija en Para corregir (ver Notas).
- [ ] Los renglones de `ENTREGA` (cargos) no tienen tope: se suman encima de precio_total.
- [ ] PATCH /api/ordenes rechaza con 403 un cambio de precio_total pedido por un EMPLEADO, tenga o no renglones la boleta; el formulario del mostrador no ofrece cambiarlo.
- [ ] Registrar ropa pide al menos un renglón con descripción, cantidad y precio unitario, muestra el subtotal de cada renglón y el total calculado en centavos enteros con lib/money, y ya no deja escribir el total a mano; cantidad con decimales (por ejemplo 2,5 kilos) vale.
- [ ] Guardar la boleta escribe la orden (con precio_total igual al total calculado), sus renglones y el adelanto opcional en una sola transacción local, y la cola sube la orden antes que sus renglones.
- [ ] La descripción de la orden se arma sola a partir de los renglones de ingreso ('2 Camisa, 1 Edredón king') para que el buscador, el historial y las boletas anteriores sigan funcionando sin cambios.
- [ ] El formulario de entrega ya no tiene el campo libre "Precio final": en su lugar, "Agregar un cargo" suma renglones de `ENTREGA` (descripción, cantidad y precio unitario, con su subtotal), y el precio final y lo que falta pagar se recalculan en centavos con lib/money a medida que se agregan o se quitan antes de entregar.
- [ ] Entregar escribe en una sola transacción local, y en este orden para la cola, los cargos, el pago final y la entrega (como el pago antes de la entrega de SPEC-KRILINXI-056); una boleta anterior, sin renglones, también acepta cargos sobre su precio_total.
- [ ] POST /api/entregas calcula el precio final en el servidor (precio_total + la suma de los renglones de `ENTREGA` de la orden), en la misma sentencia que inserta la entrega y comprueba el saldo; si el `precio_final` que manda la tablet no coincide, responde 409 y no escribe nada, así una entrega cuyo cargo fue rechazado (o una de una versión anterior con un precio libre) va a Para corregir. Un test contra la base real lo comprueba.
- [ ] El detalle de una boleta, en el Mostrador y en el historial, lista sus renglones con cantidad, precio unitario y subtotal, con los cargos de la entrega aparte ("Cargos al entregar"); una boleta anterior, sin renglones, sigue mostrando su descripción como hasta ahora.
- [ ] GET /api/ordenes trae los renglones de cada boleta (con su momento) en la misma consulta, sin una consulta por boleta.
- [ ] Un renglón que el servidor rechaza cae en Para corregir como cualquier otro registro rechazado, y se puede corregir o descartar desde ahí.
- [ ] Tests de backend y frontend con el id de esta spec, CLAUDE.md actualizado (incluido el aviso de `docker compose restart powersync` después del pull, porque cambian las sync rules) y suite completa en verde.

## Notas

- **Decisión (2026-10-30): al entregar solo se suma** (opción A). Se descartaron un renglón de descuento (un monto que resta) y mantener el precio final libre para bajar. Consecuencia aceptada: ya no se puede entregar por menos del total; para no cobrar lo que falta está el reembolso de SPEC-KRILINXI-070.
- **La suma de los renglones de ingreso puede quedar por debajo del total** si el servidor rechaza un renglón: el 409 impide pasarse, no completar. Se acepta porque el renglón rechazado no se pierde, queda en Para corregir, y al corregirlo la suma vuelve a cuadrar.
- **Fuera de alcance:** editar o borrar un renglón ya guardado. El empleado no puede; el admin lo hace en SPEC-KRILINXI-071 (agregar, cambiar y quitar renglones). Hasta entonces, una boleta con un renglón mal escrito se anula y se vuelve a registrar.
- **Avisos a las specs que siguen** (dejados en sus Notas): SPEC-KRILINXI-069 ya no tiene un "Precio final" que seguir, sino cargos; SPEC-KRILINXI-070 decide cómo convive el reembolso con los cargos; SPEC-KRILINXI-071 tiene que mantener la regla de los dos momentos.

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-068', () => { ... })

Así un `grep SPEC-KRILINXI-068` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
