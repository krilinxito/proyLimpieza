---
id: SPEC-KRILINXI-027
name: Personal, sucursales, auditoría y para corregir con el tema
slug: estilo-gestion
status: draft
owner: krilinxito
created: 2026-10-17
scope:
  - frontend/src/features/usuarios/components/**
  - frontend/src/features/sucursales/components/**
  - frontend/src/features/auditoria/components/**
  - frontend/src/features/pendientes/components/**
  - frontend/src/components/AvisoConexion.tsx
  - frontend/src/test/arquitectura.test.ts
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-024
  - SPEC-KRILINXI-025
  - SPEC-KRILINXI-026
tests: []
---

## Descripción

Última spec de estilo de la ola. Quedan con la paleta cruda las pantallas de gestión del admin —Personal, Sucursales, ¿Quién hizo qué?— y la de Registros para corregir, que usan los dos roles (unas 75 clases entre las cuatro). Esta spec las pasa a las piezas del tema (SPEC-KRILINXI-022): cada cuenta, sucursal, registro de la auditoría y registro rechazado es una `Tarjeta`; el estado (activa, cerrada, dada de baja, "hay que revisar") es una `Insignia` con texto; los resultados y errores, un `Aviso`.

Con esta spec ninguna pantalla queda fuera del tema: la regla de la paleta cruda pasa a cubrir **toda** la app (`components/`, `pages/` y `features/`), así que nadie puede volver a escribir `bg-red-50`. De paso, el aviso de conexión toma el aspecto de `Aviso` (sigue con su texto, su rol y su enlace).

## Criterios de aceptación

- [ ] En Personal y Sucursales, cada cuenta y cada sucursal se muestran como una `Tarjeta` con su nombre y una `Insignia` con su estado en palabras (activa / dada de baja, abierta / cerrada), con un tono distinto para cada uno; los botones de cambio siguen deshabilitados sin internet.
- [ ] En ¿Quién hizo qué?, cada registro es una tarjeta con su descripción en palabras (`describir.ts`), quién, cuándo y dónde; los marcados para revisar llevan una `Insignia` de advertencia "Hay que revisar"; el filtro y las páginas usan las piezas del tema.
- [ ] En Registros para corregir, cada registro rechazado es una tarjeta con qué se rechazó y por qué en un `Aviso` de error, y "Corregir", "Descartar" y "Es el mismo cliente" son botones del tema.
- [ ] El aviso de conexión usa los tonos del tema (sin internet, en advertencia; con internet, neutro) y conserva sus textos, su `role="status"` y su enlace a /para-corregir.
- [ ] La regla de la paleta cruda de `test/arquitectura.test.ts` cubre toda la app (`components/`, `pages/` y `features/`), y pasa.
- [ ] Toda la suite existente pasa sin cambiar ningún texto ni rol.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-027', () => { ... })

Así un `grep SPEC-KRILINXI-027` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
