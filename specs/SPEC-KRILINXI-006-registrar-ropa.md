---
id: SPEC-KRILINXI-006
name: 'Registrar ropa: la orden y su adelanto'
slug: registrar-ropa
status: in-progress
owner: krilinxito
created: 2026-10-03
scope:
  - frontend/src/features/ordenes/**
  - frontend/src/features/pagos/**
  - frontend/src/features/clientes/**
  - frontend/src/lib/money.ts
  - frontend/src/lib/money.test.ts
  - frontend/src/pages/rutas.tsx
  - frontend/src/test/**
  - CLAUDE.md
priority: high
depends_on: []
tests: []
---

## Descripción

La pantalla central del mostrador: el cliente deja ropa y sale con su boleta. El empleado busca al cliente por teléfono (reusa `features/clientes`, y si no existe lo registra sin salir de la pantalla), copia el número de la boleta física, describe la ropa, pone el precio y, si quiere, la fecha estimada de entrega. Opcionalmente cobra un adelanto. Todo se escribe en la base local, con el mismo patrón que SPEC-KRILINXI-005 (SQL en `api/`, hook y componentes), y queda en la cola. El backend ya lo acepta: `POST /api/ordenes` (SPEC-ALE186-004) y `POST /api/pagos` (SPEC-ALE186-005).

Tres piezas que las pantallas siguientes reusan:
- `lib/money` gana la conversión de centavos al texto decimal que guarda la base local ("25.50"). Ningún monto se escribe como float (CLAUDE.md §6).
- El saldo de una orden (precio, o precio final si hay entrega, menos la suma de pagos) se calcula en un solo lugar, en `features/pagos`, en centavos. Lo usarán `ordenes-sucursal` y `entregar-ropa`.
- La regla de arquitectura que la 005 puso solo para clientes (los componentes no tocan la base local) pasa a `test/arquitectura.test.ts` y cubre todas las features.

`/registrar-ropa` queda solo para EMPLEADO. El ADMIN no tiene sucursal ni órdenes en su dispositivo, así que no hay contra qué validar la boleta ni dónde guardar la orden. El admin atendiendo el mostrador queda para una spec futura, si hace falta.

Queda FUERA: subir la cola y mostrar rechazos del servidor (`cola-subida`), imprimir la boleta (es preimpresa) y cambiar el estado de la orden (`ordenes-sucursal`).

## Criterios de aceptación

- [ ] El sistema permite elegir al cliente buscándolo por teléfono en la base local y, si no existe, registrarlo sin salir de la pantalla, quedando elegido al guardarse.
- [ ] El sistema no guarda la orden y dice qué hacer cuando falta el cliente, el número de boleta o la descripción, cuando la boleta tiene más de 30 caracteres, o cuando el precio no es un número mayor o igual a cero con hasta dos decimales.
- [ ] El sistema no guarda y muestra "Ese número de boleta ya está usado en esta sucursal. Revisá el papel y volvé a escribirlo." cuando la base local ya tiene una orden de la sucursal del empleado con ese número.
- [ ] El sistema guarda la orden en la base local con id de crypto.randomUUID(), estado RECIBIDO, la sucursal y el usuario de la sesión, fecha_entrada en ISO 8601 con zona, fecha_estimada_salida como AAAA-MM-DD o vacía, y precio_total como texto decimal ("25.50"); la cola queda con un PUT de ordenes con esas columnas.
- [ ] El sistema registra un adelanto opcional como un pago de tipo ADELANTO con su método (de METODOS_PAGO), mayor que cero y no mayor que el precio, guardado en la base local y encolado después de la orden.
- [ ] El sistema no guarda nada, ni la orden ni el adelanto, si el adelanto es inválido.
- [ ] lib/money convierte centavos al texto decimal de la base local y de vuelta sin pérdida, y un test lo comprueba con montos como 0, 0.10, 25.50 y 99999999.99.
- [ ] El saldo de una orden se calcula en un único módulo de features/pagos, en centavos, como (precio final si hay entrega, si no precio total) menos la suma de sus pagos, y tiene tests propios.
- [ ] Al terminar, el sistema muestra la boleta, el cliente, el precio, el adelanto y el saldo en Bs, y ofrece registrar otra ropa.
- [ ] La ruta /registrar-ropa solo la abre un EMPLEADO: no aparece en el menú de un ADMIN y, si la abre, ve un aviso en vez del formulario.
- [ ] El sistema registra ropa sin conexión y sin ninguna petición a la API, y un test lo comprueba sobre la base local de prueba con SQL real.
- [ ] test/arquitectura.test.ts prohíbe a los componentes de todas las features importar lib/powersync, usar useBaseLocal o ejecutar SQL, y la regla particular de features/clientes deja de existir.
- [ ] Ningún texto de la pantalla usa palabras del sistema ("orden" se dice "ropa" o "boleta"; nada de sincronizar, servidor o token), y un test lo comprueba en cada paso.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-006', () => { ... })

Así un `grep SPEC-KRILINXI-006` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
