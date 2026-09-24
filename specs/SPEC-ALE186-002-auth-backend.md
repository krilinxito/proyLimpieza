---
id: SPEC-ALE186-002
name: Autenticación, usuarios y semilla inicial
slug: auth-backend
status: in-progress
owner: ale186
created: 2026-09-24
scope:
  - backend/src/models/usuarios.model.ts
  - backend/src/controllers/auth.controller.ts
  - backend/src/routes/auth.routes.ts
  - backend/src/routes/index.ts
  - backend/src/middleware/auth.ts
  - backend/src/middleware/roles.ts
  - backend/src/utils/jwt.ts
  - backend/src/db/seed.ts
  - backend/package.json
  - backend/tests/**
priority: high
depends_on: []
tests: []
---

## Descripción

Da identidad al backend: quién pide y desde qué sucursal. Implementa el login por `username`, la emisión de las DOS credenciales que el proyecto necesita (el JWT de nuestra API y el token que verifica PowerSync, firmado HS256 con los bytes de PS_JWT_SECRET_B64 y `aud` = PS_JWT_AUDIENCE), el middleware de sesión y el de rol, y el endpoint de renovación — que es el único punto donde se comprueba `usuarios.activo` y, por tanto, lo que hace efectiva una baja lógica. El mecanismo de sesión offline no se decide aquí: está cerrado en CLAUDE.md sección 6 y esta spec lo implementa tal cual (token de 3 días, renovación en cada reconexión, contraseña solo si la renovación falla).

Incluye la semilla inicial porque sin ella el sistema es inarrancable: el schema no inserta ni una sucursal ni un usuario, así que no se puede hacer login (no hay usuarios) ni crear el primer usuario (haría falta estar logueado). La gestión de usuarios (alta, baja, edición por parte del admin) queda FUERA: esta spec solo necesita poder leerlos y autenticarlos.

## Criterios de aceptación

- [ ] El sistema responde 200 con el token de la API y el token de PowerSync cuando se hace POST /api/auth/login con el `username` y la contraseña de un usuario activo.
- [ ] El sistema responde 401 con el código NO_AUTENTICADO y el mismo mensaje tanto si el usuario no existe como si la contraseña es incorrecta, sin revelar cuál de las dos falló.
- [ ] El sistema rechaza el login con 401 cuando las credenciales son correctas pero el usuario tiene `activo = false`.
- [ ] Ninguna respuesta de la API incluye `password_hash` en ningún caso, ni en el login ni en la renovación.
- [ ] El token de PowerSync se firma en HS256 con los bytes decodificados de PS_JWT_SECRET_B64 y lleva el `aud` igual a PS_JWT_AUDIENCE, de modo que PowerSync lo acepta.
- [ ] El sistema devuelve credenciales nuevas con el plazo reiniciado cuando se hace POST /api/auth/renovar con un token vigente de un usuario que sigue activo, y responde 401 cuando ese usuario fue dado de baja.
- [ ] El middleware de sesión deja pasar la petición con el id, el rol y la `sucursal_id` del usuario disponibles para el controlador cuando el token es válido, y responde 401 NO_AUTENTICADO cuando el token falta, está vencido o tiene la firma alterada.
- [ ] El middleware de rol responde 403 SIN_PERMISO cuando un EMPLEADO pide una ruta restringida a ADMIN, y deja pasar al ADMIN.
- [ ] El script de semilla crea una sucursal y un usuario ADMIN sobre una base vacía, toma la contraseña del entorno y nunca de código escrito en el repositorio, y no duplica nada si se ejecuta dos veces.
- [ ] Las contraseñas se guardan hasheadas con bcrypt y se verifican comparando contra el hash, nunca en texto plano.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-002', () => { ... })

Así un `grep SPEC-ALE186-002` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
