---
id: SPEC-KRILINXI-034
name: Registrar ropa desde el mostrador
slug: mostrador-registrar
status: finished
owner: krilinxito
created: 2026-10-18
scope:
  - frontend/src/features/mostrador/**
  - frontend/src/features/ordenes/components/**
  - frontend/src/features/ordenes/hooks/**
  - frontend/src/features/clientes/components/**
  - frontend/src/pages/rutas.tsx
  - frontend/src/pages/rutas.test.ts
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-033
tests:
  - frontend/src/App.test.tsx
  - frontend/src/components/BuscadorVivo.test.tsx
  - frontend/src/features/atencion/components/AtenderEnUnaSucursal.test.tsx
  - frontend/src/features/mostrador/components/RegistrarEnMostrador.test.tsx
  - frontend/src/features/ordenes/api/ordenesLocal.test.ts
  - frontend/src/pages/Marco.test.tsx
  - frontend/src/pages/rutas.test.ts
---

## Descripción

Hoy, para registrar ropa, primero se busca al cliente por teléfono y, si no aparece, recién ahí se lo da de alta: con un cliente que viene por primera vez son dos pantallas antes de llegar a la ropa.

El Mostrador (SPEC-KRILINXI-033) suma un botón "Registrar ropa" siempre a mano. Abre el formulario de la ropa con el cliente arriba: se elige con el buscador vivo (SPEC-KRILINXI-032), o con "Cliente nuevo" se cargan nombre y teléfono ahí mismo, sin cambiar de pantalla, y se sigue con la ropa. Si ya estaba abierta la ficha de un cliente, viene elegido. /registrar-ropa redirige al Mostrador con el formulario abierto. Las validaciones son las de siempre (`validarCliente`, boleta única por sucursal, adelanto).

## Criterios de aceptación

- [ ] El Mostrador tiene un botón "Registrar ropa" visible siempre, también con la ficha de un cliente abierta.
- [ ] Desde la ficha de un cliente, "Registrar ropa" abre el formulario con ese cliente ya elegido.
- [ ] Sin cliente elegido, el formulario empieza por el buscador vivo; elegir un resultado lo pone como cliente sin salir del formulario.
- [ ] "Cliente nuevo" despliega nombre y teléfono dentro del mismo formulario (con lo ya escrito en el buscador como punto de partida); al guardar se da de alta al cliente y se registra la ropa juntos, y si el teléfono ya existe lo dice y ofrece elegir a ese cliente.
- [ ] La boleta se valida contra la sucursal de trabajo y el adelanto como hoy; los mensajes de error son los de SPEC-KRILINXI-006.
- [ ] Al guardar se ve el resumen de siempre y se vuelve a la ficha del cliente con la boleta nueva.
- [ ] /registrar-ropa lleva al Mostrador con el formulario abierto, y el menú ya no la lista aparte.
- [ ] Todo funciona sin internet; el alta y la orden quedan en la cola en ese orden.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-034', () => { ... })

Así un `grep SPEC-KRILINXI-034` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
