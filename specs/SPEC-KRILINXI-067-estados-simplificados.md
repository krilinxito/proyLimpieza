---
id: SPEC-KRILINXI-067
name: Estados de la boleta simplificados
slug: estados-simplificados
status: finished
owner: krilinxito
created: 2026-10-30
scope:
  - backend/migraciones/006_estados_simplificados.sql
  - backend/src/utils/dominio.ts
  - backend/src/models/ordenes.model.ts
  - backend/src/models/entregas.model.ts
  - backend/src/models/sucursales.model.ts
  - backend/src/controllers/ordenes.controller.ts
  - backend/tests/**
  - frontend/src/lib/dominio.ts
  - frontend/src/features/ordenes/estado.ts
  - frontend/src/features/ordenes/components/DetalleOrden.tsx
  - frontend/src/features/mostrador/**
priority: high
depends_on: []
tests:
  - backend\tests\db\estadosSimplificados.db.test.ts
  - backend\tests\http\ordenes.test.ts
  - backend\tests\unit\dominio.test.ts
  - backend\tests\unit\entregas.model.test.ts
  - frontend\src\features\auditoria\describir.test.ts
  - frontend\src\features\mostrador\api\hoyLocal.test.ts
  - frontend\src\features\mostrador\components\PantallaMostrador.test.tsx
  - frontend\src\features\ordenes\api\ropaLocal.test.ts
  - frontend\src\features\ordenes\estado.test.ts
  - frontend\src\lib\dominio.test.ts
---

## Descripción

El cliente pidió que una boleta solo tenga los estados recibido, entregado y reembolsado: nadie usa 'Empezar a lavar' ni 'Marcar como lista'. Esta spec quita EN_PROCESO y LISTO del sistema y deja el estado REEMBOLSADO declarado y pintado en rojo (todavía sin forma de ponerlo: eso es de la spec reembolso-entrega). ANULADO se queda, porque anular una boleta mal escrita sigue haciendo falta. Es la única spec que recrea el ENUM estado_orden de Postgres, por eso va primero y sola. Reserva la migración 006; la 007 es de precio-unitario-boleta y la 008, de reembolso-entrega. Lo que dependía de LISTO (la ropa 'lista para recoger' del Inicio, vw_pendientes_recoger y la sucursal que no se cierra con ropa adentro) pasa a mirar RECIBIDO.

## Criterios de aceptación

- [ ] La migración 006 pasa a RECIBIDO toda orden que esté en EN_PROCESO o LISTO, recrea el tipo estado_orden con RECIBIDO, ENTREGADO, REEMBOLSADO y ANULADO, y no pierde ninguna fila; un test contra la base real (test:db) siembra una boleta en cada estado viejo y comprueba el resultado.
- [ ] Las vistas que dependen del tipo (vw_pendientes_recoger y vw_saldos) se recrean en la misma migración y devuelven lo mismo que antes para las mismas boletas; la línea base context/lavanderia_schema.sql no se edita.
- [ ] POST y PATCH /api/ordenes rechazan con 400 los estados EN_PROCESO y LISTO; desde RECIBIDO solo se puede pasar a ANULADO por PATCH, y ENTREGADO y REEMBOLSADO siguen sin poder ponerse por ahí.
- [ ] Una sucursal no se puede cerrar mientras tenga ropa en RECIBIDO (antes: RECIBIDO, EN_PROCESO o LISTO), y la condición sigue dentro de la sentencia que escribe.
- [ ] ESTADOS_ORDEN y ORIGENES coinciden en backend/src/utils/dominio.ts, frontend/src/lib/dominio.ts y frontend/src/features/ordenes/estado.ts, y los tests de dominio de los dos lados los comparan con la línea base más las migraciones.
- [ ] El Mostrador ya no ofrece 'Empezar a lavar' ni 'Marcar como lista': la fila 'Qué hacer con esta ropa' de una boleta RECIBIDA ofrece cobrar y entregar, y 'Anular' sigue aparte al final con su confirmación.
- [ ] 'Ropa lista para recoger' del Inicio y 'Ropa sin recoger' del tablero cuentan las boletas RECIBIDAS y se llaman 'Ropa por entregar'; sus totales no cambian para los mismos datos.
- [ ] REEMBOLSADO existe en TONO_ESTADO con el tono de peligro, y una boleta en ese estado se pinta con la insignia roja y su nombre en palabras ('Reembolsada'); en esta spec no hay ninguna acción que lo ponga.
- [ ] Una tablet con la base local anterior a la migración, que todavía tiene boletas EN_PROCESO o LISTO, las muestra como RECIBIDO y las deja entregar sin romper nada, hasta que sincroniza.
- [ ] Tests de backend y frontend con el id de esta spec, CLAUDE.md actualizado (estados, §2 y §3) y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-067', () => { ... })

Así un `grep SPEC-KRILINXI-067` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
