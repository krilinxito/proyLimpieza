---
id: SPEC-KRILINXI-022
spec: specs/SPEC-KRILINXI-022-tema-visual.md
explica:
  - contraste wcag (luminancia relativa)
  - focus-visible
  - fuente propia (self-hosting)
  - regiones vivas (role status y alert)
  - tokens de diseno
---

# SPEC-KRILINXI-022 — Tema visual y piezas base de la interfaz

## Qué se construyó

La primera spec de la ola estética no cambia ninguna pantalla: fija **cómo se pinta** la app. Los
colores, la letra y su tamaño viven ahora en un solo lugar (el tema), las piezas compartidas
(botón, campo, modal) los usan, y se suman tres piezas nuevas (aviso, tarjeta, insignia) y un juego
de íconos. Las pantallas pasan a usarlos en las specs siguientes de la ola.

## Cómo funciona, paso a paso

Seguimos un color, el azul del botón "Cobrar", desde que se declara hasta que se prueba.

1. **Se declara una vez**, como variable CSS dentro de `@theme`: `--color-marca: #1e40af`
   (`frontend/src/index.css:40`). `@theme` no es CSS estándar: es una directiva de Tailwind v4
   que dice "esto es parte del sistema de diseño".
2. **Tailwind la convierte en clases.** Al ver `--color-marca`, crea `bg-marca`, `text-marca`,
   `border-marca`, `hover:bg-marca`… igual que crea `bg-sky-700` a partir de su propio
   `--color-sky-700`. No hay un archivo de configuración aparte: el nombre de la variable *es* la
   configuración.
3. **El botón la usa por su nombre**: la variante `primario` de `Boton` es
   `border-marca bg-marca text-sobre-marca …` (`frontend/src/components/Boton.tsx:10`). Lo común a
   las tres variantes (alto, foco, deshabilitado) está en `BASE` (`Boton.tsx:21`).
4. **El test del tema la lee del CSS** (`frontend/src/test/tema.test.ts:18`) y calcula su
   contraste con el blanco que va encima (`sobre-marca`) usando la fórmula de WCAG
   (`tema.test.ts:25-35`). El par está en la lista `TEXTOS` (`tema.test.ts:38`). Si alguien aclara
   el azul, el test dice cuál par dejó de leerse.
5. **El test de arquitectura impide el atajo**: si alguien escribe `bg-sky-700` en
   `components/`, `PALETA_CRUDA` (`frontend/src/test/arquitectura.test.ts:192`) lo encuentra y el
   test falla (`arquitectura.test.ts:209`). Sin esa regla, el test de contraste protegería un
   tema que nadie usa.

La letra sigue un camino parecido: `@font-face` apunta al woff2 del paquete
`@fontsource/atkinson-hyperlegible` (`index.css:12-26`). Vite resuelve ese nombre de paquete,
copia el archivo a `assets/` con un hash en el nombre, y el service worker lo guarda porque
`woff2` está en sus patrones (`frontend/vite.config.ts:30`). `--font-sans` (`index.css:37`) la
pone como letra de toda la app.

## Dónde encaja en la arquitectura

- **`index.css` es la fuente de verdad del aspecto.** Es lo único que sabe que la marca es
  `#1e40af`. Lo que no le toca: saber de pantallas. No hay un `--color-boton-cobrar`: los nombres
  dicen *para qué sirve* un color (marca, peligro, texto suave), no *dónde* se usa.
- **`components/` sigue sin saber del negocio** (CLAUDE.md §5, y su `README`). Por eso `Insignia`
  recibe un `tono` (`peligro`) y no un estado (`ANULADO`): qué tono le toca a cada estado de la
  orden lo decide `features/ordenes` en su propia spec. Si `Insignia` importara `lib/dominio`,
  cada estado nuevo obligaría a tocar una pieza compartida.
- **Las pantallas todavía no usan el tema.** La regla de la paleta cruda vigila solo
  `components/` a propósito: extenderla a `features/` hoy rompería la suite por más de 200 clases que van
  a cambiar en las specs siguientes. Cuando terminen, se extiende cambiando la lista de carpetas.

## Fundamentos

**Tokens de diseño.** Un token es una decisión de diseño con nombre: "el color de la marca",
"el borde de lo que se toca". La pantalla usa el nombre, nunca el valor. Sin tokens, cada pantalla
elige su rojo (`red-700` acá, `red-800` allá: es lo que había, contado al planificar esta ola) y la
app se ve como cuatro apps pegadas. Con tokens, el rojo de error es uno solo y cambiarlo es una
línea. El ejemplo: `--color-peligro-texto` (`index.css`) es el texto de error de `CampoTexto`, de
`Aviso` y de `Insignia`, y antes eran `text-red-700` y `text-red-800` según quién lo escribió.

**Contraste (WCAG).** Cuánto se distingue un texto de su fondo no depende del tono sino de la
*luminancia*: cuánta luz percibe el ojo de cada color, donde el verde pesa mucho más que el azul
(`0.7152` contra `0.0722`, `tema.test.ts:28`). La razón de contraste es
`(L_clara + 0.05) / (L_oscura + 0.05)`, de 1:1 (iguales) a 21:1 (negro sobre blanco). WCAG AA pide
**4,5:1 para texto** y **3:1 para lo que hay que ver para usar** (el borde de un campo, el anillo
de foco). Para personas mayores, cuya vista pierde contraste con la edad, no es un detalle: el
borde gris de los campos (`slate-400`) daba 2,56:1, por debajo del mínimo; el del tema (`borde`)
da 4,76:1. El test lo calcula en vez de confiar en el ojo, porque jsdom no pinta y una pantalla
que "se ve bien" en un monitor nuevo no se ve igual en una tablet al sol.

