---
id: SPEC-ALE186-020
name: Los parches del schema pasan a columnas e índices
slug: deuda-schema
status: finished
owner: ale186
created: 2026-10-10
scope:
  - backend/migraciones/**
  - backend/src/models/auditoria.model.ts
  - backend/src/models/sucursales.model.ts
  - backend/src/models/ordenes.model.ts
  - backend/src/controllers/**
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-ALE186-019
tests:
  - backend\tests\db\deudaSchema.db.test.ts
  - backend\tests\db\ordenesSucursalCerrada.db.test.ts
  - backend\tests\db\sucursales.db.test.ts
  - backend\tests\unit\auditoria.model.test.ts
  - backend\tests\unit\ordenes.model.test.ts
  - backend\tests\unit\sucursales.model.test.ts
---

## Descripción

Tres specs tuvieron que rodear el schema porque no había migraciones, y quedaron como deuda en CLAUDE.md §13. Con SPEC-ALE186-019 ya se puede cambiar el schema sin borrar datos, y esta spec escribe las primeras migraciones de verdad para corregirlos. (1) La marca de revisión de SPEC-ALE186-018 vive dentro de `auditoria.valores_anteriores` (`{"revision": ...}`): pasa a una columna propia, `auditoria.revision`, y la migración copia las marcas que ya existan y las quita de `valores_anteriores`. (2) El momento en que se cerró una sucursal se deduce buscando en la auditoría (SPEC-ALE186-014): pasa a una columna `sucursales.cerrada_en`, que se llena al cerrar y se vacía al reabrir; la migración la completa con el último cierre que ya esté en la auditoría. Una sucursal cerrada cuyo cierre no dejó rastro (cerrada a mano en la base) queda con `cerrada_en` vacía y sigue rechazando toda la ropa, como hoy: inventarle una fecha la haría más permisiva sin que nadie lo decida. (3) El nombre único de sucursal se comprueba en el código (SPEC-ALE186-011), y dos altas simultáneas pueden pasar las dos: pasa a un índice `UNIQUE (lower(btrim(nombre)))`, que lo garantiza la base; si ya hay nombres repetidos, la migración falla con un mensaje que los nombra, para corregirlos antes. Además (4) se agrega el índice que falta en `auditoria.registro_id`, que encontró la revisión del 2026-10-09. Ninguna API cambia: la consulta de la auditoría ya expone `revision` aparte (SPEC-ALE186-018), y las reglas de las sucursales responden lo mismo. El frontend no se entera.

## Criterios de aceptación

- [ ] El sistema agrega con una migración la columna `auditoria.revision` (texto, solo `cuenta_dada_de_baja` o vacía), y la migración copia a esa columna las marcas que ya estaban en `valores_anteriores` y las quita de ahí, dejando `valores_anteriores` en NULL si solo tenía la marca (comprobado contra Postgres real sobre una base con filas marcadas con la forma anterior).
- [ ] El sistema escribe la marca de revisión en la columna `revision` al auditar una escritura de una cuenta dada de baja, ya no en `valores_anteriores`, y `GET /api/auditoria` responde exactamente igual que antes, con `revision` aparte y el filtro `?revisar=true`.
- [ ] El sistema agrega con una migración la columna `sucursales.cerrada_en`, y la migración la completa, para cada sucursal cerrada, con la fecha del último cierre registrado en la auditoría; una cerrada sin rastro en la auditoría queda con `cerrada_en` vacía (comprobado contra Postgres real).
- [ ] El sistema llena `cerrada_en` con la hora del servidor al cerrar una sucursal y la vacía al reabrirla, en la misma sentencia que cambia `activa`.
- [ ] El sistema decide si una sucursal cerrada acepta una orden comparando su `fecha_entrada` con `sucursales.cerrada_en`, y ya no consulta la auditoría; una sucursal cerrada con `cerrada_en` vacía rechaza toda orden nueva, y todos los tests de SPEC-ALE186-014 siguen pasando sin cambios.
- [ ] El sistema agrega con una migración un índice único sobre `lower(btrim(nombre))` de `sucursales`, y la migración falla, sin aplicar nada, con un mensaje que nombra las sucursales repetidas cuando ya hay dos con el mismo nombre (comprobado contra Postgres real).
- [ ] El sistema responde 409 `NOMBRE_SUCURSAL_DUPLICADO` cuando la base rechaza un nombre repetido por el índice, también ante dos altas simultáneas con el mismo nombre, de las que solo una entra (comprobado contra Postgres real); el reintento de un alta con el mismo id y nombre sigue respondiendo 200.
- [ ] El sistema agrega con una migración un índice en `auditoria.registro_id`.
- [ ] Las migraciones se aplican limpias sobre la línea base, una segunda corrida de `migrar` no hace nada, y CLAUDE.md §13 deja de listar los tres parches como deuda.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-020', () => { ... })

Así un `grep SPEC-ALE186-020` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
