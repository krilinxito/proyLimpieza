---
id: SPEC-ALE186-022
name: bcrypt con costo bajo solo en los tests
slug: bcrypt-costo-tests
status: in-progress
owner: ale186
created: 2026-10-11
scope:
  - backend/src/controllers/usuarios.controller.ts
  - backend/src/controllers/auth.controller.ts
  - backend/src/db/seed.ts
  - backend/src/config.ts
  - backend/src/utils/**
  - backend/tests/**
  - CLAUDE.md
priority: medium
depends_on: []
tests: []
---

## Descripción

La suite contra Postgres real (`npm run test:db`) falla al azar cuando la máquina está cargada: los tests que crean usuarios y hacen login superan el límite de 15 segundos ("Test timed out in 15000ms"). Se comprobó el 2026-10-10 que pasa igual en `dev` sin ninguna spec nueva (3 de 4 corridas con carga), y que la causa es bcrypt: cada hash o comparación con costo 10 tarda ~51 ms, Node los hace de a 4 en paralelo, y 16 archivos de test a la vez los ponen en fila. En producción eso no es un problema (pocos logins, y el token dura días), pero un test que falla al azar hace que nadie le crea a la suite. Esta spec baja el costo de bcrypt a 4 (~1 ms) SOLO cuando `NODE_ENV` es exactamente `test`, que lo ponen las configs de Vitest; cualquier otro valor, o ninguno, sigue en 10. De paso, el costo hoy está repetido en `usuarios.controller.ts` y `db/seed.ts`: pasa a un único lugar. El hash señuelo del login (que hace que un usuario inexistente tarde lo mismo que uno real) se arma con el mismo costo que los hashes reales, para que esa protección siga siendo cierta también en los tests. No cambia nada en producción ni en desarrollo: ni el costo, ni los hashes ya guardados, ni el tiempo de respuesta.

## Criterios de aceptación

- [ ] El sistema define el costo de bcrypt en un único lugar, que usan el alta y el cambio de contraseña de usuarios y la semilla del primer admin; no queda ningún otro `COSTE_BCRYPT` ni costo escrito a mano en el código.
- [ ] El sistema usa costo 10 cuando `NODE_ENV` es `production`, `development`, cualquier otro valor o no está definido, y costo 4 solo cuando es exactamente `test` (comprobado con un test unitario que arma el costo desde entornos de mentira).
- [ ] El sistema arma el hash señuelo del login con el mismo costo que los hashes reales: en producción sigue siendo costo 10, y un login de un usuario inexistente sigue comparando contra el señuelo y respondiendo el mismo 401 que una contraseña equivocada.
- [ ] El sistema sigue aceptando el login de una cuenta cuyo hash se guardó con costo 10 aunque el servidor corra con costo 4, porque `bcrypt.compare` lee el costo del propio hash (comprobado contra Postgres real con un hash de costo 10 sembrado a mano).
- [ ] Las cuentas creadas por la API durante `npm run test:db` quedan con hash de costo 4 (comprobado contra Postgres real mirando el prefijo `$2b$04## Descripción

La suite contra Postgres real (`npm run test:db`) falla al azar cuando la máquina está cargada: los tests que crean usuarios y hacen login superan el límite de 15 segundos ("Test timed out in 15000ms"). Se comprobó el 2026-10-10 que pasa igual en `dev` sin ninguna spec nueva (3 de 4 corridas con carga), y que la causa es bcrypt: cada hash o comparación con costo 10 tarda ~51 ms, Node los hace de a 4 en paralelo, y 16 archivos de test a la vez los ponen en fila. En producción eso no es un problema (pocos logins, y el token dura días), pero un test que falla al azar hace que nadie le crea a la suite. Esta spec baja el costo de bcrypt a 4 (~1 ms) SOLO cuando `NODE_ENV` es exactamente `test`, que lo ponen las configs de Vitest; cualquier otro valor, o ninguno, sigue en 10. De paso, el costo hoy está repetido en `usuarios.controller.ts` y `db/seed.ts`: pasa a un único lugar. El hash señuelo del login (que hace que un usuario inexistente tarde lo mismo que uno real) se arma con el mismo costo que los hashes reales, para que esa protección siga siendo cierta también en los tests. No cambia nada en producción ni en desarrollo: ni el costo, ni los hashes ya guardados, ni el tiempo de respuesta.

## Criterios de aceptación

 de `password_hash`).
- [ ] La suite `npm run test:db`, corrida sola, pasa completa en 6 corridas seguidas sin ningún "Test timed out", y CLAUDE.md anota que no se corre a la vez que otra suite de tests; el resultado queda anotado en la bitácora. (Reescrito durante la implementación, con el visto bueno del owner: la versión anterior pedía pasar con los tests del frontend corriendo a la vez, y se comprobó que eso satura la CPU de la máquina —Vitest tarda más en cargar los archivos que en correr los tests— con o sin bcrypt, así que medía la máquina y no el código.)

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-022', () => { ... })

Así un `grep SPEC-ALE186-022` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