**`focus-visible`.** Quien usa teclado necesita ver dónde está el foco. Quien toca con el dedo,
en cambio, ve un recuadro que no pidió cada vez que toca un botón, y lo primero que se hace con eso
es borrarlo (`outline: none`) y dejar sin guía a quien la necesitaba. `:focus-visible` es el foco
que el navegador considera que *hay que mostrar*: con Tab sí, con un toque no. Ejemplo:
`focus-visible:outline-3 … outline-foco` en `Boton.tsx:23`. El naranja (`foco`) se eligió porque
contrasta tanto con el blanco como con el azul de la marca.

**Regiones vivas: `role="status"` y `role="alert"`.** Un lector de pantalla lee lo que tiene el
foco. Un aviso que aparece en otro lado ("Guardado") pasaría en silencio. Estos dos roles lo
anuncian solos al aparecer: `status` espera a que termine lo que estaba leyendo, `alert`
interrumpe. Por eso `Aviso` usa `alert` solo para error y advertencia (`Aviso.tsx:6-10`). Que el
aviso de "sin internet" del admin sea `status` y no `alert` es a propósito: no pasó nada malo, y
un `alert` interrumpiría cada vez que la pantalla se abre sin conexión.

**Fuente propia (self-hosting).** Una fuente de Google Fonts se baja de los servidores de Google
en cada visita: sin internet, la tablet usa la letra del sistema, y la política de seguridad
(`csp.ts`, `font-src 'self'`) la bloquearía de todos modos. Servirla desde el propio sitio la
convierte en un archivo más del build: viaja en el precache como el JavaScript. Se pidió solo el
subconjunto latino (que trae á, é, ñ, ¿) y solo woff2, que todos los navegadores de tablet
entienden: dos archivos de 17 KB.

**Ya explicado antes:**

- **CSS por utilidades (Tailwind)** → SPEC-KRILINXI-001 (`specs/notas/SPEC-KRILINXI-001-frontend-scaffold.md`)
- **Etiqueta y descripción accesibles** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Precache (la cáscara de la app)** → SPEC-KRILINXI-011 (`specs/notas/SPEC-KRILINXI-011-pwa-offline.md`)
- **Política de seguridad del contenido (CSP)** → SPEC-KRILINXI-020 (`specs/notas/SPEC-KRILINXI-020-csp-frontend.md`)

## Decisiones y por qué

- **Íconos dibujados en el repo, no una librería** (`lucide-react` era la alternativa). Son 17,
  van dentro del JavaScript (abren sin internet, nada que permitir en la CSP) y no suman una
  dependencia. El costo: un ícono nuevo hay que dibujarlo (un `<path>` de 24×24).
- **`<Icono nombre="cobrar" />` en vez de un componente por ícono.** Así el nombre es un dato
  (`NombreIcono`): la spec del marco lo va a guardar en cada entrada de `pages/rutas.tsx` sin
  importar componentes, y el test recorre todos con `NOMBRES_ICONOS`.
- **18px de base en `body`, no en `html`.** Subir la base de `html` agranda *todo* lo que se mide
  en `rem`, también márgenes y anchos, y desarma pantallas que nadie está mirando en esta spec.
  En `body`, solo cambia el texto que no tenía tamaño propio.
- **Deshabilitado = punteado + cursor + pálido.** Solo pálido (lo de antes) depende de distinguir
  dos tonos de azul, que es justo lo que se pierde con la edad.
- **`Aviso` sin márgenes propios.** Quien lo usa sabe dónde va (`AvisosAdmin` lo envuelve en un
  `mt-6`). Un margen incluido termina pisándose con `!mt-0` en la mitad de los usos.

## Los tests

- **Reusé** `archivosFuente` y `sinComentarios` (`test/arquitectura.ts`, SPEC-KRILINXI-003) para la
  regla de la paleta cruda: es el mismo patrón que las demás reglas de ese archivo. El test incluye
  un caso que prueba el *patrón* con ejemplos (`bg-sky-700` sí, `bg-marca` no), porque una regex de
  arquitectura que no detecta nada pasa siempre en verde.
- **Extendí** el test del build (`pwa/build.test.ts`) con la letra. El test de 011 ya exige que todo
  `assets/` esté en el precache, pero si alguien cambiara la letra por Google Fonts no habría woff2
  en `assets/` y seguiría pasando: el nuevo exige que estén.
- **Creé** `test/tema.test.ts`. Para un color nuevo, la próxima spec agrega una línea en `TEXTOS`
  (texto sobre fondo, 4,5:1) o en `CONTROLES` (bordes y foco, 3:1):

  ```ts
  ['marca', 'marca-suave'],   // el nombre de la pantalla activa en el menú
  ```

- Los tests nuevos de `Boton`, `CampoTexto` y el modal miran **clases** (`focus-visible:outline-foco`,
  `disabled:border-dashed`), no píxeles: jsdom no calcula los estilos de Tailwind
  (`src/estilos.test.tsx` lo explica). Lo que sí miden de verdad es lo accesible: que el ícono no
  cambie el nombre del botón ni la descripción del campo.

## Si mañana tenés que tocar esto

Empezá por `components/README.md`: la tabla de tokens dice cuál usar para qué. Para un color
nuevo: el token en `index.css` (en hexadecimal, o el test no lo lee), su par en `tema.test.ts`, y
recién después la clase en el componente. Cuidado con los nombres: `--color-texto` genera
`text-texto`, que se lee raro pero es correcto. Y si una pantalla de `features/` todavía usa
`bg-red-50`, no es un error de esta spec: pasa al tema en `estilo-mostrador` o `estilo-admin`.
