---
id: SPEC-ALE186-016
name: Límite de intentos en el login
slug: login-limite-intentos
status: draft
owner: ale186
created: 2026-10-08
scope:
  - backend/src/controllers/auth.controller.ts
  - backend/src/services/**
  - backend/src/utils/ApiError.ts
  - backend/tests/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

Hoy nada frena a quien prueba contraseñas sin parar en `POST /api/auth/login`: el único costo es el tiempo de bcrypt. Esta spec limita los intentos fallidos seguidos por nombre de usuario: después de 5, ese usuario no puede entrar durante 5 minutos, ni siquiera con la contraseña correcta. Los números son cortos a propósito: en un mostrador, una persona mayor puede equivocarse varias veces seguidas, y un bloqueo largo la dejaría sin trabajar. El contador vive en la memoria del proceso (un servicio en `services/`), no en la base: no hay migraciones y una tabla nueva exigiría `down -v`; a cambio, se pierde si el servidor se reinicia y no sirve si algún día hay más de una instancia del backend (queda anotado en CLAUDE.md §13). El bloqueo es por nombre de usuario aunque ese nombre no exista: si solo se bloquearan los existentes, la respuesta delataría qué usuarios son reales (la misma razón por la que el login ya responde igual a "no existe" y a "contraseña mal", SPEC-ALE186-002). La renovación no se limita: no recibe contraseña, solo un token firmado.

## Criterios de aceptación

- [ ] El sistema responde 429 `DEMASIADOS_INTENTOS`, con un mensaje en español que dice cuánto esperar, al sexto intento de login después de 5 fallidos seguidos para el mismo nombre de usuario, aunque esa vez la contraseña sea la correcta.
- [ ] El sistema vuelve a aceptar el login de ese usuario cuando pasan 5 minutos desde el bloqueo, y le da otros 5 intentos.
- [ ] El sistema reinicia el contador de un usuario cuando entra bien: equivocarse 4 veces, entrar, y equivocarse 4 veces más no bloquea.
- [ ] El sistema cuenta los intentos por nombre de usuario, no globales: los fallos de un usuario no bloquean a otro.
- [ ] El sistema bloquea igual un nombre de usuario que no existe, y responde lo mismo que para uno que existe: el bloqueo no delata qué usuarios son reales.
- [ ] El sistema no consulta la base ni compara la contraseña mientras el usuario está bloqueado, y no anota LOGIN en la auditoría.
- [ ] El sistema no limita `POST /api/auth/renovar`.
- [ ] El sistema no cuenta como intento fallido una petición rechazada con 400 por venir sin usuario o sin contraseña.
- [ ] Los tests manejan el tiempo con un reloj falso (sin esperar 5 minutos de verdad) y comprueban el borde: a los 4:59 sigue bloqueado y a los 5:00 ya no.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-016', () => { ... })

Así un `grep SPEC-ALE186-016` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
