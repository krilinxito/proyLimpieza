---
id: SPEC-ALE186-024
name: El bucket global de PowerSync solo baja a cuentas activas
slug: sync-global-activos
status: approved
owner: ale186
created: 2026-10-11
scope:
  - docker/powersync/sync-rules.yaml
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

La revisión del backend del 2026-10-09 encontró que el bucket `global` de `docker/powersync/sync-rules.yaml` —todos los clientes con su teléfono y carnet, las sucursales y la lista de usuarios— no tiene consulta `parameters`, así que se entrega a cualquier token válido de PowerSync: una cuenta dada de baja sigue bajando la tabla de clientes completa hasta que su token vence (hasta 3 días). El bucket `sucursal` ya resolvió lo mismo con `activo = true` en su consulta de parámetros (SPEC-KRILINXI-004). Esta spec le pone al `global` una consulta `parameters` sobre `usuarios` que exige `id = request.user_id()` y `activo = true`, sin cambiar sus consultas `data`: bajan las mismas tablas y columnas, solo que a menos cuentas. Como PowerSync reevalúa los parámetros cuando cambia la fila del usuario, una baja deja a esa tablet sin el bucket, y PowerSync le borra esos datos. Efecto conocido: el `global` deja de ser un único bucket compartido y pasa a ser uno por cuenta activa; con pocas cuentas es despreciable. No cambia el `.env` de nadie: después del pull hay que reiniciar PowerSync (`docker compose restart powersync`) para que lea las reglas nuevas.

## Criterios de aceptación

- [ ] El bucket `global` de `docker/powersync/sync-rules.yaml` tiene una consulta `parameters` sobre `usuarios` que exige `id = request.user_id()` y `activo = true`, igual que el bucket `sucursal` (comprobado por un test del backend que lee el yaml).
- [ ] Las consultas `data` del bucket `global` no cambian: bajan las mismas tablas y columnas, y `usuarios` sigue sin `password_hash` (comprobado por el mismo test, y los tests existentes del frontend que comparan el schema local con las sync rules pasan sin cambios).
- [ ] PowerSync acepta las reglas nuevas al reiniciarse, sin errores de sync rules en su log (comprobado a mano con el PowerSync local).
- [ ] Con PowerSync corriendo, una cuenta activa recibe clientes, sucursales y usuarios, y la misma cuenta dada de baja deja de recibirlos (comprobado a mano con tokens reales emitidos por el backend contra el PowerSync local); el resultado queda anotado en la bitácora.
- [ ] CLAUDE.md quita este punto de la revisión del backend y actualiza el aviso para el frontend: hecho, y qué hacer después del pull (reiniciar PowerSync).

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-024', () => { ... })

Así un `grep SPEC-ALE186-024` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
