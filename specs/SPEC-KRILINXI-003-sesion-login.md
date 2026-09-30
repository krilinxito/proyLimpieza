---
id: SPEC-KRILINXI-003
name: Ingresar al sistema y guardar la sesión
slug: sesion-login
status: in-progress
owner: krilinxito
created: 2026-09-30
scope:
  - frontend/src/lib/api.ts
  - frontend/src/lib/api.test.ts
  - frontend/src/features/auth/**
  - frontend/src/hooks/useSession.ts
  - frontend/src/pages/rutas.tsx
  - frontend/src/pages/Inicio.tsx
  - frontend/src/App.tsx
  - frontend/src/App.test.tsx
  - frontend/src/test/**
priority: high
depends_on: []
tests: []
---

## Descripción

Le da identidad al frontend: quién está usando la tablet y con qué rol. Implementa la pantalla /ingresar contra `POST /api/auth/login` (SPEC-ALE186-002), guarda en el dispositivo las dos credenciales que devuelve —el token de la API y el de PowerSync— junto con los datos del usuario, y protege las rutas del negocio para que no se puedan abrir sin sesión.

Incluye el cliente axios único del proyecto (`lib/api.ts`): el único sitio que conoce `VITE_API_URL`, que pone el token en cada petición y que convierte el formato de error uniforme de la API (`{ error: { codigo, mensaje } }`) en un error tipado con el `mensaje` listo para mostrar. Las features siguientes (clientes, órdenes, la cola de PowerSync) lo van a usar tal cual, así que fija cómo se habla con el servidor.

Menú por rol, decidido: el EMPLEADO ve Registrar ropa, Entregar ropa, Cobrar y Clientes; el ADMIN ve todo, incluida Estadísticas. Esconder el botón es comodidad, no control de acceso: el backend sigue siendo quien dice que no (CLAUDE.md §8).

Queda FUERA, a propósito: qué pasa cuando el token vence, la renovación al reconectar y pedir la contraseña cuando la renovación falla (van en `conexion-y-renovacion`, junto con el aviso de conexión); y usar el token de PowerSync, que aquí solo se guarda para que `powersync-local` lo encuentre. La sesión dura hasta que la persona salga o hasta que un 401 de la API la invalide.

## Criterios de aceptación

- [ ] El sistema muestra la pantalla de ingreso, con campos de usuario y contraseña y un botón "Entrar", cuando alguien abre cualquier ruta del negocio sin sesión guardada, y después de ingresar lo lleva a la pantalla que había pedido.
- [ ] El sistema llama a POST /api/auth/login con username y password, y al recibir 200 guarda en el dispositivo el token de la API, el token de PowerSync y los datos del usuario (id, nombre completo, rol y sucursal).
- [ ] El sistema muestra debajo del formulario el `mensaje` que devuelve la API cuando el login responde con error (401 o 400), sin mostrar códigos ni números de estado.
- [ ] El sistema muestra "No hay conexión con el servidor. Para entrar hace falta internet." cuando el login no recibe respuesta, y no guarda nada.
- [ ] El sistema no permite enviar el formulario con usuario o contraseña vacíos, y lo indica en el campo que falta sin llamar a la API.
- [ ] El sistema conserva la sesión al recargar la página o cerrar y abrir el navegador, sin pedir la contraseña ni llamar a la API.
- [ ] El cliente de la API es el único módulo que conoce VITE_API_URL, y agrega `Authorization: Bearer <token>` a cada petición cuando hay sesión guardada.
- [ ] El cliente de la API convierte una respuesta con el formato de error uniforme en un error tipado con `codigo`, `mensaje` y `status`, y una falla de red en un error distinguible de ese, para que las features traten los dos casos sin leer axios.
- [ ] El sistema borra la sesión guardada y vuelve a la pantalla de ingreso cuando una petición autenticada a la API responde 401 NO_AUTENTICADO.
- [ ] El menú muestra Registrar ropa, Entregar ropa, Cobrar y Clientes a un EMPLEADO, y además Estadísticas a un ADMIN; un EMPLEADO que abre /estadisticas escribiendo la dirección ve una pantalla que le dice que esa parte es solo para el administrador.
- [ ] El sistema muestra el nombre de quien está usando la tablet y un botón "Salir"; al tocarlo pide confirmación avisando que para volver a entrar hace falta internet, y solo después de confirmar borra la sesión del dispositivo y vuelve a la pantalla de ingreso.
- [ ] Ningún componente de pantalla llama a axios ni lee el almacenamiento del navegador directamente: pasan por features/auth/api, el cliente de lib/api o el hook useSession.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-003', () => { ... })

Así un `grep SPEC-KRILINXI-003` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
