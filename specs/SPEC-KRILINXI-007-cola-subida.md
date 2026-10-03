---
id: SPEC-KRILINXI-007
name: Subir lo registrado y avisar qué falta guardar
slug: cola-subida
status: in-progress
owner: krilinxito
created: 2026-10-03
scope:
  - frontend/src/lib/powersync/**
  - frontend/src/features/auth/SesionProvider.tsx
  - frontend/src/features/auth/SesionProvider.test.tsx
  - frontend/src/features/pendientes/**
  - frontend/src/hooks/useConexion.ts
  - frontend/src/components/AvisoConexion.tsx
  - frontend/src/components/AvisoConexion.test.tsx
  - frontend/src/App.tsx
  - frontend/src/pages/rutas.tsx
  - frontend/src/test/**
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-006
tests: []
---

## Descripción

Cierra el camino de SUBIDA de CLAUDE.md §6: lo que el mostrador escribió en la base local llega al servidor. Hoy `uploadData` lanza `SubidaNoDisponible` a propósito (SPEC-KRILINXI-004) y todo espera en la cola. Esta spec lo reemplaza por la subida real, a través de `lib/api` (que ya pone el token y traduce los errores):

- PUT de clientes → `POST /api/clientes`; PATCH de clientes → `PATCH /api/clientes/:id`
- PUT de ordenes → `POST /api/ordenes`; PATCH de ordenes → `PATCH /api/ordenes/:id`
- PUT de pagos → `POST /api/pagos`; PUT de entregas → `POST /api/entregas`

El cuerpo es el `opData` de PowerSync más el `id`, con los nombres de columna en snake_case, que es lo que esperan los controllers. El reintento es seguro porque el backend es idempotente por id (200 en el reintento).

Tres casos, y ninguno puede quedar en silencio (CLAUDE.md §6):
- **Aceptado** (2xx): la transacción se da por subida.
- **Sin conexión o error del servidor** (sin respuesta, 5xx): se lanza y PowerSync reintenta más tarde, con la cola intacta.
- **Rechazado** (400, 404, 409): los datos y el mensaje del servidor se guardan en una tabla **solo local** de "registros para corregir", y la transacción se da por terminada. Si no se diera por terminada, un solo rechazo trabaría todo lo que viene detrás. Si se diera por terminada sin guardar nada, PowerSync revertiría la fila local en la siguiente sincronización y la ropa desaparecería de la pantalla.

Incluye el aviso de CLAUDE.md §9, siempre visible y en palabras: "Trabajando sin internet — N registros se guardarán cuando vuelva la conexión", y cuántos registros hay para corregir.

Y una red de seguridad que hoy falta: SPEC-KRILINXI-004 borra la base local cuando la API responde 401. Con escrituras reales, eso borraría el trabajo de un empleado cuyo token venció mientras estaba sin internet. Mientras la cola tenga cambios sin subir, la base NO se borra: la app pide volver a ingresar y la subida sigue con la sesión nueva (CLAUDE.md §13: el trabajo de la cola nunca se descarta en silencio). Lo que pasa con la cola de un usuario dado de baja se cierra en `renovar-sesion`, que necesita al backend.

Queda FUERA: corregir y volver a enviar un registro rechazado (aquí solo se muestra, con el mensaje del servidor y los datos), y renovar el token.

## Criterios de aceptación

- [ ] uploadData envía cada operación de la cola al endpoint que le corresponde según la tabla y el tipo (PUT → POST, PATCH → PATCH /:id), con el id y el opData en snake_case, en el orden de la cola, y un test lo comprueba contra el servidor falso para clientes, ordenes, pagos y entregas.
- [ ] El sistema da la transacción por subida cuando el servidor responde 2xx, incluido el 200 de un reintento.
- [ ] Cuando no hay conexión o el servidor responde 5xx, uploadData lanza y la cola queda intacta, y un test lo comprueba sobre la base local de prueba.
- [ ] Cuando el servidor responde 400, 404 o 409, el sistema guarda en una tabla solo local la tabla, el id, los datos enviados, el código y el mensaje del error, da la transacción por terminada y sigue con las siguientes.
- [ ] Una operación que la API no admite (como un DELETE) se guarda como registro para corregir, nunca se descarta en silencio.
- [ ] La tabla solo local de registros para corregir no se sube ni viene de las sync rules, y el test de schema que compara el schema local con las sync rules la deja fuera a propósito.
- [ ] El aviso de conexión está visible en todas las pantallas con sesión y dice en palabras si hay internet y cuántos registros esperan para guardarse ("Trabajando sin internet — 3 registros se guardarán cuando vuelva la conexión").
- [ ] Cuando hay registros para corregir, el aviso lo dice con el número y lleva a una pantalla que los lista, cada uno con su mensaje del servidor y sus datos principales (boleta, cliente o monto).
- [ ] Cuando la API responde 401 y la cola tiene cambios sin subir, el sistema no borra la base local: pide volver a ingresar y, al hacerlo, la subida continúa con la sesión nueva.
- [ ] Cuando la API responde 401 y la cola está vacía, el sistema borra la base local como hasta ahora.
- [ ] Ningún texto del aviso ni de la pantalla de registros para corregir usa palabras del sistema (sincronizar, cola, servidor, token).

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-007', () => { ... })

Así un `grep SPEC-KRILINXI-007` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
