---
name: Lavandería
description: Un mostrador sin sorpresas — letra grande, botones de dedo, un solo camino por pantalla y nada que obligue a leer de más.
colors:
  turquesa-de-agua: "#0f766e"
  turquesa-de-agua-fuerte: "#115e59"
  turquesa-suave: "#ccfbf1"
  blanco-sobre-marca: "#ffffff"
  papel-frio: "#f1f5f9"
  superficie-blanca: "#ffffff"
  tinta-de-pizarra: "#0f172a"
  tinta-suave: "#475569"
  borde-firme: "#64748b"
  borde-suave: "#e2e8f0"
  indigo-de-foco: "#4f46e5"
  info-fondo: "#eff6ff"
  info-texto: "#1e3a8a"
  info-borde: "#93c5fd"
  exito-fondo: "#f0fdf4"
  exito-texto: "#166534"
  exito-borde: "#86efac"
  advertencia-fondo: "#fffbeb"
  advertencia-texto: "#92400e"
  advertencia-borde: "#fcd34d"
  peligro-fondo: "#fef2f2"
  peligro-texto: "#991b1b"
  peligro-borde: "#fca5a5"
  rojo-sin-vuelta-atras: "#b91c1c"
  rojo-sin-vuelta-atras-fuerte: "#991b1b"
  serie-efectivo: "#3a83fc"
  serie-qr: "#e55108"
  serie-tarjeta: "#0f9958"
  antiguedad-reciente: "#3987e5"
  antiguedad-media: "#1c5cab"
  antiguedad-vieja: "#0d366b"
typography:
  body:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
  title:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
  headline:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  figure:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
rounded:
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.turquesa-de-agua}"
    textColor: "{colors.blanco-sobre-marca}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "12px 24px"
    height: "56px"
  button-primary-hover:
    backgroundColor: "{colors.turquesa-de-agua-fuerte}"
  button-secondary:
    backgroundColor: "{colors.superficie-blanca}"
    textColor: "{colors.tinta-de-pizarra}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "12px 24px"
    height: "56px"
  button-secondary-hover:
    backgroundColor: "{colors.papel-frio}"
  button-peligro:
    backgroundColor: "{colors.rojo-sin-vuelta-atras}"
    textColor: "{colors.blanco-sobre-marca}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "12px 24px"
    height: "56px"
  button-peligro-hover:
    backgroundColor: "{colors.rojo-sin-vuelta-atras-fuerte}"
  button-navegacion:
    textColor: "{colors.turquesa-de-agua}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    height: "56px"
  card-informa:
    backgroundColor: "{colors.superficie-blanca}"
    textColor: "{colors.tinta-de-pizarra}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  card-destaca:
    backgroundColor: "{colors.turquesa-suave}"
    textColor: "{colors.tinta-de-pizarra}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  card-toca:
    backgroundColor: "{colors.superficie-blanca}"
    textColor: "{colors.tinta-de-pizarra}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  campo-texto:
    backgroundColor: "{colors.superficie-blanca}"
    textColor: "{colors.tinta-de-pizarra}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "56px"
  insignia:
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "2px 12px"
  aviso-info:
    backgroundColor: "{colors.info-fondo}"
    textColor: "{colors.info-texto}"
    rounded: "{rounded.xl}"
    padding: "16px"
  aviso-exito:
    backgroundColor: "{colors.exito-fondo}"
    textColor: "{colors.exito-texto}"
    rounded: "{rounded.xl}"
    padding: "16px"
  aviso-advertencia:
    backgroundColor: "{colors.advertencia-fondo}"
    textColor: "{colors.advertencia-texto}"
    rounded: "{rounded.xl}"
    padding: "16px"
  aviso-error:
    backgroundColor: "{colors.peligro-fondo}"
    textColor: "{colors.peligro-texto}"
    rounded: "{rounded.xl}"
    padding: "16px"
  modal-confirmacion:
    backgroundColor: "{colors.superficie-blanca}"
    textColor: "{colors.tinta-de-pizarra}"
    rounded: "{rounded.2xl}"
    padding: "24px"
---

# Design System: Lavandería

## Overview

**Creative North Star: "El mostrador sin sorpresas"**

Un sistema visual hecho para quien atiende de pie, con prisa y muchas veces sin anteojos: cada cosa está donde se espera, se llama como en el negocio y nada se mueve ni se esconde. Es **plano y claro**: superficies lisas separadas por bordes, letra grande, un solo turquesa para lo que hay que hacer ahora y rojo solo para lo que no tiene vuelta atrás. La personalidad no está en el adorno sino en la **previsibilidad**: una pantalla nueva se entiende porque se parece a las que ya se conocen.

