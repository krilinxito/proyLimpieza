---
id: SPEC-KRILINXI-012
name: Corregir el reloj de la tablet con la hora del servidor
slug: reloj-tablet
status: in-progress
owner: krilinxito
created: 2026-10-16
scope:
  - frontend/src/lib/reloj.ts
  - frontend/src/lib/reloj.test.ts
  - frontend/src/features/auth/**
  - frontend/src/features/ordenes/api/**
  - frontend/src/features/pagos/api/**
  - frontend/src/features/entregas/api/**
  - frontend/src/test/**
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-010
tests: []
---

## Descripción

fecha_entrada, fecha_pago y fecha_entrega las pone la tablet y son las oficiales (CLAUDE.md §13, "El reloj de la tablet"). Hoy salen de `new Date()` en ordenesLocal.ts, ropaLocal.ts y entregasLocal.ts. El backend ya devuelve `ahora` en login y renovar (SPEC-ALE186-015); esta spec mide el desfase en esas dos respuestas, lo guarda en el dispositivo y lo aplica a las tres fechas, también sin internet. Depende de SPEC-KRILINXI-010 porque la renovación es la otra respuesta que trae `ahora`.

## Criterios de aceptación

- [ ] Al recibir la respuesta de login o de renovar con un `ahora` válido, lib/reloj guarda el desfase (hora del servidor menos hora local) en el dispositivo, y sobrevive a recargar la página.
- [ ] Una respuesta sin `ahora` o con un `ahora` que no es una fecha válida no cambia el desfase guardado.
- [ ] horaOficial() devuelve la hora local más el desfase, en ISO 8601 UTC; sin desfase medido devuelve la hora local.
- [ ] Registrar ropa, cobrar y entregar escriben fecha_entrada, fecha_pago y fecha_entrega con horaOficial(), también sin conexión.
- [ ] Con el reloj local 10 minutos adelantado respecto del `ahora` del último login, la orden registrada lleva la hora del servidor (±1 s).
- [ ] Salir no borra el desfase: es de la tablet, no de la persona.
- [ ] Ningún archivo de features/ llama a `new Date()` para una fecha que se guarda en la base local (test de arquitectura).
- [ ] CLAUDE.md deja de listar el reloj de la tablet como pendiente del frontend (§13).

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-012', () => { ... })

Así un `grep SPEC-KRILINXI-012` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
