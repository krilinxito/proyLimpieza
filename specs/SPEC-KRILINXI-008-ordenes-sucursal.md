---
id: SPEC-KRILINXI-008
name: 'La ropa de la sucursal: ver, avanzar, anular y cobrar'
slug: ordenes-sucursal
status: draft
owner: krilinxito
created: 2026-10-03
scope:
  - frontend/src/features/ordenes/**
  - frontend/src/features/pagos/**
  - frontend/src/pages/rutas.tsx
  - frontend/src/lib/dominio.ts
  - frontend/src/lib/dominio.test.ts
  - frontend/src/test/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

Hoy se puede registrar ropa (SPEC-KRILINXI-006), pero no se la puede volver a ver. Esta spec agrega la pantalla del día a día: la ropa que está en el local, cómo avanza y cuánto debe cada cliente. Todo se lee y se escribe en la base local, con el patrón de las specs anteriores (SQL en `api/`, hook y componentes), y sube por la cola de SPEC-KRILINXI-007.

Rutas: una nueva, `/ropa` ("Ropa en el local"), y `/cobrar`, que hoy es un hueco y pasa a mostrar la misma pantalla con su propio título. Las dos son solo para EMPLEADO, como `/registrar-ropa`: el ADMIN no tiene órdenes en su dispositivo.

Contrato del backend que se respeta (SPEC-ALE186-004 y 005):
- El avance va solo hacia adelante y puede saltar pasos: RECIBIDO → EN_PROCESO → LISTO. Desde cualquier estado abierto se puede ANULAR. ENTREGADO nunca se escribe por PATCH: lo pone el servidor al registrar la entrega (`entregar-ropa`).
- Un cobro se acepta en cualquier orden que no esté anulada.

**El estado que se muestra** se calcula en un único lugar, a partir de la orden y su entrega (un JOIN en SQLite local, que sí los admite; la limitación de los JOIN es solo de las sync rules). Si la orden tiene entrega en la base local, figura como "Entregado" aunque su columna `estado` todavía diga LISTO porque no sincronizó. Sin esto, una ropa recién entregada se vería como entregable otra vez.

Queda FUERA: registrar la entrega (`entregar-ropa`), editar los datos de una orden (boleta, precio, descripción) y cualquier mejora visual de las pantallas existentes.

## Criterios de aceptación

- [ ] El sistema lista las órdenes abiertas (no entregadas ni anuladas) de la sucursal del empleado, de la más vieja a la más nueva, mostrando boleta, nombre del cliente, descripción, estado en palabras, fecha estimada y saldo en Bs, leídas de la base local.
- [ ] El sistema busca por número de boleta o por teléfono del cliente (normalizado como en clientes), y la búsqueda encuentra también órdenes entregadas o anuladas de la sucursal.
- [ ] El estado mostrado se calcula en un único lugar a partir de la orden y su entrega: una orden con entrega en la base local figura como Entregado aunque su columna estado no lo diga todavía, y un test lo comprueba.
- [ ] El detalle de una orden muestra sus datos, sus pagos (tipo, método y monto en Bs) y el saldo calculado con calcularSaldo de features/pagos, usando el precio final de la entrega cuando la hay.
- [ ] El sistema ofrece solo los avances permitidos desde el estado actual ("Empezar a lavar" → EN_PROCESO, "Marcar como lista" → LISTO), los escribe en la base local y quedan en la cola como PATCH de ordenes con solo el estado.
- [ ] El sistema nunca escribe ENTREGADO en la columna estado, y la tabla de avances permitidos repite la del backend (backend/src/utils/dominio.ts) con un test que lee ese archivo y compara las dos.
- [ ] "Anular" pide confirmación con ModalConfirmacion ("¿Anular la boleta 001234? Esta acción no se puede deshacer.") y solo escribe ANULADO si se confirma; cancelar no escribe nada.
- [ ] "Cobrar" registra un pago ADELANTO con método (de METODOS_PAGO), mayor que cero y no mayor que el saldo, guardado en la base local con insertarPago; no se ofrece en órdenes anuladas.
- [ ] Una orden entregada o anulada no ofrece avanzar, anular ni cobrar.
- [ ] /ropa y /cobrar solo las abre un EMPLEADO; un ADMIN ve el aviso de solo empleados.
- [ ] Todo funciona sin conexión y sin ninguna petición a la API, y sinJerga() no encuentra palabras del sistema en ningún paso.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-008', () => { ... })

Así un `grep SPEC-KRILINXI-008` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
