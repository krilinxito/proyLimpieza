# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Quien atiende el mostrador (el uso de todos los días).** Personal de las 3 sucursales de un negocio de limpieza de ropa, en su mayoría **personas mayores con poca familiaridad con la tecnología**. Trabajan **de pie, en un mostrador, muchas veces con prisa**, en una tablet. Una sucursal **sin internet no puede dejar de recibir ropa**: la app tiene que funcionar offline. Su tarea: recibir la ropa de un cliente, avanzar su estado, cobrar y entregarla.

**El administrador.** Trabaja desde la oficina, con conexión, en una PC. Mira estadísticas y gestiona personal y sucursales; cuando hace falta, también atiende el mostrador de una sucursal.

La interfaz se usa en tablets del mostrador, en PC y también en pantalla de celular.

## Product Purpose

Un sistema de gestión para un negocio de limpieza de ropa con 3 sucursales que hoy anota todo en papel. Digitaliza dos momentos: **el ingreso de la ropa y su recojo** (registrar una boleta, avanzar su estado, cobrar, entregar), y le da al administrador un dashboard para ver cómo va el negocio. El éxito es que el personal lo use todos los días sin ayuda, también sin internet, y que ningún dato se pierda.

## Positioning

Un sistema hecho a la medida de este negocio y de las personas que lo usan: **en el idioma del negocio, no del sistema** ("Registrar ropa", no "Crear orden"), pensado para personas mayores y **offline-first**: lo que se anota sin internet queda guardado y sube solo cuando vuelve la conexión.

## Operating Context

- Cada orden equivale a la **boleta** física preimpresa que se le da al cliente; el empleado copia su número.
- Flujo de la ropa: `RECIBIDO → ENTREGADO` (o `REEMBOLSADO` si la ropa sale sin cobrarse, o `ANULADO`, antes de salir; sin pasos intermedios desde SPEC-KRILINXI-067). La ropa se retira en la misma sucursal donde se dejó.
- Un cliente se identifica por su **teléfono**. Quien retira sin boleta debe dar nombre y carnet.
- Todo el dinero está en **bolivianos (Bs)**; las fechas se miran en la hora de Bolivia.
- Dos roles: `EMPLEADO` (atado a una sucursal) y `ADMIN` (global).
- La app es una **PWA**: se instala en la tablet y abre sin internet; las estadísticas, el historial completo y la gestión del personal necesitan conexión y lo dicen.

## Capabilities and Constraints

- Funciona **sin internet**: lecturas y escrituras van a una base local y se sincronizan después. El estado de la conexión siempre es visible y en palabras.
- Vocabulario del negocio en español, en pantalla y en el código. Nada de "sincronizar", "caché" o "token" a la vista de quien atiende.
- **Confirmación explícita antes de toda acción irreversible**, diciendo qué va a pasar.
- Los errores dicen qué hacer, en español y sin códigos.
- Pocos campos por pantalla y un solo camino claro para cada tarea; **una sola acción principal a la vista**.
- Restricciones técnicas de la interfaz: sin estilos en línea (política de seguridad del contenido), colores solo desde los tokens del tema, en claro y oscuro.
- Todas las listas largas se paginan (6, 10 o 20 por página según el ancho).

## Brand Commitments

Ninguna identidad de marca está fijada: el nombre es solo "Lavandería", no hay logo ni paleta obligatoria. La marca es hoy un turquesa de agua limpia (SPEC-KRILINXI-052) y puede seguir evolucionando. (Confirmado por el usuario.)

## Evidence on Hand

- La app ya existe y funciona: es el código de `frontend/` (React + Vite + Tailwind), con un tema propio en `src/index.css`, componentes compartidos en `src/components/` (guía en `src/components/README.md`) y un marco de pantallas en `src/pages/`.
- No hay logo, fotografías, testimonios ni clientes de referencia. **No inventar ninguno.**

## Product Principles

Tomados de `CLAUDE.md` (§1 y §9) y confirmados con el usuario:

1. **La facilidad de uso gana casi siempre a la elegancia.** Si una pantalla es más rápida de usar pero más difícil de entender, pierde.
2. **El mostrador no se puede detener.** Offline-first: la interfaz nunca debe dar a entender que sin internet no se puede trabajar.
3. **Se habla como el negocio, no como el sistema.** Palabras del mostrador, mensajes que dicen qué hacer.
4. **Lo irreversible se confirma diciendo qué va a pasar.**
5. **Un solo camino claro y una sola acción principal por pantalla.**

## Accessibility & Inclusion

Las personas que usan la app todos los días son mayores y la usan de pie y con prisa. Requisitos ya establecidos en el proyecto: letra de base de **18px**, botones de al menos **56px** de alto, contraste de cada texto medido en el tema claro y en el oscuro (`test/tema.test.ts`, WCAG AA), el **color nunca es lo único** que dice algo (siempre hay texto o ícono), nada depende del mouse (se usa con el dedo), foco visible con teclado y gráficos con su alternativa en tabla para lector de pantalla.
