---
id: SPEC-KRILINXI-044
name: La tendencia de lo cobrado en el dashboard
slug: tendencia-ingresos
status: in-progress
owner: krilinxito
created: 2026-10-19
scope:
  - frontend/src/features/estadisticas/**
  - frontend/src/test/estadisticasDePrueba.ts
  - frontend/src/index.css
  - frontend/src/test/tema.test.ts
priority: medium
depends_on:
  - SPEC-KRILINXI-043
  - SPEC-KRILINXI-042
tests: []
---

## Descripción

Con lo cobrado por día (SPEC-KRILINXI-043), el dashboard de Estadísticas (SPEC-KRILINXI-042) suma un gráfico de tendencia: cómo vino la caja día a día en el período elegido, con el total y por forma de pago. Es un gráfico de línea del proyecto, en SVG y sin librería, con las mismas reglas que los demás (SPEC-KRILINXI-026): nombre, tabla para el lector de pantalla, nada que dependa del mouse y los colores validados.

## Criterios de aceptación

- [ ] El dashboard tiene una tarjeta "¿Cómo vino la caja día a día?" con una línea del total cobrado por día en el período y sucursal elegidos.
- [ ] Se puede ver también por forma de pago (una línea por forma, con los colores serie-1 a serie-4 y la leyenda de siempre), sin pasar de cuatro líneas.
- [ ] Cada punto del gráfico se puede tocar o enfocar con el teclado y escribe su detalle (día, total y desglose), como las barras de SPEC-KRILINXI-026.
- [ ] El gráfico tiene nombre accesible y su tabla para el lector de pantalla con los mismos números, que es donde los tests leen los valores.
- [ ] Los días sin cobros se dibujan en cero, sin cortar la línea.
- [ ] La respuesta de la API se comprueba contra su contrato como las demás (`estadisticasApi.ts`), y `test/estadisticasDePrueba.ts` arma respuestas válidas del endpoint nuevo.
- [ ] Sin internet, como el resto del panel, dice que las estadísticas necesitan conexión; revisado a mano en Chrome en claro y en oscuro, a 360px y a 1280px.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-044', () => { ... })

Así un `grep SPEC-KRILINXI-044` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
