---
id: SPEC-KRILINXI-016
spec: specs/SPEC-KRILINXI-016-estadisticas-volumen.md
explica:
  - reiniciar un estado cuando cambia otro sin useEffect
  - useCallback como interruptor de un efecto
---

# SPEC-KRILINXI-016 — Estadísticas de volumen, productividad y clientes

## Qué se construyó

El panel del admin suma tres secciones a las de la 015:

- **Ropa recibida:** cuántas boletas entraron cada día, con las anuladas aparte.
- **Lo que hizo cada persona:** cuánto recibió, cobró y entregó, con una fila por sucursal
  si trabajó en más de una.
- **Clientes atendidos:** de quien más vino a quien menos, con cuánto pagó y su última
  visita.

Sin elegir fechas, las tres miran los últimos 30 días. La lista de clientes se pasa de página
sin volver a pedir el resto del panel.

## Cómo funciona, paso a paso

El admin abre el panel el 16/10/2026 y después pasa a la página 2 de clientes.

1. **El período.** `usePanel` (`hooks/usePanel.ts:17`) arma los parámetros de cada sección.
   Las nuevas usan `parametrosHistoria` (`periodo.ts:73`): sin fechas elegidas, da
   `{ desde: '2026-09-17', hasta: '2026-10-16' }`. El 17/09 sale de `restarDias`
   (`periodo.ts:66`), que resta en UTC para que ningún cambio de hora corra un día.
2. **Cinco pedidos juntos.** El `Promise.all` (`usePanel.ts:21`) suma volumen y
   productividad a los tres de la 015. Si uno falla, no se muestra nada a medias, igual que
   antes.
3. **El pedido en sí** lo maneja `usePedidoOnline` (`hooks/usePedidoOnline.ts:30`). Es el
   hook que salió de `usePanel` en esta spec, y se encarga de:
   - pasar a `cargando`;
   - llamar a `pedir`;
   - traducir `ErrorSinConexion` a `sin-conexion`;
   - descartar la respuesta vieja;
   - volver a pedir con el evento `online` (`:47`).
4. **Los clientes van aparte.** `SeccionClientes` (`components/PantallaEstadisticas.tsx:58`)
   tiene su propio hook, `useClientesAtendidos`, que también usa `usePedidoOnline`. Su
   `pedir` (`hooks/useClientesAtendidos.ts:26`) cambia cuando cambian el filtro o la
   página. Por eso tocar "Siguientes" solo pide `/estadisticas/clientes?pagina=2`, y no los
   cinco del panel.
5. **La página se olvida sola al cambiar el filtro.** La página elegida se guarda junto con
   el filtro para el que se eligió (`useClientesAtendidos.ts:22`), y se lee comparándolo con
   el filtro actual (`:23`). Si el admin estaba en la página 2 y elige otras fechas, la
   página vale 1 desde ese mismo render. Ver "Fundamentos".
6. **Mostrar.** `SeccionVolumen` dibuja una barra por día, proporcional al día con más ropa
   (`components/SeccionVolumen.tsx:13`), con el número escrito al lado. `Paginas` calcula
   cuántas páginas hay con el `total` que manda el servidor (`SeccionClientes.tsx:84`).

## Dónde encaja en la arquitectura

Es la misma partición de la 015, con una pieza que cambió de lugar:

- **`usePedidoOnline`** reúne lo que hace falta para pedir a la API con conexión. Antes vivía
  dentro de `usePanel`. Ahora `usePanel` y `useClientesAtendidos` solo dicen **qué** piden;
  el **cómo** (cargando, sin conexión, error, recarga) está en un lugar.
- Está en `features/estadisticas/hooks/` porque esta spec solo puede tocar su feature. La 017
  (personal y sucursales) y la 018 (auditoría) también leen online: lo más probable es que
  pase a `src/hooks/`, la carpeta de lo transversal (CLAUDE.md §5), cuando lo necesite la
  segunda feature.
- **Calcular el ancho de una barra o el número de páginas en el navegador no rompe la regla
  de §8.** Lo que está prohibido es **sumar montos**, porque el dinero lo suma Postgres. Una
  proporción para dibujar no es un dato del negocio.

## Fundamentos

### Reiniciar un estado cuando cambia otro, sin `useEffect`

La forma que sale primero para "al cambiar el filtro, volver a la página 1" es un efecto:

```ts
const [pagina, setPagina] = useState(1);
useEffect(() => setPagina(1), [filtro]);
```

Funciona, pero hace **dos pedidos**. React primero dibuja con el filtro nuevo y la página
vieja: el pedido de clientes sale con `pagina: 2` del período nuevo. Recién después corre el
efecto, vuelve a 1 y sale el segundo pedido. El primero se descarta (gracias al `vigente`),
pero ya viajó por la red y pudo haber mostrado "Página 2 de 1" un instante.

El problema de fondo es que la página **no es independiente** del filtro: "página 2" solo
significa algo para un filtro concreto. Entonces se guarda **con** su filtro:

```ts
const [elegida, setElegida] = useState({ filtro, pagina: 1 });
const pagina = elegida.filtro === filtro ? elegida.pagina : 1;
```

