---
name: spec-new
description: "Slash command /spec-new <nombre> — crea una nueva spec en specs/SPEC-XXX-<nombre>.md. Revisa CLAUDE.md y el código para proponer un scope realista, pregunta solo lo que no puede inferir, avisa si el scope se solapa con una spec activa, y deja la spec en status draft para que la apruebes a mano."
argument-hint: <nombre-corto-de-la-spec>
disable-model-invocation: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Write
  - AskUserQuestion
  - Bash(bash .claude/spec-flow/scripts/specflow:*)
  - Bash(ls:*)
  - Bash(cat:*)
  - Bash(git log:*)
  - Bash(git status:*)
---

# /spec-new — crear una spec

Nombre pedido por el usuario: **$ARGUMENTS**

Tu trabajo es producir una spec que otra persona pueda implementar sin volver a preguntar
nada. El motor determinista (numeración, frontmatter, detección de solapes) lo hace
`specflow`; tú aportas el criterio y la redacción.

```
SF="bash .claude/spec-flow/scripts/specflow"
```

## 1. Preflight

Corre `$SF doctor`. Crear una spec no necesita `gh` ni la rama base, así que **solo avisa**
de lo que esté mal — no te detengas por ello. Si `specs/` no existe todavía, se creará sola.

Si el usuario no dio nombre en `$ARGUMENTS`, pregúntaselo antes de seguir.

## 2. Investiga ANTES de preguntar

No le pidas al usuario nada que puedas averiguar tú. Antes de abrir la boca:

- Lee `CLAUDE.md` si existe (y `README.md`) para entender convenciones y vocabulario del proyecto.
- Explora la estructura real del repo: ¿dónde viven los Models, Controllers, rutas, tests?
- Corre `$SF whoami` para saber quién está al mando y quién más commitea en este repo.
- Corre `$SF list` y lee las specs existentes: te dicen el estilo de la casa, qué está en
  curso y de qué podría depender esta.
- Si el nombre sugiere algo concreto (`user-model`, `auth-controller`), busca si ese código
  ya existe parcialmente.

La meta es llegar a la conversación con **propuestas concretas**, no con campos en blanco.

## 3. Pregunta solo lo que falte

Usa **AskUserQuestion**, agrupando en pocas rondas. Lo que necesitas cerrar:

- **Qué problema resuelve** — el "por qué", no el "cómo". Si el nombre ya lo insinúa,
  propón tu lectura y pide confirmación.
- **Scope**: archivos, módulos o globs que la spec va a tocar. **Propón tú una lista**
  basada en la estructura real del repo y deja que la corrija. Un scope en blanco es
  una pregunta mal hecha.
- **Criterios de aceptación**: condiciones verificables, en la forma "el sistema hace X
  cuando Y". Cada criterio debería poder convertirse en un test. Propón un borrador a
  partir de la descripción y pide que lo ajuste.
- **Prioridad**: high / medium / low.
- **Dependencias**: ids de otras specs que deben estar listas antes. Ofrece como opciones
  las specs activas que viste en `$SF list`.
- **Owner**: quién la implementa. No lo preguntes en frío — corre `$SF whoami`, que te da
  la identidad de `git config user.name` (la misma que firmará los commits) y los demás
  autores del repo sacados del historial. Plantéalo como la pregunta que de verdad importa:

  - **"La implemento yo"** → owner = `whoami().name`. Es el caso normal.
  - **"Solo la planteo, la implementa otra persona"** → ofrece como opciones los
    `collaborators` que devolvió `whoami`, y deja escribir un nombre si no está en la lista.
  - **"Todavía no lo sabemos"** → manda `"owner": ""` explícitamente. Quedará como
    "sin asignar" y se decide al aprobarla.

  Si omites `owner` del payload, el motor pone la identidad git de quien corre el comando.
  Usa el nombre tal como aparece en `whoami`, sin reescribirlo: si el owner no coincide con
  el autor de los commits, el aviso de solape señala a la persona equivocada.

Redacta criterios **verificables**. "Mejorar el login" no sirve; "rechaza credenciales
inválidas devolviendo 401" sí, porque se puede testear.

## 4. Comprueba solapes

Con el scope ya acordado:

```
$SF overlap --scope "src/models/user.js,tests/models/**"
```

Devuelve las specs **activas** (status ≠ finished) cuyo scope choca con el propuesto, con
las parejas de rutas concretas que colisionan.

Si hay conflictos: **no sigas en silencio**. Muéstrale al usuario qué spec choca, en qué
archivos, y quién es su owner — dos personas tocando el mismo archivo en ramas distintas
es exactamente el conflicto de merge que este flujo quiere evitar. Pregúntale con
AskUserQuestion si quiere ajustar el scope, marcar la otra spec como dependencia, o
continuar de todas formas.

## 5. Crea el archivo

Arma el payload y pásaselo a `specflow`, que se encarga de la numeración autoincremental,
del frontmatter válido y del nombre del archivo:

```
$SF create --json /ruta/al/payload.json
```

El payload:

```json
{
  "name": "User model",
  "owner": "max",
  "priority": "high",
  "scope": ["src/models/user.js", "tests/models/**"],
  "depends_on": ["SPEC-002"],
  "description": "Párrafo o dos explicando el problema y el enfoque.",
  "criteria": ["Rechaza email con formato inválido", "Hashea la contraseña antes de guardar"]
}
```

`status` queda en `draft` y `tests` en `[]` — eso lo fija el motor, no lo mandes tú.

## 6. Cierra

Muestra el archivo creado y termina dejando claros los dos puntos siguientes:

1. La spec está en **`draft`**. Para aprobarla, el usuario edita el archivo a mano y pone
   `status: approved`. Esta skill **nunca** aprueba sola: la aprobación es el punto de
   control humano del flujo.
2. Una vez aprobada, se implementa con `/spec-code <id>`.

Recuérdale también commitear la spec para que su compañero la vea.

## Reglas

- **Nunca** pongas `status: approved`. Solo `draft`.
- **Nunca** rellenes `tests:` a mano — es trabajo de `/spec-finish`.
- No inventes criterios de aceptación que el usuario no validó.
- Si el usuario pide una spec enorme que toca medio repo, sugiérele partirla en varias
  con `depends_on` entre ellas; specs pequeñas dan PRs revisables.