El sistema rechaza explícitamente **una app de oficina sobrecargada de datos**: columnas, tablas densas y letra chica son lo contrario del mostrador. Lo que no cabe en una tarjeta se pagina o se pliega, no se aprieta.

**Key Characteristics:**
- Letra de 18px de base y botones de al menos 56px de alto: se aciertan con el dedo.
- Una sola acción principal a la vista por pantalla.
- Lo que se toca se ve distinto de lo que solo informa (borde firme, sombra y flecha).
- El color nunca es lo único que dice algo: siempre hay palabra o ícono al lado.
- Mismo sistema en tema claro y oscuro: los componentes pintan con tokens, nunca con colores sueltos.

## Colors

Un solo turquesa de agua limpia como marca sobre un fondo frío y neutro, con cuatro tonos de aviso y una paleta aparte, validada para daltonismo, que solo usan los gráficos. Todos los valores salen de `src/index.css` (`@theme`); este documento los describe, no los reemplaza.

### Primary
- **Turquesa de agua** (#0f766e): la marca. El botón principal, la pantalla activa del menú, el nombre del negocio. Con el hover pasa al **Turquesa de agua fuerte** (#115e59). Su texto es **Blanco sobre marca** (#ffffff).
- **Turquesa suave** (#ccfbf1): el fondo de lo elegido (una opción marcada, la pantalla activa del menú, una tarjeta que destaca un número).

### Neutral
- **Papel frío** (#f1f5f9): el fondo de la página y el de un botón secundario al pasar por encima.
- **Superficie blanca** (#ffffff): lo que se apoya sobre la página: tarjetas, cabecera, campos.
- **Tinta de pizarra** (#0f172a): el texto principal.
- **Tinta suave** (#475569): el texto secundario (períodos, ayudas, valores de segundo orden).
- **Borde firme** (#64748b): el borde de lo que se toca (campos, botón secundario). Llega a 3:1 contra el blanco, como pide WCAG.
- **Borde suave** (#e2e8f0): el de lo que solo agrupa (tarjetas, cabecera, separadores). Decorativo.
- **Índigo de foco** (#4f46e5): el anillo del teclado, para que se vea sobre el blanco y sobre el turquesa. No es rojo ni naranja a propósito: esos tonos dicen "error", y un campo con el cursor no tiene nada malo.

### Avisos (cada uno con fondo, texto y borde)
- **Información:** fondo #eff6ff, texto #1e3a8a, borde #93c5fd.
- **Éxito:** fondo #f0fdf4, texto #166534, borde #86efac.
- **Advertencia:** fondo #fffbeb, texto #92400e, borde #fcd34d.
- **Peligro:** fondo #fef2f2, texto #991b1b, borde #fca5a5.
- **Rojo de no-hay-vuelta-atrás** (#b91c1c, hover #991b1b): el botón de lo irreversible (anular).

### Gráficos
- **Una serie por forma de pago**, siempre en el mismo orden: efectivo #3a83fc (azul), QR #e55108 (naranja), tarjeta #0f9958 (verde). Validadas para daltonismo con todas sus parejas.
- **Antigüedad**, un solo tono que se oscurece con los días: #3987e5, #1c5cab, #0d366b.

### Tema oscuro
Los mismos tokens con otro valor (`:root[data-tema='oscuro']`); ningún componente cambia. Dos cosas se dan vuelta a propósito: la marca y el peligro pasan a ser claros para leerse como texto sobre la superficie oscura (y el texto encima de un botón pasa a ser oscuro), y la antigüedad se aclara al envejecer.

| Para qué | Valor en oscuro |
|---|---|
| Marca / su hover / su fondo suave / texto sobre marca | #5eead4 / #99f6e4 / #134e4a / #0f172a |
| Fondo / superficie | #0f172a / #1e293b |
| Texto / texto suave | #f1f5f9 / #cbd5e1 |
| Borde firme / borde suave | #94a3b8 / #334155 |
| Foco | #a5b4fc |
| Información (fondo, texto, borde) | #172554, #bfdbfe, #3b82f6 |
| Éxito | #052e16, #bbf7d0, #22c55e |
| Advertencia | #451a03, #fde68a, #f59e0b |
| Peligro (fondo, texto, borde) | #450a0a, #fecaca, #ef4444 |
| Botón de peligro / su hover | #f87171 / #fca5a5 |
| Antigüedad (reciente, media, vieja) | #3b82f6, #7fb0f7, #c3dafe |

Las tres series de los gráficos no cambian en oscuro.

### Named Rules
**La regla de solo tokens.** Ningún componente usa un color suelto ni la paleta cruda de Tailwind (`sky-700`, `bg-white`): se pinta con el nombre del tema (`bg-marca`, `text-peligro-texto`). Un color nuevo se agrega a `index.css` **en los dos bloques**, claro y oscuro, con su par de contraste medido en `test/tema.test.ts`.

**La regla de color nunca solo.** Quien no distingue bien los colores también tiene que saber qué es qué: el estado va en palabras (una insignia dice "Listo para retirar"), lo irreversible lleva ícono además del rojo, lo actual del menú va en negrita con una barra.

## Typography

**Display, Body y Label Font:** Atkinson Hyperlegible (con `ui-sans-serif, system-ui, sans-serif` de reserva). Una sola familia, propia (archivos woff2 solo latín, 400 y 700, copiados al sitio): abre sin internet y la política de seguridad no permite pedir fuentes de afuera.

**Character:** Atkinson Hyperlegible fue diseñada para baja visión: cada letra se distingue de sus parecidas (I, l, 1; O, 0). Es la razón de la elección y de los números que se leen sin dudar.

### Hierarchy
- **Cifra grande** (700, 2.25rem, line-height 1.1): el número que importa en un tablero (lo cobrado, lo que falta cobrar).
- **Headline** (700, 1.875rem, 1.2): el título de cada pantalla (`h1`).
- **Title** (700, 1.5rem, 1.33): el título de una tarjeta o sección (`h2`).
- **Label** (700, 1.25rem, 1.4): botones y lo que se toca. Un nivel más abajo, los datos y cuerpos de tarjeta van en 1.25rem regular.
- **Body** (400, 1.125rem = 18px, 1.6): el texto base de toda la app. Se lee de pie, a un brazo de distancia.

### Named Rules
**La regla de los 18px.** El texto base nunca baja de 18px. Nada que se lea de pie va en letra chica: si no entra, se pagina o se pliega.

## Layout

**Una columna de contenido, centrada y angosta** (`max-w-3xl`, 48rem), con 16px de margen a los costados (24px desde 1024px). Las pantallas son listas y tarjetas apiladas: nunca tablas anchas.

**El marco** envuelve todas las pantallas: una cabecera fija arriba (`sticky`) con el nombre del negocio, dónde se está trabajando, la conexión, el tema y quién atiende con Salir; un pie chico abajo (solo sucursal y versión, cada centímetro de alto es pantalla útil); y el menú. Desde **1024px** el menú es una barra lateral de 288px (`w-72`); por debajo, un botón "Menú" que abre un cajón.

**Cortes:** solo dos, los de Tailwind: `sm` (640px) y `lg` (1024px). En angosto, una columna; desde `lg`, las grillas pasan a dos (las tarjetas del dashboard, Personal y Sucursales).

**Ritmo:** lo que va junto se separa 8 a 12px (`gap-2`, `gap-3`); las tarjetas de una lista, 12 a 16px; las secciones, 24 a 32px. Cada tarjeta respira con 16 a 24px por dentro.

**Listas largas:** siempre paginadas, con la barra en un solo bloque compacto ("Anteriores · Página 2 de 3 · Siguientes"), con 6, 10 o 20 elementos según el ancho de la pantalla. El buscador completa la paginación, no la reemplaza.

## Elevation & Depth

**Plano, con relieve solo en lo que se toca.** Lo que informa es plano y se separa por borde; lo que se toca sube un escalón, y lo que interrumpe flota. Depth se transmite con bordes y con unas pocas sombras:

### Shadow Vocabulary
- **Sutil** (`shadow-sm`, 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)): la cabecera y el botón principal.
- **Media** (`shadow-md`, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)): las tarjetas que se tocan (una boleta en una lista), junto con su borde firme y su flecha.
- **Flotante** (`shadow-2xl`, 0 25px 50px -12px rgb(0 0 0 / 0.25)): el cuadro de confirmación, sobre un velo oscuro con desenfoque.

### Named Rules
**La regla de lo que se toca.** Una tarjeta que lleva a otro lado se distingue de una que solo informa por **borde firme, sombra y la flecha a la derecha**: nunca solo por el color.

## Shapes

Esquinas generosas y bordes marcados: se ven y se aciertan con el dedo. **12px** (`rounded-xl`) en botones, campos y avisos; **16px** (`rounded-2xl`) en tarjetas y en el cuadro de confirmación; **8px** (`rounded-lg`) en las opciones elegibles; y **círculo o píldora** (`rounded-full`) en las insignias, la píldora de conexión y el avatar con la inicial. Lo que se toca lleva borde de **2px** (el de los campos y el botón secundario); lo que solo agrupa, 1px suave. El menú marca la pantalla actual con una barra de 4px a la izquierda.

## Components

Grandes, firmes y obvios. Todos pintan solo con tokens del tema y llevan el anillo de foco (`focus-visible`, índigo, solo con teclado). La guía de uso está en `src/components/README.md`.

### Buttons
- **Shape:** 12px, borde de 2px, 56px de alto como mínimo (48px el `compacto`, para una fila de acciones).
- **Primario:** lleno de turquesa de agua, texto blanco, sombra sutil, a todo el ancho. **Uno solo por pantalla**: lo que hay que hacer ahora ("Registrar ropa", "Entregar").
- **Secundario:** con borde firme sobre la superficie. Otra acción posible ("Cancelar", "Cobrar").
- **Peligro:** lleno de rojo y **siempre con el ícono de alerta**. Lo que no tiene vuelta atrás ("Anular").
- **Navegación:** sin caja, subrayado, como un enlace, con la flecha de volver. No hace nada: lleva a otro lado ("Volver a la lista"). Un enlace que lleva a otra pantalla es `EnlaceBoton`; si cambia lo que muestra la misma pantalla, es `Boton`.
- **Hover / Focus:** el relleno pasa a la versión fuerte del color; el deshabilitado se distingue por borde punteado y opacidad, no solo por el color.

### Cards / Containers
- **Informa** (por defecto): superficie blanca, borde suave de 1px, 16px de esquina, 20px por dentro. Agrupa datos.
- **Destaca:** fondo turquesa suave y borde turquesa completo (sin franja de un solo lado). Un número que importa ("Cobrado hoy").
- **Toca:** borde firme de 2px, sombra media y una flecha a la derecha. Entera tocable: una boleta en una lista.

### Inputs / Fields
- **Style:** etiqueta siempre visible encima (nunca un placeholder en su lugar), campo de 56px, borde de 2px, esquina de 12px.
- **Focus:** el anillo índigo del tema.
- **Error:** borde rojo, ícono y un mensaje que dice qué hacer, en español y sin códigos.
- **Opciones elegibles** (cómo paga, sucursal, estado): casillas de 56px con borde; la elegida se marca con borde turquesa y fondo turquesa suave **y** texto en negrita.

### Insignias y avisos
- **Insignia:** píldora con la palabra del estado ("Listo para retirar") y un tono: neutro, información, éxito, advertencia o peligro. Qué tono lleva cada estado lo decide cada pantalla.
- **Aviso:** caja de 12px con ícono, texto y el color de su tipo (información, éxito, advertencia, error). Error y advertencia son `role="alert"`; información y éxito, `role="status"`.

### Confirmación (modal)
Cuadro de 16px sobre un velo oscuro. Dice **qué va a pasar** ("Esta acción no se puede deshacer") y el verbo de la acción ("Sí, anular"), no "Aceptar". El foco empieza en "Cancelar": un Enter apurado no puede anular nada.

### Navigation
- **Menú:** barra lateral (desde 1024px) o cajón. Cada destino mide 56px y lleva ícono y palabra; el actual se distingue por **negrita, una barra de 4px a la izquierda y fondo turquesa suave**, colgados de `aria-current="page"`.
- **Conexión:** una píldora en la cabecera, corta y en palabras ("Con internet", "Sin internet · 3 por guardar"); al tocarla, la frase completa.

### Gráficos
SVG propios, sin librería: barras horizontales y columnas, cada una un botón que al tocarlo escribe su detalle; cada gráfico tiene nombre y una tabla para el lector de pantalla con los mismos números. Los rótulos van siempre en el color del texto, al lado.

## Do's and Don'ts

### Do:
- **Do** dejar **una sola acción principal** a la vista por pantalla; el resto, secundarias o de navegación.
- **Do** confirmar toda acción irreversible diciendo qué va a pasar, con el verbo ("Sí, anular").
- **Do** escribir en el idioma del negocio ("Registrar ropa", "Cobrar") y mensajes de error que digan qué hacer.
- **Do** pintar con los tokens del tema, y agregar todo color nuevo en los dos temas con su contraste medido.
- **Do** acompañar cada color con una palabra o un ícono.
- **Do** paginar toda lista que pueda crecer, y dejar visible el estado de la conexión en palabras.

### Don't:
- **Don't** hacer una **app de oficina sobrecargada de datos**: sin tablas densas, columnas apretadas ni letra chica.
- **Don't** usar colores sueltos ni la paleta cruda de Tailwind en un componente.
- **Don't** usar estilos en línea (`style={…}`): la política de seguridad los ignora en la tablet sin avisar.
- **Don't** poner dos acciones principales juntas, ni un "Volver" a todo el ancho: parecería la acción principal.
- **Don't** usar jerga del sistema en pantalla ("sincronizar", "caché", "token").
- **Don't** esconder algo importante detrás de un efecto, una animación o un gesto sin alternativa táctil y de teclado.
