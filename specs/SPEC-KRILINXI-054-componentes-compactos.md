---
id: SPEC-KRILINXI-054
name: 'Componentes compactos: ver contraseña, paginación y cabecera chica'
slug: componentes-compactos
status: draft
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/src/components/**
  - frontend/src/pages/**
  - frontend/src/features/auth/**
priority: medium
depends_on: []
tests: []
---

## Descripción

Tres arreglos de interfaz compartida. (1) El ingreso no deja ver lo que se escribe en la contraseña, y a personas mayores esto les causa errores: se agrega un botón para mostrarla y ocultarla. (2) La paginación ocupa demasiado y se reparte en varios bloques: pasa a un solo bloque más pequeño, en todas sus apariciones (historial, mostrador, ficha de cliente, personal, sucursales, auditoría, estadísticas y registros para corregir), por el componente compartido Paginas. (3) La cabecera del marco no se adapta bien a pantallas pequeñas (celular): se reacomoda para que nada se corte ni se amontone. Sigue valiendo el tamaño de letra y de botones de CLAUDE.md §9, y el tema claro y oscuro.

## Criterios de aceptación

- [ ] En el ingreso, un botón junto al campo de contraseña la muestra y la oculta; por defecto está oculta, el botón tiene nombre accesible en palabras ("Mostrar contraseña" / "Ocultar contraseña") y no envía el formulario.
- [ ] La contraseña mostrada nunca se guarda ni se escribe en el estado de la sesión; al enviar, el pedido a /api/auth/login lleva lo escrito igual que antes.
- [ ] Paginas muestra anterior, el texto "Página X de Y" y siguiente en un solo bloque, más pequeño que el actual, y lo mismo en todas las pantallas que lo usan, sin dejar de cumplir el tamaño mínimo tocable de 48px.
- [ ] Un test comprueba que todas las apariciones de la paginación usan el mismo bloque (un solo nav por lista) y que "Página 1 de 1" se sigue viendo cuando todo cabe.
- [ ] En un ancho de celular (por ejemplo 360px) la cabecera muestra el negocio, la sucursal, quién atiende, el estado de la conexión, el tema y Salir sin que ningún texto se corte ni se desborde horizontalmente; lo que no cabe pasa al menú o se abrevia.
- [ ] El menú, el cajón y el resto del marco siguen funcionando igual en pantalla ancha (desde 1024px).
- [ ] Los tests nuevos llevan el id SPEC-KRILINXI-054 en su describe y la suite completa sigue en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-054', () => { ... })

Así un `grep SPEC-KRILINXI-054` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
