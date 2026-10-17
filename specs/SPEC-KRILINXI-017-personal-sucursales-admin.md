---
id: SPEC-KRILINXI-017
name: Administrar el personal y las sucursales
slug: personal-sucursales-admin
status: finished
owner: krilinxito
created: 2026-10-16
scope:
  - frontend/src/features/usuarios/**
  - frontend/src/features/sucursales/**
  - frontend/src/pages/rutas.tsx
  - frontend/src/test/**
  - frontend/src/hooks/**
  - frontend/src/lib/api.ts
  - frontend/src/lib/api.test.ts
  - frontend/src/features/estadisticas/**
  - frontend/src/App.test.tsx
  - frontend/src/components/AvisosAdmin.tsx
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-015
tests:
  - frontend/src/App.test.tsx
  - frontend/src/features/sucursales/api/sucursales.test.ts
  - frontend/src/features/sucursales/components/PantallaSucursales.test.tsx
  - frontend/src/features/usuarios/api/cuentas.test.ts
  - frontend/src/features/usuarios/components/PantallaPersonal.test.tsx
  - frontend/src/lib/api.test.ts
  - frontend/src/test/arquitectura.test.ts
  - frontend/src/test/red.ts
---

## Descripción

El backend ya tiene el alta, la edición y la baja de cuentas (`POST`/`PATCH /api/usuarios`, SPEC-ALE186-009) y de sucursales (`POST`/`PATCH /api/sucursales`, SPEC-ALE186-011), solo para ADMIN, pero el front no tiene ninguna pantalla para eso.

Esta spec agrega 'Personal' y 'Sucursales' al menú del admin. Las listas se leen de la base local, porque `usuarios` (sin `password_hash`) y `sucursales` bajan en el bucket `global`. Las escrituras van **por API online, no por la cola**: el alta de una cuenta lleva su contraseña, que no debe quedar guardada en el SQLite del dispositivo, y el admin trabaja con conexión (CLAUDE.md §8). Es una excepción a 'primero local' que esta spec deja escrita en CLAUDE.md §6/§8. Sin conexión, las listas se ven y los botones de cambio dicen que hace falta internet.

## Criterios de aceptación

- [ ] El sistema muestra 'Personal' y 'Sucursales' en el menú solo al ADMIN, y a un EMPLEADO que abre esas direcciones le muestra el aviso de solo administrador
- [ ] El sistema lista las cuentas desde la base local, con nombre, usuario, rol, sucursal y si está activa, sin pedirlas a la API
- [ ] El sistema da de alta una cuenta con nombre completo, usuario, contraseña, rol, teléfono opcional y sucursal (obligatoria para EMPLEADO, ninguna para ADMIN) enviándola directo a POST /api/usuarios
- [ ] El sistema edita el nombre, el teléfono, la sucursal y la contraseña de una cuenta con PATCH /api/usuarios, sin dejar cambiar el usuario ni el rol
- [ ] El sistema pide confirmación antes de dar de baja una cuenta, diciendo que la persona no podrá volver a entrar, y la envía como activo: false
- [ ] El sistema no ofrece dar de baja la propia cuenta del admin que está adentro
- [ ] El sistema lista las sucursales desde la base local y permite darlas de alta y editar su nombre, dirección y teléfono por API
- [ ] El sistema pide confirmación antes de cerrar una sucursal y, si la API la rechaza porque todavía tiene ropa, explica que hay que entregar o anular esa ropa primero
- [ ] El sistema no ofrece una sucursal cerrada al elegir la sucursal de una cuenta
- [ ] El sistema permite volver a abrir una sucursal cerrada, con confirmación (agregado al implementar)
- [ ] El sistema traduce los rechazos de la API (usuario o nombre de sucursal repetido, datos inválidos) a mensajes que dicen qué hacer
- [ ] El sistema no guarda la contraseña en la base local ni en la cola de subida
- [ ] El sistema deshabilita los botones de alta, edición y baja sin conexión y dice 'Para hacer cambios hace falta internet'
- [ ] El sistema no muestra palabras del sistema (sinJerga) en ninguna de las dos pantallas

## Notas

**Decidido al implementar:**
- El teléfono de una cuenta no baja a la tablet (no está en las sync rules): al editar, el campo arranca vacío y dice "dejalo vacío para no cambiarlo". Lo mismo con la contraseña.
- Una sucursal cerrada se puede volver a abrir desde la pantalla (`activa: true`, que el backend ya admitía).
- Las pantallas leen de la base local: después de guardar, el aviso dice que la lista puede tardar unos segundos en mostrar el cambio (hasta que PowerSync lo baja).
- `usePedidoOnline` pasó a `src/hooks/` para la auditoría (SPEC-KRILINXI-018); esta spec no lo usa, porque sus lecturas son locales.

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-017', () => { ... })

Así un `grep SPEC-KRILINXI-017` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