(`hooks/useClientesAtendidos.ts:22-23`). Cuando el filtro cambia, `elegida.filtro` ya no es
el actual, y `pagina` vale 1 **en el mismo render**: sale un solo pedido, el correcto. No hay
efecto que esperar ni estado que sincronizar.

Esto funciona porque `filtro` es un objeto nuevo cada vez que el admin elige algo
(`setFiltro({ ...filtro, fechas })`), así que se compara con `===`. Si el filtro se mutara en
el lugar, la comparación no vería el cambio.

La regla general: **si un estado depende de otro, no lo copies y lo sincronices con un efecto:
guardá de qué depende, o calculalo**. Cada `useEffect` que pone un estado en función de otro es
un render de más y un momento en que la pantalla muestra algo inconsistente.

### `useCallback` como interruptor de un efecto

`usePedidoOnline` vuelve a pedir cuando cambia `pedir` (`hooks/usePedidoOnline.ts:44`). Para
React, una función creada en cada render es **siempre distinta** de la anterior, aunque haga lo
mismo. Sin `useCallback`, cada render del panel crearía otra `pedir`, el efecto correría otra
vez, y eso cambiaría el estado, que provoca otro render: un bucle de pedidos.

`useCallback(fn, [filtro])` (`usePanel.ts:17` y `:29`) devuelve **la misma** función mientras
`filtro` no cambie. Así la lista de dependencias de `useCallback` pasa a ser, de hecho, la
lista de cosas que hacen que se vuelva a pedir: el filtro para el panel; el filtro y la página
para los clientes. Leer esa lista dice exactamente cuándo sale un pedido.

**Ya explicado antes:**

- **Descartar una respuesta que llega tarde** → SPEC-KRILINXI-010 (`specs/notas/SPEC-KRILINXI-010-renovar-sesion.md`)
- **Comprobar una respuesta externa contra su contrato** → SPEC-KRILINXI-015 (`specs/notas/SPEC-KRILINXI-015-estadisticas-panel.md`): `leerVolumen`, `leerProductividad`, `leerClientes`.
- **Un valor por defecto que esconde datos** → SPEC-KRILINXI-015: la misma pregunta llevó a los "últimos 30 días".
- **El evento `online` del navegador** → SPEC-KRILINXI-015
- **Extraer una regla compartida sin cambiar lo que hace** → SPEC-KRILINXI-014 (`specs/notas/SPEC-KRILINXI-014-editar-cliente.md`): `usePedidoOnline` salió de `usePanel` con los tests de la 015 como red.
- **Paginación con limit/offset y total aparte** → SPEC-ALE186-012 (`specs/notas/SPEC-ALE186-012-auditoria-consulta.md`): el lado del servidor de esta lista.

## Decisiones y por qué

- **Últimos 30 días por defecto.** Lo decidió la dueña de la spec. Estas tres secciones cuentan
  lo que ya pasó, y con "hoy" el volumen sería una barra y la lista de clientes casi nada. Son
  los mismos 30 días que usa el backend sin `desde`, así que front y back no se contradicen.
- **Clientes aparte del `Promise.all`.** Si fueran juntos, pasar de página volvería a pedir
  las cinco métricas. Por eso los clientes tienen su propio aviso de "necesitan conexión": se
  puede cortar internet justo al pasar de página.
- **20 clientes por página** (`CLIENTES_POR_PAGINA`). El backend admite hasta 200, pero 200
  tarjetas grandes son mucho para bajar con el dedo.
- **El detalle por sucursal de un cliente solo aparece si vino a más de una.** Con una sola,
  repetiría la misma línea.

## Los tests

- **Helper ampliado: `test/estadisticasDePrueba.ts`.**
  - Suma `volumenDePrueba()`, `productividadDePrueba()` y `clientesDePrueba()`, y sus rutas en
    `simularEstadisticas`.
  - Los datos de prueba ya traen los casos que importan: un día en 0, una persona en dos
    sucursales, un cliente que fue a dos sucursales.
- **Dos tests de la 015 se ajustaron**, sin cambiar lo que prueban:
  - Uno comparaba el conjunto **exacto** de rutas pedidas; ahora mira solo las suyas
    (`expect.objectContaining`).
  - Otro tomaba "los últimos 3 pedidos"; ahora busca el último de cada ruta por nombre.
  - Un test que depende de cuántas otras cosas pide la pantalla se rompe cada vez que la
    pantalla crece, aunque lo suyo siga bien.
- **La paginación se prueba contando pedidos:** "Siguientes" agrega **exactamente uno**, el de
  clientes con `pagina: 2`. Es la prueba de que pasar de página no vuelve a pedir el panel.
- **El corte a mitad de camino** se prueba cambiando de servidor falso entre una página y la
  siguiente.

## Si mañana tenés que tocar esto

- **Otra pantalla online del admin:** usá `usePedidoOnline` con un `pedir` envuelto en
  `useCallback`. Si es de otra feature, es el momento de moverlo a `src/hooks/`.
- **Otro estado que dependa del filtro** (un orden elegido, un cliente abierto): guardalo junto
  con su filtro, como la página, no con un `useEffect` que lo resetee.
