---
id: SPEC-KRILINXI-047
spec: specs/SPEC-KRILINXI-047-documentar-diseno.md
explica:
  - un documento que dice lo mismo que el codigo vigilado en los dos sentidos (igualdad de conjuntos)
---

# SPEC-KRILINXI-047 — Documentar el diseño actual de la interfaz

## Qué se construyó

Tres documentos y un test, sin tocar ninguna pantalla:

- `frontend/PRODUCT.md`: para quién es el producto (personal mayor del mostrador, de pie, con prisa, a veces sin internet; y el admin),
  qué hace, qué restricciones tiene y los principios que ya fijaba CLAUDE.md §1 y §9.
- `frontend/DESIGN.md`: el sistema visual tal como **está hoy** en el código: colores (tema claro y oscuro), la letra, los radios,
  las sombras, el marco de pantallas, los componentes y sus variantes, y lo que se hace y no se hace.
- `frontend/.impeccable/design.json`: el complemento de la skill, con fragmentos de HTML y CSS de nueve componentes para que quien
  pula vea cómo se ven, no solo cómo se llaman.
- `src/test/disenoDocumentado.test.ts`: ata el documento al código.

Es la base de las specs de pulido que vienen después: quien pula parte de lo que hay, no de lo que cree que hay.

## Cómo funciona, paso a paso

Se generó con `/impeccable document` en modo *scan* (derivar del código, no inventar), y así se armó cada parte:

1. **Extraer los tokens.** `src/index.css` es la fuente de todos los colores: el bloque `@theme` (claro) y
   `:root[data-tema='oscuro']`. De ahí salieron las 32 entradas de colores del frontmatter del DESIGN.md y la tabla del tema oscuro. La
   letra y los 18px de base salen de `@font-face`, `--font-sans` y `body`.
2. **Extraer los componentes.** Se leyeron `components/estilosBoton.ts` (los cuatro usos del botón y sus medidas), `Tarjeta.tsx`
   (`informa`, `destaca`, `toca`), `Insignia`, `Aviso`, `CampoTexto`, `ModalConfirmacion`, `Paginas` y `pages/Marco.tsx` con
   `components/marco/` (cabecera fija, barra lateral de 288px desde 1024px, pie chico). Los radios (8, 12, 16 y círculo) y las
   sombras (sutil, media, flotante) se contaron en el código: no se eligieron.
