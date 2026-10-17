---
id: SPEC-KRILINXI-023
name: 'Marco de la app: barra, menú y pie'
slug: marco-app
status: in-progress
owner: krilinxito
created: 2026-10-17
scope:
  - frontend/src/App.tsx
  - frontend/src/App.test.tsx
  - frontend/src/pages/**
  - frontend/src/components/marco/**
  - frontend/src/components/AvisoConexion.tsx
  - frontend/src/features/auth/components/BarraSesion.tsx
  - frontend/src/features/auth/components/BarraSesion.test.tsx
  - frontend/src/features/pendientes/components/PantallaParaCorregir.test.tsx
  - frontend/package.json
  - frontend/vite.config.ts
  - CLAUDE.md
priority: high
depends_on:
  - SPEC-KRILINXI-022
tests: []
---

## Descripción

Segunda spec de la ola estética. Hoy no hay forma de ir de una pantalla a otra sin volver a `/`: cada ruta monta suelta la `BarraSesion` ("Atiende: … · Salir") y el `AvisoConexion` desde `App.tsx`, y `Pantalla` es un `<main>` con un título ("deliberadamente pobre", dice su comentario). Esta spec arma el **marco** común a todas las pantallas: una cabecera fija con el nombre del negocio, la sucursal, quién atiende y Salir; el menú de navegación; el aviso de conexión debajo de la cabecera; y un pie mínimo.

El menú respeta a quien lo usa: **en pantalla ancha (desde 1024px: tablet apaisada, PC del admin) es una barra lateral siempre visible**, con ícono y nombre de cada destino, porque lo que está a la vista se encuentra sin pensar. **Debajo de 1024px** (tablet vertical, celular) se abre con un botón que dice "Menú" en palabras, en un cajón accesible. Los destinos salen del registro de rutas (`RUTAS`, `enMenu` y `puedeVer`), más Inicio; `pages/rutas.tsx` suma a cada ruta su `icono` (un `NombreIcono` de SPEC-KRILINXI-022) y una `descripcion` de una línea, que usará el Inicio de la spec siguiente. Así nadie más tiene que volver a editar el registro.

Las piezas visuales viven en `components/marco/` y solo reciben props (CLAUDE.md §5: `components/` no pide datos ni conoce features). Quien las compone es una ruta de diseño (layout route de React Router) en `App.tsx`/`pages/`, que lee la sesión, la conexión, la sucursal (de la base local) y las rutas. Esa ruta de diseño es la dueña del único `<main>` de la página: `Pantalla` pasa a ser solo el título y el contenido. La lógica de Salir (el aviso con los registros sin guardar, SPEC-KRILINXI-010) se queda en `features/auth`, sin cambiar su texto.

Un efecto inevitable: con el menú siempre presente, el enlace "Registrar ropa" aparece dos veces en `/` (menú y botón del Inicio). Los tests que lo buscaban sin decir dónde pasan a buscarlo dentro del contenido (`within(getByRole('main'))`); ningún texto visible cambia.

## Criterios de aceptación

- [ ] Toda pantalla con sesión muestra una cabecera (`role="banner"`) con el nombre del negocio, el nombre de la sucursal de quien atiende (leído de la base local; para el ADMIN, "Administración"), "Atiende: <nombre>" y el botón Salir, que conserva su confirmación y su aviso de registros sin guardar.
- [ ] El menú es un `<nav>` con nombre accesible "Menú principal" que lista Inicio y las rutas con `enMenu` que el rol puede abrir (`puedeVer`), cada una con su ícono y su nombre; un EMPLEADO no ve Personal ni Estadísticas y un ADMIN no ve Registrar ropa.
- [ ] El destino de la pantalla actual se marca con `aria-current="page"` y un estilo distinto que no depende solo del color.
- [ ] En pantalla ancha (desde 1024px) el menú es una barra lateral siempre visible; debajo de 1024px queda oculto y se abre con un botón que dice "Menú" (con `aria-expanded` y `aria-controls`).
- [ ] El cajón del menú, abierto, es un diálogo modal: el foco entra al primer enlace, Tab no sale del cajón, Escape y el botón "Cerrar menú" lo cierran devolviendo el foco al botón "Menú", y elegir un destino navega y lo cierra.
- [ ] El aviso de conexión aparece debajo de la cabecera en todas las pantallas con sesión, con los mismos textos y el mismo enlace a /para-corregir que hoy.
- [ ] El pie (`role="contentinfo"`) dice la sucursal y la versión de la app ("Versión 0.1.0"), tomada de `frontend/package.json` en el build.
- [ ] Cada página tiene exactamente un `<main>`, del marco; `Pantalla` deja de renderizar uno y conserva su título como `h1`.
- [ ] El primer elemento enfocable es "Saltar al contenido", visible solo con el foco, que lleva al `<main>`.
- [ ] El título de la pestaña es "<título de la ruta> · Lavandería" en cada pantalla, y "Lavandería" en el inicio.
- [ ] /ingresar y la página no encontrada sin sesión muestran la cabecera con solo el nombre del negocio: sin menú, sin Salir y sin aviso de conexión.
- [ ] `pages/rutas.tsx` declara para cada ruta del menú un `icono` y una `descripcion` de una línea en el idioma del negocio; un test comprueba que ninguna ruta con `enMenu` quede sin ellos.
- [ ] Las piezas de `components/marco/` reciben todo por props (lo vigila el test de componentes sin datos) y usan solo los colores del tema.
- [ ] La suite existente pasa sin cambiar ningún texto visible; los tests que buscaban enlaces del Inicio o la única `navigation` los buscan dentro del contenido o por su nombre.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-023', () => { ... })

Así un `grep SPEC-KRILINXI-023` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
