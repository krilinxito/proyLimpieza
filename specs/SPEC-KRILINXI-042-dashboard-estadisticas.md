---
id: SPEC-KRILINXI-042
name: Estadísticas como dashboard
slug: dashboard-estadisticas
status: in-progress
owner: krilinxito
created: 2026-10-19
scope:
  - frontend/src/features/estadisticas/components/**
  - frontend/src/index.css
  - frontend/src/test/tema.test.ts
  - CLAUDE.md
priority: medium
depends_on:
  - SPEC-KRILINXI-036
  - SPEC-KRILINXI-037
tests: []
---

## Descripción

Estadísticas hoy es una columna de secciones, una debajo de otra, con más tablas y texto que gráficos. Pasa a ser un dashboard: arriba los indicadores, y debajo una grilla de tarjetas, cada una con un gráfico que responde una pregunta, con los datos que ya trae la API (SPEC-KRILINXI-015, 016 y 017). Los gráficos siguen siendo SVG del proyecto, accesibles, con su tabla para el lector de pantalla y sin depender del mouse (SPEC-KRILINXI-026); el detalle en tablas pasa a "Ver el detalle", plegado.

## Criterios de aceptación

- [ ] Debajo de los indicadores, una grilla de tarjetas con gráfico: dos por fila desde 1024px, una en pantalla angosta.
- [ ] Hay un gráfico para cada una de estas preguntas: cuánto se cobró por forma de pago, cuánto por sucursal, cuánta ropa entró cada día, cuánto falta cobrar por antigüedad, cuánta ropa falta recoger por antigüedad, cuánto atendió cada persona y quiénes son los clientes que más vienen.
- [ ] Cada gráfico tiene su título como pregunta en palabras, su nombre accesible y su tabla para el lector de pantalla, como pide SPEC-KRILINXI-026.
- [ ] Las tablas de detalle de cada sección siguen disponibles en "Ver el detalle", plegadas por defecto.
- [ ] Los colores nuevos, si hacen falta, pasan el validador de daltonismo y el test de contraste en los dos temas.
- [ ] El filtro de fechas y sucursal sigue arriba y cambia todos los gráficos a la vez; sin internet sigue diciendo que las estadísticas necesitan conexión.
- [ ] Revisado a mano en Chrome, en claro y en oscuro, a 360px y a 1280px: ningún texto encimado ni gráfico cortado.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-042', () => { ... })

Así un `grep SPEC-KRILINXI-042` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
