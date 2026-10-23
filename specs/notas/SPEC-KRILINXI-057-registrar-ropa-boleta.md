---
id: SPEC-KRILINXI-057
spec: specs/SPEC-KRILINXI-057-registrar-ropa-boleta.md
explica: []
---

# SPEC-KRILINXI-057 — Registrar ropa: guardar al final dentro de la boleta

## Qué se construyó

Registrar ropa ya no mezcla en una sola pantalla el buscador de clientes con los datos de la boleta. Primero se elige quién deja la ropa; recién entonces aparece la
boleta, con un único «Guardar» al final. En la tarjeta de cliente nuevo, el botón dice «Atrás». Y dentro del detalle de una boleta hay un botón «Nueva boleta de este cliente».

## Cómo funciona, paso a paso

Caso 1: se registra ropa para un cliente que ya existe.
1. El Mostrador abre `RegistrarEnMostrador.tsx` sin cliente. Éste monta `FormularioRopa.tsx`, que guarda el cliente elegido en su estado (`cliente`, null al principio).
2. **Paso 1.** Con `cliente === null`, `FormularioRopa` devuelve solo `ElegirClienteDeLaRopa` (el buscador). No hay `<form>`, ni campos de la boleta, ni «Guardar».
3. Al elegir a Rosa, `alCambiar` pone `cliente = { tipo: 'existente', … }` y el componente se vuelve a pintar: ahora devuelve el `<form>` con la tarjeta del cliente y las de «La ropa» y «Adelanto».
4. **Paso 2.** Un único botón `type="submit"` («Guardar») cierra el formulario. `registrarRopa` valida y escribe (`ejecutarJuntas`): alta del cliente si es nuevo, la orden y el adelanto, todo o nada.

Caso 2: cliente nuevo. En el paso 1 se toca «Cliente nuevo» (acción del buscador): `cliente = { tipo: 'nuevo', datos }`. En el paso 2, la tarjeta «Cliente nuevo» tiene nombre, teléfono y carnet, y un botón **«Atrás»**
(`ElegirClienteDeLaRopa.tsx`) que pone `cliente = null` y vuelve al paso 1. No guarda nada: guardar sigue siendo solo el botón del final.

Caso 3: «Nueva boleta de este cliente». Con una boleta abierta, `FichaCliente.tsx` muestra, debajo del detalle, un botón secundario que llama a `alRegistrar`; `PantallaMostrador.tsx` abre la vista `registrando` con ese `clienteId`,
y `RegistrarEnMostrador` lo lee y lo pasa como cliente inicial: se entra directo al paso 2.

Caso 4: dentro de una boleta. Las boletas no son rutas separadas: se abren dentro de la pantalla del Mostrador (`vista = ficha` con `abierta`). `PantallaMostrador.tsx` calcula `dentroDeUnaBoleta` y, con una boleta abierta, no pinta ni el
botón «Registrar ropa» de arriba ni el buscador: ahí ya no se está «en el mostrador», se está en esa boleta, y su camino es «Nueva boleta de este cliente» o «Ver toda la ropa de…». Ya no hace falta que «Registrar ropa» cambie a secundario con una boleta abierta: o se ve y es la principal, o no se ve.

Caso 5: volver sin bajar la página. (a) `MenuPrincipal.tsx`: si se toca el destino en el que ya se está, en vez de no hacer nada deja una marca nueva (`state.reinicio`) en la dirección; el hook `useReinicioDeRuta` la lee y
`PantallaMostrador` vuelve a su inicio (si estaba registrando con algo escrito, abre el aviso de «¿Salir sin guardar?»). Solo reacciona a las marcas que llegan después de montarse: recargar conserva el estado del historial y no debe reiniciar.
(b) `components/BotonAtras.tsx` es la flechita, que en pantalla ancha (desde 1200px) sale al hueco vacío a la izquierda del contenido, a la altura del título (`Pantalla` es `relative` y la flechita se posiciona contra esa columna), y en angosta queda arriba, en su renglón: reemplaza al botón de texto «Ver toda la ropa en el local» (que estaba al final) y a «Volver al mostrador sin guardar» de Registrar ropa. «Ver toda la ropa de [cliente]» no se movió.

## Dónde encaja en la arquitectura

Todo es presentación dentro de `features/ordenes`, `features/clientes` y `features/mostrador`; el guardado local no cambió (CLAUDE.md §6: primero local, después la cola, y la cola sube el cliente antes que su orden).
Los dos pasos viven en el mismo componente a propósito: así el estado de la boleta no se pierde al volver a elegir cliente (comportamiento de SPEC-KRILINXI-034 que no se quería romper).

## Decisiones y por qué

- **Sin ruta nueva por boleta.** Se evaluó una URL para cada paso. Se descartó: `/registrar-ropa` y `/mostrador?registrar` siguen siendo las puertas, el botón «Atrás» del navegador no queda a medio camino, y los dos pasos no necesitan
  estado en la dirección. Cumple el criterio de dejar la decisión escrita.
- **Pasos en el mismo componente, no un asistente aparte.** Un componente padre que monte el formulario recién al elegir el cliente perdería la boleta escrita al volver.
- **«Nueva boleta de este cliente» fuera de la fila de acciones**, secundario: la fila de la boleta tiene como mucho cuatro botones (SPEC-KRILINXI-049) y una sola acción principal (037).
- **El botón «Atrás» es de navegación** (sin caja, subrayado), no secundario, para que no parezca otra acción de guardar.

## Los tests

Se reusaron `abrir`, `elegirARosa`, `cargarRopa`, `guardar`, `resumen` y `cola` de `RegistrarEnMostrador.test.tsx`, y `abrirConRopaLista`/`abrirDetalle` de `PantallaMostrador.test.tsx`. Los tests que daban por hecho buscador y boleta juntos se
reescribieron: «Cambiar de cliente» ahora comprueba que la boleta se oculta mientras se elige y que lo escrito vuelve al elegir de nuevo.

## Si mañana tenés que tocar esto

Un campo nuevo del formulario va también en `hayEscrito` (SPEC-KRILINXI-048). Si algún día se quiere una URL por paso, empezar por `RegistrarEnMostrador`, que es quien conoce el `clienteId` de la ficha.
