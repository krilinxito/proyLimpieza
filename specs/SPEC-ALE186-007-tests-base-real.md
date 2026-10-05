---
id: SPEC-ALE186-007
name: Tests contra una base real
slug: tests-base-real
status: in-progress
owner: ale186
created: 2026-10-04
scope:
  - backend/tests/db/**
  - backend/tests/helpers/baseReal.ts
  - backend/vitest.config.ts
  - backend/vitest.db.config.ts
  - backend/package.json
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

Hoy toda la suite del backend reemplaza el pool de Postgres por un doble. Eso prueba bien los controllers y qué SQL arma cada model, pero no que Postgres lo acepte ni que haga lo que promete: que un `INSERT … SELECT` copie la sucursal correcta, que una sentencia con un CTE sea atómica, que `FOR SHARE` frene una anulación simultánea. Esas garantías se verificaron a mano en SPEC-ALE186-005 y 006, con scripts fuera del repo que nadie va a volver a correr. Y lo que viene —las estadísticas del dashboard— es SQL de agregación, donde un doble del pool no prueba nada.

Esta spec agrega una segunda suite, de integración, que corre contra el Postgres de Docker. Es un cimiento: fija cómo se escriben estos tests para que las specs siguientes (estadísticas, auditoría) los usen desde el principio.

Decisiones a propósito, para revisar al aprobar:
- **Suite aparte, no dentro de `npm test`.** `npm test` tiene que seguir corriendo en cualquier máquina sin Docker, incluida la de quien solo trabaja en el frontend. La nueva suite se corre con `npm run test:db` en el workspace del backend.
- **Base de pruebas separada, recreada en cada corrida.** Los tests no tocan la base de desarrollo: usan `<base>_test` (por ejemplo `lavanderia_test`), en el mismo servidor, que se borra y se vuelve a crear desde `context/lavanderia_schema.sql` al empezar. Así no ensucian datos de nadie, no dependen de lo que haya quedado de una corrida anterior y siempre prueban contra el schema actual, sin `down -v`.
- **Sin transacción por test.** Las pruebas de concurrencia necesitan dos conexiones y datos confirmados, que una transacción con rollback no permite. Cada test crea sus propios datos con ids nuevos.

Cubre, como primeros casos, lo que hoy solo se verificó a mano: los models de pagos y entregas contra la base real, incluidas la atomicidad de la entrega y las carreras con una anulación. Queda FUERA: llevar los tests existentes a la base real (siguen con dobles, que es lo correcto para un controller) y cualquier CI.

## Criterios de aceptación

- [ ] El sistema corre la suite de integración con `npm run test:db` en el workspace del backend, y `npm test` (en el backend y desde la raíz) sigue sin incluir esos tests ni necesitar Postgres.
- [ ] La suite de integración usa una base de pruebas cuyo nombre es el de DATABASE_URL con el sufijo `_test`, la borra y la vuelve a crear desde `context/lavanderia_schema.sql` al empezar cada corrida, y nunca escribe en la base de DATABASE_URL.
- [ ] Cuando Postgres no responde, `npm run test:db` falla al empezar con un mensaje en español que dice que hay que levantar Docker (`docker compose up`), en vez de fallar test por test con errores de conexión.
- [ ] Existe un helper en `backend/tests/helpers/baseReal.ts`, con un comentario de cabecera que explica qué cubre y cómo usarlo, que crea en la base de pruebas sucursales, usuarios, clientes y órdenes coherentes en una línea cada uno, con ids nuevos.
- [ ] El test de pagos contra la base real comprueba que un pago se guarda con la sucursal de la orden, que un reintento con el mismo id no duplica, que no se inserta sobre una orden ANULADA ni sobre una de otra sucursal cuando hay restricción, y que un ADMIN cobra en cualquier sucursal.
- [ ] El test de pagos comprueba que, con una anulación de la orden abierta y sin confirmar en otra conexión, el cobro espera y, al confirmarse la anulación, no queda ningún pago.
- [ ] El test de entregas contra la base real comprueba que la entrega se guarda y la orden queda ENTREGADO, que sin precio final se usa el `precio_total`, y que un reintento con el mismo id no duplica.
- [ ] El test de entregas comprueba la atomicidad: una entrega con un id ya usado apuntando a otra orden falla sin dejar esa otra orden en ENTREGADO.
- [ ] El test de entregas comprueba que, con una anulación abierta y sin confirmar, la entrega espera y termina en `orden-anulada`, y que dos entregas simultáneas a la misma orden con ids distintos dejan exactamente una entrega.
- [ ] Los tests de integración pasan dos veces seguidas sin limpiar nada a mano entre corridas.
- [ ] CLAUDE.md documenta `npm run test:db` en la sección de comandos y explica en la de tests cuándo va un test con dobles y cuándo contra la base real.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-007', () => { ... })

Así un `grep SPEC-ALE186-007` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
