---
id: SPEC-KRILINXI-057
name: 'Registrar ropa: guardar al final dentro de la boleta'
slug: registrar-ropa-boleta
status: in-progress
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/src/features/ordenes/**
  - frontend/src/features/clientes/**`
  - frontend/src/features/mostrador/**
priority: medium
depends_on: []
tests: []
---

## Descripción

El formulario de Registrar ropa confunde: dentro de la tarjeta de cliente nuevo hay un botón "Buscar un cliente que ya existe" que parece obligatorio enviar, cuando el guardado está al final de todo; y la boleta repite un buscador de cliente. Se reordena para que guardar quede al final, dentro de la boleta; se quita la búsqueda dentro de la boleta (el cliente se elige antes, en el Mostrador) y el botón de la tarjeta de cliente nuevo pasa a decir "Atrás". Se decide en la spec si se agrega una ruta por boleta o se mantiene /mostrador?registrar; la preferencia es no crear ruta nueva. El alta del cliente, la orden y el adelanto se siguen guardando en una sola transacción (SPEC-KRILINXI-034). Además, desde el detalle de una boleta hay un botón «Nueva boleta de este cliente» que abre Registrar ropa con ese cliente ya elegido: es la forma natural de cargar la segunda prenda de quien ya está en el mostrador, sin volver a buscarlo.

## Criterios de aceptación

- [ ] La tarjeta de cliente nuevo tiene un botón que dice "Atrás" en lugar de "Buscar un cliente que ya existe", y vuelve a elegir cliente sin guardar nada.
- [ ] Dentro de la boleta ya no hay buscador de clientes: el cliente viene elegido o dado de alta antes de llegar a ella.
- [ ] El único botón que guarda está al final de la boleta y es la acción principal de la pantalla (una sola, SPEC-KRILINXI-037).
- [ ] El alta del cliente nuevo, la orden y el adelanto siguen guardándose juntos, todo o nada, y la cola sube el cliente antes que su orden.
- [ ] En el detalle de una boleta (Mostrador) hay un botón secundario «Nueva boleta de este cliente» que abre Registrar ropa con el cliente de esa boleta ya elegido (sin buscador); al guardar, vuelve a la ficha de ese cliente con la boleta nueva. No cuenta como acción principal (sigue habiendo una sola, SPEC-KRILINXI-037) y respeta que la fila de acciones tenga como mucho cuatro botones (SPEC-KRILINXI-049): va fuera de ella.
- [ ] Dentro de una boleta abierta (las boletas no son rutas aparte: cargan en la misma pantalla del Mostrador) ya no se ven el botón «Registrar ropa» de arriba ni el buscador de clientes y boletas: ahí no se está «en el mostrador». Se vuelven a ver al volver a la ficha del cliente o al inicio.
- [ ] Quedó decidido y anotado en la bitácora si se usa ruta nueva por boleta; si no, las rutas actuales (/registrar-ropa y /mostrador?registrar) siguen funcionando.
- [ ] Salir con algo escrito sigue pidiendo confirmación (SPEC-KRILINXI-048), y un campo nuevo, si lo hubiera, entra en hayEscrito.
- [ ] Los tests nuevos llevan el id de esta spec en su describe, no queda jerga en pantalla (sinJerga) y la suite completa sigue en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-057', () => { ... })

Así un `grep SPEC-KRILINXI-057` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
