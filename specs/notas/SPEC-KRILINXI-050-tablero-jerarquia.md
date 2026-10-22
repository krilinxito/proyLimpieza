---
id: SPEC-KRILINXI-050
spec: specs/SPEC-KRILINXI-050-tablero-jerarquia.md
explica: []
---

# SPEC-KRILINXI-050 — Tablero del admin con una pregunta principal y el resto a pedido

## Qué se construyó

El tablero de `/estadisticas` tenía doce bloques del mismo peso. Ahora el admin ve, sin tocar nada, los cuatro indicadores, la caja día
a día (la pregunta que se hace primero) y dos tarjetas más: con qué se pagó y lo que falta cobrar. Las otras cinco están bajo "Ver más
estadísticas". Y mientras llegan los datos, en vez de texto suelto hay un esqueleto del mismo tamaño, así la pantalla no se arma a saltos.

## Cómo funciona, paso a paso

Seguimos al admin que abre `/estadisticas` con la tablet y después despliega "Ver más".

1. **Se pide el panel.** `PantallaEstadisticas` llama a `usePanel(filtro)` (`PantallaEstadisticas.tsx:62`). Mientras `estado.tipo === 'cargando'`
   muestra `EsqueletoDelTablero` (`:68`): cuatro huecos de indicadores y tres de tarjetas, con la altura que tendrán. Su único
   texto es "Buscando las estadísticas…", escondido para quien ve y anunciado para el lector de pantalla. Ningún número.
2. **Llega el panel.** Con `estado.tipo === 'listo'` se dibujan los indicadores y la grilla de a la vista: la tendencia primero
   (`:106`), con su propio pedido (`useIngresosPorDia`), luego formas de pago y saldos, que usan lo que ya trajo el panel.
3. **Se despliega "Ver más estadísticas".** `VerMas` es un `<details>` controlado (`VerMas.tsx`): su `onToggle` avisa a la
   pantalla (`masAbierto`, `:60`) y **recién entonces** monta las cinco tarjetas (`:111`). Tres de ellas ya tenían sus datos (ingresos por
   sucursal, volumen, sin recoger); dos los piden recién ahora: la productividad (`useProductividad`) y los clientes
   (`useClientesAtendidos`). Mientras llegan, cada una muestra su `Esqueleto`; si fallan, su `AvisoDeTarjeta` con "Probar de nuevo", y las demás
   siguen a la vista.
4. **Se pliega otra vez.** `abierto` vuelve a `false`, las cinco se desmontan y el filtro, que vive en `PantallaEstadisticas`, no se toca.

## Dónde encaja en la arquitectura

Todo es capa de pantalla y de hooks de la feature `estadisticas`. No cambia ningún endpoint ni el contrato de la API (SPEC-ALE186-008): sigue
sin sumarse nada en el frontend (CLAUDE.md §8). Lo único movido de lugar es dónde se pide la productividad: salió de `usePanel` a su propio
hook, como ya tenían los clientes, para que no se pida sin que se vea.

## Fundamentos

**Ya explicado antes:**

- **Desplegable que no es un modal (disclosure)** → SPEC-KRILINXI-031 (`specs/notas/SPEC-KRILINXI-031-aviso-conexion-discreto.md`). `VerMas` es otro
  `<details>`, esta vez **controlado**: su estado vive en la pantalla (React) además del que ya tiene el navegador.

**Dos ideas de esta spec, sin concepto propio todavía** (si se repiten, merecen su entrada):

- **Un esqueleto reserva el lugar de lo que falta.** Una pantalla que muestra "Buscando…" y después inserta un gráfico de 300 px empuja todo lo que
  está debajo; el dedo, que iba a tocar algo, toca otra cosa. El esqueleto (`Esqueleto.tsx`) ocupa de antemano el alto que tendrá. No lleva números
  a propósito: un cero falso es peor que una pantalla honesta (§8).
- **Montar es pedir.** En React, un componente que pide su dato lo hace al montarse (`usePedidoOnline` dentro de la tarjeta). Si no se monta, no se
  pide: por eso `VerMas` no renderiza sus hijos cerrado, y la productividad y los clientes no gastan un pedido de nada.

## Decisiones y por qué

- **Cuáles son las tres a la vista.** La caja día a día, con qué se pagó, y lo que falta cobrar: las tres preguntas de plata, que el admin
  hace cada día. Quedan plegadas ingresos por sucursal, ropa recibida, ropa sin recoger, productividad y clientes. Es una elección mía: se cambia
  intercambiando dos líneas en `PantallaEstadisticas.tsx`.
- **Parte de lo pedido no se difiere: lo que alimenta los indicadores.** La spec decía que las plegadas no se piden hasta desplegar. Eso es cierto para
  la productividad y los clientes, pero ingresos, saldos, sin recoger y volumen se piden siempre porque los cuatro indicadores de arriba los usan; pedirlos
  de nuevo al desplegar sería pedir dos veces lo mismo.
- **Si falla algo del panel, falla el panel entero, como antes.** Las cuatro métricas que alimentan los indicadores se piden juntas
  (SPEC-KRILINXI-015): si una faltara, la fila de indicadores mostraría un cero falso. En cambio, la tendencia, la productividad y los clientes sí fallan
  cada una por su cuenta, con su aviso. La spec pedía "el aviso de esa tarjeta" para cualquiera; para las cuatro compartidas no se hizo.
- **"Cargan juntas" se resolvió con un esqueleto, no con un solo pedido.** El esqueleto del tablero es de la altura aproximada de las tarjetas reales
  (no exacta: depende del gráfico), así que el salto es chico pero no nulo.

## Los tests

El helper `abrirPanel()` de `PantallaEstadisticas.test.tsx` ahora despliega "Ver más estadísticas" por defecto, así los ~60 tests por tarjeta siguen
encontrándolas; `abrirPanel({ desplegar: false })` para los de carga, error y sin internet, donde el panel nunca llega a estar listo. Los tests nuevos van
en su propio bloque. También hubo que abrir "Ver más" en `paginacion.test.tsx`, que miraba los clientes de las estadísticas.

## Si mañana tenés que tocar esto

Una tarjeta nueva que pida su propio dato va en `VerMas` si no es de las que el admin mira primero: así no se pide sin verse. Una tarjeta que use datos del
panel no necesita hook propio. Si cambiás cuáles están a la vista, actualizá `A_LA_VISTA` y `PLEGADAS` en el test.
