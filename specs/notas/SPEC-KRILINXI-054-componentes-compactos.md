---
id: SPEC-KRILINXI-054
spec: specs/SPEC-KRILINXI-054-componentes-compactos.md
explica: []
---

# SPEC-KRILINXI-054 — Componentes compactos: ver contraseña, paginación y cabecera chica

## Qué se construyó

Tres arreglos en piezas que ven todas las pantallas: un botón para mostrar u ocultar la contraseña en el ingreso, la barra de páginas en un solo bloque
más chico, y una cabecera que en el celular se acomoda en dos filas en vez de amontonarse.

## Cómo funciona, paso a paso

**Ver la contraseña.** La persona toca "Mostrar contraseña" en el ingreso.
1. `FormularioIngreso.tsx` guarda `verContrasena` en un estado local de la pantalla. Es lo único que cambia: el campo pasa de `type="password"` a
   `type="text"`; el valor escrito sigue en el mismo estado `password` de siempre.
2. El botón es un `Boton variante="navegacion"` (`type="button"`, así no envía el formulario) con el ícono `ojo` u `ojo-tachado` (`iconos.tsx`).
3. Al enviar, `ingresar(username.trim(), password)` manda lo escrito igual que antes. La contraseña no entra en la sesión ni en `localStorage`:
   un test comprueba que lo guardado no la contiene.

**Paginación.** `components/Paginas.tsx` es el único lugar donde se dibuja. Ahora `nav` > un recuadro con borde > botón, texto, botón. Los botones
son `tamano="compacto"` (48px, sigue siendo de dedo) y el texto `text-lg`. Como todas las pantallas llaman a ese componente, el cambio llega a
historial, mostrador, ficha de cliente, personal, sucursales, auditoría, estadísticas y registros para corregir sin tocarlas.

**Cabecera.** `components/marco/Cabecera.tsx`: en angosto, `flex-wrap` más un elemento vacío `basis-full` (`data-corte-de-renglon`, solo hasta `sm`)
parte la cabecera en dos filas. Arriba quedan menú, nombre, tema y quien atiende (`order` 0); abajo, la conexión (`order-5`), "Dejar de atender"
(`order-6`) y Salir (`order-7`). Desde `sm` todos vuelven a `order-none` y el corte desaparece. `BarraSesion` pasó a `contents` para que el avatar y Salir
sean hijos directos del contenedor flex y se puedan ordenar por separado.

## Dónde encaja en la arquitectura

Todo es presentación en `components/`, `pages/` y `features/auth`; ninguna regla de datos cambia (CLAUDE.md §5 y §9). Lo que se salta a propósito es
mover los elementos en el DOM: se reordenan con CSS `order`, así el recorrido con teclado y lector de pantalla sigue el orden natural. La contraseña
visible vive solo en el estado de un componente, no en la sesión.

## Decisiones y por qué

- **El botón va debajo del campo, no dentro:** `CampoTexto` no tiene un hueco para acciones, y agregarlo habría tocado un componente que usan todos los
  formularios. Un botón de navegación con ícono y palabra cumple "nunca un ícono suelto".
- **Se conservaron "Anteriores" y "Siguientes"**: más claros para personas mayores que flechas, y muchos tests los buscan por nombre.
- **El corte de renglón es un elemento, no una regla de grilla:** es lo que menos cambia la cabecera actual, que ya era `flex-wrap`.

## Los tests

Se reusaron `abrirSinSesion`, `entrarComo` y `servidorQueResponde` del test del ingreso, `abrir` y `cabecera()` del test del marco, y `archivosFuente`
y `sinComentarios` de los tests de arquitectura. Dato útil: `Boton` ignora un segundo clic mientras termina el primero (protege del doble toque), así que un
test que hace dos clics seguidos tiene que esperar entre ellos (`findByRole`).

## Si mañana tenés que tocar esto

jsdom no mide el ancho, así que los tests comprueban las clases que deciden el acomodo (`order`, `basis-full`, `truncate`), no el resultado visual.
Antes de un release hay que mirar la cabecera a mano a 360px (herramientas del navegador, modo celular), con la sucursal puesta y la conexión caída, que es
el caso más ancho.
