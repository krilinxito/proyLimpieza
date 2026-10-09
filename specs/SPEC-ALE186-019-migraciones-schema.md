---
id: SPEC-ALE186-019
name: Migraciones del schema sin borrar datos
slug: migraciones-schema
status: draft
owner: ale186
created: 2026-10-09
scope:
  - backend/src/db/**
  - backend/migraciones/**
  - backend/src/server.ts
  - backend/package.json
  - backend/tests/db/**
  - backend/tests/**
  - docker-compose.yaml
  - context/lavanderia_schema.sql
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

Hoy el schema se carga una sola vez, desde `context/lavanderia_schema.sql`, cuando Postgres arranca con el volumen vacío (`docker-compose.yaml`), y la única forma de cambiarlo es editar ese archivo y correr `docker compose down -v`, que borra la base entera. En desarrollo es molesto; con los datos reales de las sucursales sería imposible. Por no tener otra forma, varias specs tuvieron que rodear el schema (CLAUDE.md §13: la marca de revisión en `valores_anteriores`, la fecha de cierre de una sucursal sacada de la auditoría, el nombre de sucursal único comprobado en el código). Esta spec agrega un sistema de migraciones: archivos `.sql` numerados en `backend/migraciones/`, que un comando (`npm run migrar --workspace backend`) aplica en orden sobre la base que ya existe, sin borrar nada, anotando en una tabla cuáles ya corrieron. Es un runner propio sobre el `pg` que el proyecto ya usa, sin dependencias nuevas: las migraciones son SQL plano, que el equipo ya conoce. `lavanderia_schema.sql` queda congelado como línea base: no se vuelve a editar, y todo cambio posterior es una migración, así una base recién creada y una vieja terminan iguales. El servidor no aplica las migraciones solo al arrancar: si encuentra alguna pendiente, no arranca y dice qué comando correr, porque en producción un cambio de schema tiene que ser una decisión, y dos servidores arrancando a la vez no pueden aplicarlas los dos. La publicación de PowerSync es `FOR ALL TABLES`, así que las columnas y tablas nuevas se replican sin tocarla. Esta spec instala el sistema; los cambios de schema que motivaron esta spec van en su propia spec (`deuda-schema`).

## Criterios de aceptación

- [ ] El sistema aplica con `npm run migrar --workspace backend` los archivos `backend/migraciones/NNN_nombre.sql` que todavía no se aplicaron, en orden por su número, y anota cada uno con su nombre y la fecha en una tabla de control (`migraciones_aplicadas`), que crea si no existe.
- [ ] El sistema no vuelve a aplicar una migración ya anotada: correr `migrar` dos veces seguidas no cambia nada la segunda vez y lo dice ("no hay migraciones pendientes").
- [ ] El sistema aplica cada migración en una transacción junto con su anotación: si una falla, se deshace entera, no queda anotada, las anteriores quedan aplicadas, las siguientes no se intentan, y el comando termina con error mostrando qué archivo falló y el mensaje de Postgres (comprobado contra Postgres real).
- [ ] El sistema impide que dos `migrar` corran a la vez sobre la misma base, con un bloqueo de Postgres (`pg_advisory_lock`): el segundo espera a que termine el primero y no aplica nada dos veces.
- [ ] El sistema rechaza al empezar, sin aplicar ninguna, un nombre de archivo que no siga el formato `NNN_nombre.sql` o un número repetido.
- [ ] El sistema aplica las migraciones sobre una base existente con datos sin borrarlos: una migración de prueba que agrega una columna deja intactas las filas de antes (comprobado contra Postgres real).
- [ ] El servidor no arranca si hay migraciones pendientes: termina con un mensaje en español que dice cuántas faltan y qué comando correr. Con todas aplicadas, arranca como hoy.
- [ ] La suite `npm run test:db` prepara la base de pruebas cargando la línea base y después aplicando todas las migraciones, con el mismo runner que se usa en desarrollo y producción.
- [ ] CLAUDE.md explica cómo crear una migración y declara que `lavanderia_schema.sql` no se vuelve a editar; la sección 11 cambia `down -v` por `migrar` como la forma de traer cambios de schema.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-019', () => { ... })

Así un `grep SPEC-ALE186-019` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
