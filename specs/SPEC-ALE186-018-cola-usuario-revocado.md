---
id: SPEC-ALE186-018
name: Lo que sube la tablet de una cuenta dada de baja
slug: cola-usuario-revocado
status: draft
owner: ale186
created: 2026-10-09
scope:
  - backend/src/middleware/auth.ts
  - backend/src/utils/jwt.ts
  - backend/src/routes/clientes.routes.ts
  - backend/src/routes/ordenes.routes.ts
  - backend/src/routes/pagos.routes.ts
  - backend/src/routes/entregas.routes.ts
  - backend/src/models/auditoria.model.ts
  - backend/src/models/usuarios.model.ts
  - backend/src/controllers/**
  - backend/src/models/**
  - backend/src/utils/**
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

Cierra la deuda de CLAUDE.md §13 "Qué hacer con la cola de un usuario revocado". El lado del dispositivo ya está (SPEC-KRILINXI-007): un 401 con cambios sin subir no borra nada. Falta el del servidor. Hoy, si a una empleada la dan de baja mientras su tablet estaba sin internet, pasan dos cosas malas. Si su token todavía no venció, lo que sube entra en silencio, sin que el admin se entere. Si ya venció, el servidor responde 401 y la cola espera a que entre otra persona en la tablet; entonces sube con el token de esa persona, y la auditoría dice que recibió o cobró quien no lo hizo. La decisión tomada (opción A) es aceptar ese trabajo, porque es real y hay clientes esperando su ropa, sin mentir sobre quién lo hizo y con el riesgo acotado. Un token de la API vencido hace como mucho 3 días, con firma válida, puede usarse SOLO para las escrituras de la cola del mostrador: `POST` y `PATCH` de clientes y órdenes, y `POST` de pagos y entregas. No sirve para renovar la sesión, leer datos ni entrar a nada del admin. Pasados los 3 días, 401 como hoy. Toda escritura de una cuenta dada de baja (con token vigente o dentro de la ventana) se acepta pero queda marcada para que el admin la revise. Como no hay migraciones, la marca va en la propia fila de auditoría, en `valores_anteriores.revision`, y la consulta de la auditoría (SPEC-ALE186-012) la muestra y deja filtrarla; cuando exista un sistema de migraciones, puede pasar a una columna propia. Un token vencido de una cuenta activa, dentro de la ventana, se acepta sin marca: es trabajo normal hecho sin internet. No toca el frontend: la tablet ya sube su cola con el token que tiene guardado, y no llama a `/renovar`.

## Criterios de aceptación

- [ ] El sistema acepta en `POST /api/clientes`, `PATCH /api/clientes/:id`, `POST /api/ordenes`, `PATCH /api/ordenes/:id`, `POST /api/pagos` y `POST /api/entregas` un token de la API vencido hace 3 días o menos, con firma válida, y registra la escritura a nombre del usuario de ese token (comprobado contra Postgres real).
- [ ] El sistema responde 401 con el formato de error uniforme en esas mismas rutas a un token vencido hace más de 3 días, a uno con la firma alterada, y a uno emitido para PowerSync.
- [ ] El sistema sigue rechazando con 401 un token vencido, aunque esté dentro de la ventana, en `/api/auth/renovar` y en todas las rutas de admin (`/usuarios`, `/sucursales`, `/estadisticas`, `/auditoria`).
- [ ] El sistema acepta la escritura de una cuenta dada de baja, tanto con token vigente como dentro de la ventana, y la marca para revisión: su fila de auditoría lleva `valores_anteriores.revision = "cuenta_dada_de_baja"`, sin perder los valores anteriores de una edición (comprobado contra Postgres real).
- [ ] El sistema acepta sin marca la escritura de una cuenta activa con un token vencido dentro de la ventana.
- [ ] El sistema muestra en cada registro de `GET /api/auditoria` el campo `revision` (el motivo, o `null`) y filtra con `?revisar=true` solo los marcados.
- [ ] El sistema comprueba si la cuenta está dada de baja consultando la base en cada escritura del mostrador, y no en las demás rutas.
- [ ] Los tests manejan el vencimiento con un reloj falso o con tokens emitidos con fechas elegidas, y comprueban el borde: vencido hace 3 días menos un segundo se acepta, y hace 3 días más un segundo se rechaza.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-018', () => { ... })

Así un `grep SPEC-ALE186-018` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
