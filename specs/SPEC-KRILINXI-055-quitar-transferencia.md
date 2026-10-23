---
id: SPEC-KRILINXI-055
name: Quitar la transferencia como forma de pago
slug: quitar-transferencia
status: in-progress
owner: krilinxito
created: 2026-10-23
scope:
  - backend/src/**
  - backend/migraciones/**
  - backend/tests/**
  - frontend/src/lib/**
  - frontend/src/features/pagos/**
  - frontend/src/features/estadisticas/**
  - frontend/src/test/**
  - docker/powersync/**
priority: medium
depends_on: []
tests: []
---

## Descripción

El negocio ya no cobra por transferencia. TRANSFERENCIA es un valor del ENUM metodo_pago en Postgres y aparece en formularios, filtros, estadísticas y gráficos. Se quita de todo, también de la base: una migración convierte los cobros ya guardados con ese método (hoy son datos de prueba) a EFECTIVO para no borrar filas, y recrea el ENUM sin el valor. Lo decidió el equipo: no se conserva en el historial. Las series de los gráficos pasan de cuatro a tres formas de pago.

## Criterios de aceptación

- [ ] Una migración nueva (backend/migraciones/NNN_*.sql, sin editar la línea base ni migraciones aplicadas) pasa los pagos TRANSFERENCIA a EFECTIVO y recrea metodo_pago con solo EFECTIVO, QR y TARJETA, sin perder ninguna fila.
- [ ] La API rechaza con 400 un cobro cuyo metodo_pago sea TRANSFERENCIA, y sus tests de pagos y de estadísticas ya no la mencionan.
- [ ] lib/dominio (METODOS_PAGO y su texto) ya no incluye TRANSFERENCIA, y el test que compara las constantes con el schema sigue en verde.
- [ ] Los formularios de cobro, adelanto y entrega ya no ofrecen la opción, y las estadísticas (ingresos, ingresos por día, forma de pago) muestran tres métodos.
- [ ] Los colores de los gráficos quedan en tres series (serie-1 a serie-3) y se anota en la bitácora que siguen distinguibles para daltonismo; serie-4 sale del tema en los dos bloques y del DESIGN.md.
- [ ] Las sync rules de PowerSync y el schema local siguen coincidiendo con el schema de Postgres (lo comprueban sus tests).
- [ ] CLAUDE.md y la suite completa (npm test) reflejan los tres métodos y quedan en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-055', () => { ... })

Así un `grep SPEC-KRILINXI-055` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