3. **Pedir solo lo que el código no dice.** El lenguaje descriptivo no sale de ningún archivo, así que se confirmó con vos en dos
   rondas: el nombre del sistema ("El mostrador sin sorpresas"), cómo se describe el relieve ("plano, con relieve solo en lo que se
   toca"), el carácter de los componentes ("grandes, firmes y obvios"), los nombres de los colores ("Azul del mostrador", "Papel frío"…)
   y un único rechazo explícito ("una app de oficina sobrecargada de datos").
4. **Escribir y vigilar.** El documento se escribió y, enseguida, el test comprobó que dice lo mismo que el código: pasó a la primera,
   y se probó que *muerde* (ver "Los tests").

## Dónde encaja en la arquitectura

Es documentación del **frontend**, al lado de su código: `PRODUCT.md` y `DESIGN.md` en la raíz de `frontend/`, el complemento en
`frontend/.impeccable/`. **No reemplazan a `index.css`**: los colores siguen viviendo ahí (CLAUDE.md §5) y el DESIGN.md los describe. La
regla de la 022 (los componentes pintan solo con tokens, y un color nuevo va en los dos temas) sigue siendo del código y de
`tema.test.ts`; esta spec solo la escribe en un lugar que se lee.

La carpeta de la herramienta (`.claude/skills/impeccable`, sus agentes y hooks) **no** se versiona: se versiona el resultado, no la
herramienta.

## Fundamentos

**Un documento que dice lo mismo que el código, vigilado en los dos sentidos.** Un documento de diseño tiene un problema de
nacimiento: a las pocas semanas alguien cambia un color en `index.css` y nadie actualiza el documento, que sigue "describiendo" algo
que ya no existe. La solución del proyecto para esto ya existía (→ SPEC-KRILINXI-008, "regla copiada atada al original con un
test"); acá se aplica a la prosa con **igualdad de conjuntos**: el test reúne todos los `#rrggbb` de `index.css` y todos los del
`DESIGN.md` y exige que sean los mismos. Dos direcciones, dos fallos distintos: si el documento nombra un color que el código no tiene,
**inventó o quedó viejo** (`no documenta ningún color que el código no use`); si el código tiene un color que el documento no nombra,
**alguien agregó un color sin documentarlo** (`no deja sin documentar ningún color del tema`). Solo una de las dos direcciones dejaría
un hueco por el que el documento se desfasa en silencio.

**Un frontmatter de tokens y un cuerpo de prosa dicen cosas distintas, y se comprueban distinto.** El YAML de arriba es *normativo*
(valores exactos que una herramienta puede leer) y el cuerpo es *contexto* (cuándo usar cada cosa). El test los trata así: lee el
frontmatter con una expresión regular chica, sin sumar una librería de YAML solo para esto, y comprueba que cada referencia entre
tokens (`{colors.azul-del-mostrador}`) apunte a algo definido. Una referencia rota no falla en ninguna pantalla —nadie la dibuja—, así que
solo un test la encuentra.

**Ya explicado antes:**

- **Regla copiada atada al original con un test** → SPEC-KRILINXI-008 (`specs/notas/SPEC-KRILINXI-008-ordenes-sucursal.md`)
- **La contraprueba (que el detector detecte)** → SPEC-KRILINXI-020 (`specs/notas/SPEC-KRILINXI-020-csp-frontend.md`)
- **Tokens de diseño; tema como variables que cambian de valor** → SPEC-KRILINXI-022 y SPEC-KRILINXI-030 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)

## Decisiones y por qué

- **El test ata colores, no todo.** Compara colores, la familia y el tamaño base de la letra, las secciones del formato y las
  referencias internas. *No* ata cada radio ni cada espaciado: son decenas de clases de Tailwind sueltas por el código y un test así
  fallaría por cualquier ajuste de margen. Lo que se vigila es lo que sí tiene una fuente única (`index.css`).
- **El tema claro va en el frontmatter y el oscuro, en una tabla.** El formato del frontmatter admite un solo valor por token; el
  oscuro es el mismo token con otro valor, y se describe en prosa con un test que comprueba que todos sus colores propios aparecen
  en esa sección.
- **Los nombres de colores son los que confirmaste**, descriptivos y no técnicos: "Papel frío", no `slate-100`. El documento los usa;
  `index.css` sigue con sus nombres (`fondo`, `marca`), y el cruce es la descripción de cada uno.
- **Un solo rechazo explícito, el que confirmaste** ("una app de oficina sobrecargada de datos"). No se inventaron otros.
- **`.impeccable/design.json` va versionado y el resto de la herramienta no**: es resultado (lo que describe el sistema), no
  herramienta. La carpeta de la skill carga un ejecutable y hooks que corren solos.

## Los tests

`disenoDocumentado.test.ts` (11 tests, sin base de datos ni HTTP: lee archivos): el frontmatter trae sus cinco grupos; las secciones
siguen el orden del formato; las referencias internas existen; ningún color inventado y ninguno sin documentar; los del frontmatter son
los del tema claro; los propios del oscuro están en su sección; la letra y el tamaño base son los de `index.css`; y el complemento existe,
no inventa colores y solo se refiere a componentes que el documento define.

**Se comprobó que muerde**, a mano: cambiar un color en el documento hizo fallar los tests de "inventó" y de "sin documentar", y cambiar
un color en `index.css` también. (La primera prueba falló de más porque PowerShell guardó el archivo con una marca de orden de bytes
al escribirlo; los archivos se restauraron y no quedó nada de eso.) Reusa el estilo de `tema.test.ts`, que ya lee `index.css`.

## Si mañana tenés que tocar esto

Si agregás un color a `index.css`, el test te lo va a pedir también en el `DESIGN.md`: sumá su línea al frontmatter (si es del claro) y a
la tabla del oscuro. Si cambiás el sistema de verdad (un componente nuevo, otra jerarquía), actualizá el documento **a mano** o volvé a
correr `/impeccable document` y elegí *refresh*: el test no sabe de componentes, solo de colores y de la estructura.
