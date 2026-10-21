---
id: SPEC-KRILINXI-041
name: Historial de boletas
slug: historial-boletas
status: finished
owner: krilinxito
created: 2026-10-19
scope:
  - frontend/src/features/historial/**
  - frontend/src/features/ordenes/api/**
  - frontend/src/pages/rutas.tsx
  - frontend/src/pages/rutas.test.ts
  - frontend/src/components/iconos.tsx
  - frontend/src/lib/tamanoDePagina.ts
  - frontend/src/hooks/**
  - frontend/src/features/mostrador/components/**
  - frontend/src/features/usuarios/components/**
  - frontend/src/features/sucursales/components/**
  - frontend/src/features/pendientes/components/**
  - frontend/src/features/estadisticas/**
  - frontend/src/features/auditoria/**
  - frontend/src/test/**
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-040
  - SPEC-KRILINXI-037
tests:
  - frontend\src\features\historial\api\historialApi.test.ts
  - frontend\src\features\historial\api\historialLocal.test.ts
  - frontend\src\features\historial\components\PantallaHistorial.test.tsx
  - frontend\src\features\historial\filtro.test.ts
  - frontend\src\hooks\usePaginado.test.ts
  - frontend\src\lib\tamanoDePagina.test.ts
  - frontend\src\paginacion.test.tsx
  - frontend\src\test\arquitectura.test.ts
---

## Descripción

Las boletas pasadas hoy solo se encuentran desde el Mostrador, de a una. Esta spec agrega **Historial de boletas** (/boletas): una lista con buscador vivo (SPEC-KRILINXI-032) y filtros (estado, fechas, con saldo pendiente y, para el admin, sucursal), con los estilos de SPEC-KRILINXI-037.

El EMPLEADO (o el ADMIN mientras atiende) ve los **últimos 30 días** de su sucursal de trabajo, desde la base local, también sin internet. El ADMIN ve el **historial completo** de todas las sucursales, pedido a la API (SPEC-KRILINXI-040, con `usePedidoOnline`): sin internet lo dice, como las estadísticas.

**Ninguna lista larga se muestra de golpe, en ninguna parte de la interfaz.** Todo lo que puede crecer —el historial, la ropa en el local, la ropa de un cliente, lo de "Hoy en la sucursal", Personal, Sucursales, los registros para corregir, la auditoría y las listas de las estadísticas— se pagina. Cuántos caben en una página depende del ancho del dispositivo (menos en un celular, más en una pantalla ancha) y se decide en un solo lugar; el buscador es un complemento de la paginación, no un reemplazo.

## Criterios de aceptación

- [ ] Todas las listas que pueden crecer se paginan (Anteriores · Página 2 de 3 · Siguientes), también las que se leen de la base local; la barra se ve siempre que haya algo en la lista, también con una sola página ("Página 1 de 1", con los botones apagados), para saber que está paginada; con la lista vacía no se dibuja.
- [ ] Cuántas boletas (o filas) entran en una página depende del ancho de la pantalla —6 en angosta (menos de 640px), 10 en mediana (hasta 1023px) y 20 en ancha— y sale de un solo lugar; si la pantalla cambia de tamaño, la página se ajusta sin quedar fuera de rango.
- [ ] Cambiar un filtro o lo que se busca vuelve a la primera página; si al borrarse un registro (por ejemplo, al corregir uno) la página actual queda vacía, se pasa a la última que tenga.
- [ ] Un test de arquitectura vigila que las pantallas con listas largas usen la paginación, para que una lista nueva no nazca sin ella.
- [ ] El menú tiene "Historial de boletas" para todos; cada uno ve lo que le corresponde.
- [ ] Quien atiende ve las boletas de su sucursal de trabajo de los últimos 30 días (por fecha de entrada en Bolivia), de la base local, sin pedir nada a la API, también sin internet.
- [ ] El ADMIN que no atiende ve el historial completo de todas las sucursales, de la API, paginado; sin internet dice "El historial completo necesita conexión" y no muestra una lista vacía.
- [ ] Se puede buscar mientras se escribe por número de boleta, nombre o teléfono del cliente, y filtrar por estado, por fechas y por "con saldo pendiente"; el admin, además, por sucursal. Los filtros se combinan y se pueden limpiar de un toque.
- [ ] Cada boleta de la lista muestra número, cliente, fecha de entrada, estado (insignia) y lo que falta pagar.
- [ ] Tocar una boleta de la sucursal de trabajo la abre en el Mostrador (`enlaceABoleta`); el admin que no atiende ve su detalle de solo lectura.
- [ ] Sin resultados, lo dice en palabras y ofrece limpiar los filtros.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-041', () => { ... })

Así un `grep SPEC-KRILINXI-041` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
