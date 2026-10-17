---
id: SPEC-KRILINXI-025
name: Pantallas del mostrador con el tema
slug: estilo-mostrador
status: draft
owner: krilinxito
created: 2026-10-17
scope:
  - frontend/src/features/ordenes/components/**
  - frontend/src/features/ordenes/estado.ts
  - frontend/src/features/ordenes/estado.test.ts
  - frontend/src/features/entregas/components/**
  - frontend/src/features/clientes/components/**
  - frontend/src/test/arquitectura.test.ts
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-024
tests: []
---

## Descripción

Cuarta spec de la ola estética. Las pantallas que se usan todo el día en el mostrador —Registrar ropa, Ropa en el local, Cobrar, Entregar ropa y Clientes— todavía pintan con la paleta cruda (unas 85 clases entre `ordenes`, `entregas` y `clientes`). Esta spec las pasa a las piezas y los colores del tema (SPEC-KRILINXI-022): cada orden de la lista es una `Tarjeta`, su estado una `Insignia` con texto, los errores y confirmaciones un `Aviso`, y los formularios van en una sola columna con los campos y botones grandes de siempre.

Qué tono lleva cada estado de la orden es del negocio, así que se decide en `features/ordenes/estado.ts`, junto a `estadoEfectivo`, y no en `components/`. El estado se sigue leyendo en palabras: el color solo ayuda a encontrarlo de un vistazo. No cambia ningún comportamiento ni ningún texto: es la misma pantalla, mejor vestida.

## Criterios de aceptación

- [ ] `features/ordenes/estado.ts` exporta el tono de cada estado (RECIBIDO neutro, EN_PROCESO información, LISTO éxito, ENTREGADO neutro, ANULADO peligro) tipado sobre todos los `ESTADOS_ORDEN`, y un test comprueba que ninguno queda sin tono.
- [ ] En la lista de Ropa en el local, Cobrar y Entregar ropa, cada orden se muestra como una tarjeta con su boleta, el cliente y una `Insignia` con el estado efectivo en palabras (`estadoEfectivo`) y el tono que le corresponde.
- [ ] El detalle de una orden agrupa sus datos, sus cobros y su saldo en `Tarjeta` con título; el saldo pendiente se destaca en tamaño grande, y en tono de peligro solo si es mayor que cero.
- [ ] Los mensajes de error, de éxito y de "no se puede" de estas pantallas usan `Aviso` con el tipo que corresponde, con el mismo texto que hoy y el mismo rol para el lector de pantalla.
- [ ] La tarjeta del cliente (alta, búsqueda y "Cambiar datos") y los formularios de registrar, cobrar y entregar usan `Tarjeta`, `CampoTexto` y `Boton` del tema, sin colores escritos a mano.
- [ ] La regla de la paleta cruda de `test/arquitectura.test.ts` cubre también `features/ordenes/`, `features/entregas/`, `features/clientes/` y `features/pagos/`, y pasa.
- [ ] Toda la suite existente pasa sin cambiar ningún texto ni rol, también en modo lento (`LENTO_MS=200`).

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-025', () => { ... })

Así un `grep SPEC-KRILINXI-025` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
