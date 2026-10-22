---
id: SPEC-KRILINXI-050
name: Tablero del admin con una pregunta principal y el resto a pedido
slug: tablero-jerarquia
status: in-progress
owner: krilinxito
created: 2026-10-22
scope:
  - frontend/src/features/estadisticas/components/PantallaEstadisticas.tsx
  - frontend/src/features/estadisticas/components/SeccionPanel.tsx
  - frontend/src/features/estadisticas/components/PantallaEstadisticas.test.tsx
  - frontend/src/features/estadisticas/components/SeccionTendencia.tsx
  - frontend/src/features/estadisticas/components/SeccionClientes.tsx
  - frontend/src/features/estadisticas/hooks/**
priority: medium
depends_on:
  - SPEC-KRILINXI-047
tests: []
---

## Descripción

El dashboard del admin (SPEC-KRILINXI-042 y -044) muestra cuatro indicadores y ocho tarjetas del mismo peso en una grilla de dos columnas: doce bloques sin una jerarquía entre ellos, que es lo más cercano a lo único que el DESIGN.md rechaza ('una app de oficina sobrecargada de datos'). Además la tendencia y los clientes piden su dato por separado, así que la pantalla se arma a saltos.

Esta spec le da orden sin quitarle información: arriba la pregunta que el dueño hace primero ('¿Cómo vino la caja?', la tendencia), junto a los indicadores; tres tarjetas a la vista; y el resto (las demás secciones) plegado bajo un 'Ver más estadísticas'. Y que el tablero no se arme a saltos: un esqueleto de altura estable mientras cada tarjeta espera su dato, y un solo aviso si alguna falla. No cambia ningún endpoint ni ningún contrato, ni suma nada en el frontend, y respeta la excepción ya declarada de SPEC-KRILINXI-042.

## Criterios de aceptación

- [ ] El tablero muestra, sin tocar nada, los cuatro indicadores, la tarjeta de tendencia ('¿Cómo vino la caja día a día?') y dos tarjetas más, en total tres tarjetas con gráfico; las otras cinco secciones están plegadas bajo un 'Ver más estadísticas'.
- [ ] 'Ver más estadísticas' despliega las cinco secciones restantes con el mismo contenido que hoy, y se puede volver a plegar; el estado plegado no pierde el filtro elegido.
- [ ] Mientras una tarjeta espera su dato muestra un esqueleto de la misma altura que tendrá (sin saltos de layout), y nunca un cero ni un gráfico vacío.
- [ ] Si una tarjeta falla, el tablero muestra el aviso de esa tarjeta con 'Probar de nuevo' y el resto sigue visible; sin internet sigue diciendo 'Las estadísticas necesitan conexión' una sola vez, sin ningún número.
- [ ] El filtro de arriba (período y sucursal) sigue cambiando todas las tarjetas a la vez, incluidas las plegadas, y no se piden las plegadas hasta que se despliegan (verificable en los parámetros del servidor falso).
- [ ] Los gráficos, los textos 'sr-only' y las tablas de detalle de SPEC-KRILINXI-026, -042 y -044 no cambian: los tests de gráficos siguen leyendo los mismos valores.
- [ ] Los textos están en el idioma del negocio (sinJerga) y no hay colores nuevos; la suite completa sigue en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-050', () => { ... })

Así un `grep SPEC-KRILINXI-050` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
