---
name: spec-plan
description: "Slash command /spec-plan [encargo en texto libre] — propone las próximas specs a partir del estado real del repo. Lee el código, las specs activas y CLAUDE.md, corta el trabajo en piezas pequeñas, las ordena por dependencias y, si hay equipo, las reparte buscando el corte que menos conflictos de merge produce en ESTE repo. Luego crea en draft las que elijas, o te deja el /spec-new listo para las que prefieras plantear a mano."
argument-hint: "[qué planificar y bajo qué restricciones, texto libre]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - AskUserQuestion
  - Bash(bash .claude/spec-flow/scripts/specflow:*)
  - Bash(ls:*)
  - Bash(cat:*)
  - Bash(git log:*)
  - Bash(git status:*)
  - Bash(sort:*)
  - Bash(uniq:*)
  - Bash(head:*)
---

# /spec-plan — proponer las próximas specs

El encargo: **$ARGUMENTS**

Es texto libre, y suele traer dos cosas mezcladas: **qué planificar** ("la parte de
pagos", "el backend", nada = el proyecto entero) y **bajo qué restricciones** ("somos
dos", "para el viernes", "sin tocar todavía la API"). Léelo como el encargo de una
persona, no como el nombre de un área. Lo que no diga, lo averiguas del repo (paso 2) o
lo preguntas (paso 4) — pero no lo supongas.

`/spec-new` empieza cuando ya sabes qué spec quieres. Esta skill cubre el paso de antes:
mirar dónde está el proyecto y decidir **cuáles son las próximas specs, en qué orden y
—si va a implementarlas más de una persona— quién hace cada una**. Propone; el usuario elige cuáles van; esas se crean sin tener que
volver a teclear el roadmap spec por spec.

```
SF="bash .claude/spec-flow/scripts/specflow"
```

## 1. Preflight

Corre `$SF doctor`, `$SF list`, `$SF whoami` y `$SF next-id`. Planificar no necesita `gh`
ni la rama base, así que de `doctor` **solo avisa** — no te detengas por nada de lo que
diga.

## 2. Lee el estado real antes de proponer nada

Un roadmap inventado desde el nombre del repo no vale nada. Antes de escribir una sola
propuesta:

- **`CLAUDE.md` y `README.md`** — convenciones, vocabulario, stack y, sobre todo, la
  sección de deuda o pendientes si existe. Ahí suele estar media respuesta.
- **La estructura real** — qué carpetas existen de verdad y cuáles están vacías. La
  distancia entre lo que el `CLAUDE.md` promete y lo que hay en disco **es** el roadmap.
- **Las specs existentes** (`$SF list`) — qué está en curso, con qué scope y de quién.
  Lo que ya está cubierto no se vuelve a proponer.
- **`git log`** — por dónde se ha movido el trabajo últimamente y quién lo mueve.

Si algo contradice al `CLAUDE.md` (una rama que ya existe cuando el documento dice que no,
una carpeta descrita que está vacía), **dilo en el resumen**. Un documento desactualizado
manda a todo el equipo en la dirección equivocada.

## 3. Corta el trabajo en specs

Cada spec propuesta tiene que cumplir tres cosas, o no es una spec:

- **Cabe en un PR que alguien pueda revisar sin bloque de horas.** Si dudas, es grande.
- **Tiene un scope declarable en rutas o globs.** Si no sabes qué archivos toca, todavía
  no la entendiste lo suficiente para proponerla.
- **Se puede terminar sin esperar a otra**, o declara explícitamente de cuál depende.

Dos criterios para ordenarlas:

- **Los cimientos primero, y aburridos a propósito.** Estructura, convenciones y los
  helpers compartidos: son las specs que fijan las decisiones que las demás van a copiar,
  así que hacerlas después significa reescribir lo que ya estaba hecho.
- **Lo arriesgado, cuando el terreno está firme.** La pieza con más aristas del proyecto
  no es un buen primer contacto con el stack.

Si el proyecto es nuevo y no hay nada, la primera ola es siempre estructura, no
funcionalidad. **Como mucho seis specs**: un roadmap más largo que eso es adivinación, y
para cuando llegue a la sexta el proyecto ya habrá cambiado.

## 4. Reparte según quién vaya a implementar

Cuánta gente hay no lo adivines. `$SF whoami` te da los autores del repo, `$ARGUMENTS`
puede decirlo, y si aun así no está claro, **pregúntalo con AskUserQuestion**: el reparto
cambia el roadmap entero —cuántas specs entran en la primera ola, y por dónde se cortan—,
no es un detalle de presentación que se pueda dejar para el final.

**Con una sola persona no hay reparto**: propón solo el orden y sáltate esta sección
entera. No inventes owners ni "olas paralelas" para un roadmap que va a ejecutar alguien
en serie.

Con varias, el objetivo es que dos ramas abiertas a la vez se pisen lo menos posible. Cómo
se consigue **depende de este repo**, así que sácalo de la estructura que leíste en el paso
2 y no de una regla fija:

- **Busca el corte que menos archivos comparte.** Puede ser por directorio, por módulo, por
  recurso o por servicio; el bueno es el que deja a cada persona en archivos que nadie más
  va a abrir. El malo es el que suena a tareas distintas y aterriza en los mismos archivos.
- **Encuentra los archivos que toca todo el mundo antes de repartir**, en vez de suponer
  cuáles son:

  ```
  git log --format= --name-only | sort | uniq -c | sort -rn | head -20
  ```

  Los de arriba son los que van a dar conflicto. Suelen ser pocos y siempre los mismos:
  registros de rutas o de módulos, manifiestos de dependencias, configuración compartida.
  Propón **cerrarlos en la primera ola**, con los huecos previstos ya creados, para que las
  specs siguientes solo rellenen archivos propios.
- **Desbloquea el paralelo con el contrato, no con el código.** Si B necesita lo que hace
  A, casi siempre le basta el contrato escrito en la spec de A para arrancar contra un
  doble, sin esperar a que exista la implementación. Dilo explícitamente en la propuesta, o
  el equipo se serializa sin necesidad.

## 5. Comprueba solapes

Para cada spec propuesta, contrasta su scope con lo que ya está activo:

```
$SF overlap --scope "src/models/**,tests/models/**"
```

Si choca con una spec activa, ajusta el scope propuesto o declara la otra como
dependencia. Proponer trabajo que pisa una rama abierta es exactamente lo que este flujo
existe para evitar.

## 6. Presenta el roadmap

En el chat, no en un archivo. Agrupado en **olas**: con equipo, una ola es lo que puede
ir en paralelo; con una sola persona, es el siguiente tramo de trabajo, y entonces suele
haber una sola spec por ola. Para cada una:

- **slug** corto (el que se le pasaría a `/spec-new`) y **nombre** legible.
- **Qué resuelve**, en una línea.
- **Scope** en rutas.
- **Owner** propuesto y **de qué depende**.

Esto es lo que el usuario va a leer para decidir cuáles crear, así que que se entienda
sin releer el repo — pero sin convertirlo en la spec entera: los criterios de aceptación
se redactan en el paso siguiente, solo para las elegidas.

Los ids son tentativos: `$SF next-id` solo te da el primero, y el resto depende del orden
real de creación. Dilo así, no numeres como si ya existieran.

Cierra con dos cosas que valen más que la tabla:

- **Los archivos calientes** que van a dar conflicto y qué hacer con ellos.
- **Lo que decidirías distinto** si algo de lo que leíste no encaja. Si el `CLAUDE.md`
  pide algo que el estado del repo desaconseja, esta es la conversación para decirlo.

## 7. Pregunta cuáles crear

Con la propuesta en pantalla, una sola ronda de **AskUserQuestion**:

- **La ola 1 completa** — recomiéndala cuando el trabajo se reparte entre varias personas:
  cada una necesita la suya en la mano para poder arrancar el mismo día.
- **Solo la primera** — recomiéndala cuando hay una sola persona. Nadie implementa cuatro
  specs a la vez, y el roadmap habrá cambiado para cuando llegue a la tercera.
- **Todas las propuestas.**
- **Ninguna, las planteo yo** con `/spec-new`.

Deja que en "Other" nombre specs sueltas por su slug. Y no insistas: "ninguna" es una
respuesta completa, no el principio de una negociación.

## 8. Crea las elegidas

En el orden del roadmap, **las dependencias primero** — los ids se asignan al crear, así
que una spec solo puede referenciar a otra que ya exista. Para cada una:

1. **Redacta los criterios de aceptación**, verificables, en la forma "el sistema hace X
   cuando Y". Cada uno tiene que poder convertirse en un test.
2. **Corre `$SF overlap --scope "..."`** con su scope, por si el reparto propuesto choca
   con una rama abierta.
3. **Muestra el payload** —nombre, slug, scope, criterios, owner, dependencias— y pasa
   `$SF create --json`. Para el `owner`, el que propusiste en el roadmap; si el reparto
   quedó sin cerrar, manda `"owner": ""` en vez de adjudicárselo a quien ejecuta.
4. **Anota el id que devuelve**, que es el que va en el `depends_on` de las siguientes.

Si una elegida depende de otra que no se va a crear ahora, créala igual con `depends_on`
vacío y dilo en el cierre — un id inventado rompe el `/spec-code` de después.

**Nunca escribas el archivo tú.** Todo pasa por `$SF create`, que es lo que garantiza la
numeración, un frontmatter válido y, sobre todo, que el `status` salga en `draft`. Por eso
esta skill no tiene `Write` ni `Edit`: el control humano no es que la skill se niegue a
crear specs, es que ninguna spec entra en `approved` sin que una persona lo escriba.

## 9. Cierra

- **Lo que creaste**, con su ruta e id, y el recordatorio de que están en `draft`: se
  aprueban editando el archivo a mano, y hasta entonces `/spec-code` no las toca.
- **Lo que no creaste**, con el comando listo para cuando toque — su slug y la
  descripción de una línea que ya escribiste en el roadmap:

  ```
  /spec-new <slug> <qué resuelve, tal cual salió en la propuesta>
  ```

- **Commitea las specs** para que el compañero las vea antes de empezar a codear.

## Reglas

- **Nunca crees una spec que el usuario no eligió**, ni "de paso" ni "para no perderla".
  Seis drafts que nadie pidió ensucian `specs/` y nadie los va a leer.
- **Nunca escribas un archivo de spec a mano**: solo a través de `$SF create`, que las deja
  siempre en `draft`. Y jamás pongas `status: approved` — eso es del humano, aquí igual
  que en `/spec-new`.
- **Nunca propongas sin haber leído el repo.** Si no pudiste leerlo, dilo en vez de
  rellenar con un roadmap genérico que serviría para cualquier proyecto.
- No inventes criterios de aceptación para una spec que el usuario no vio en el roadmap.
- No repitas trabajo ya cubierto por una spec activa.
- No asignes owners que no salgan de `$SF whoami`, y si no sabes quién hace qué,
  pregúntalo con AskUserQuestion en vez de repartir a ciegas.
- Máximo seis specs por propuesta.
