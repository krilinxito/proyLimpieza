---
name: spec-code
description: "Slash command /spec-code <id> — implementa una spec aprobada. Actualiza dev, crea la rama feature/SPEC-XXX-<nombre>, pasa la spec a in-progress y codea con commits incrementales, escribiendo los tests de cada criterio de aceptación en el mismo trabajo y reutilizando o creando helpers de test compartidos. No cierra la spec ni abre PR."
argument-hint: <id-de-spec, p.ej. 001>
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - Bash(bash .claude/spec-flow/scripts/specflow:*)
  - Bash(git:*)
  - Bash(ls:*)
  - Bash(cat:*)
  - Bash(npx:*)
  - Bash(npm:*)
  - Bash(pnpm:*)
  - Bash(yarn:*)
  - Bash(pytest:*)
  - Bash(bundle exec rspec:*)
  - Bash(go test:*)
  - Bash(cargo test:*)
  - Bash(make test:*)
---

# /spec-code — implementar una spec

Spec pedida: **$ARGUMENTS**

```
SF="bash .claude/spec-flow/scripts/specflow"
```

## 1. Preflight y puerta de entrada

Corre `$SF doctor` y `$SF show $ARGUMENTS`.

**Si `status` no es `approved`, detente aquí.** Explica el status actual y qué significa:

- `draft` → todavía no está aprobada. El usuario debe revisarla y poner `status: approved`
  a mano en el archivo. No la apruebes tú.
- `in-progress` → ya se empezó. Pregúntale si quiere retomar la rama existente (y en ese
  caso continúa desde el paso 4) o si fue un arranque en falso.
- `finished` → ya está cerrada. Si quiere cambios, toca una spec nueva.

Compara el `owner` de la spec con `$SF whoami`. Si no coincide, **avísalo antes de empezar**:
la spec estaba asignada a otra persona y puede que ya la esté implementando. Pregunta si
continuar (y en ese caso ofrece reasignar el owner) o parar y hablarlo con ella. Si el owner
está vacío, ofrece ponerte tú.

Si el working tree tiene cambios sin commitear, avisa y pregunta antes de tocar ramas —
un `checkout` puede arrastrarlos o fallar.

## 2. Actualiza la rama base

Lee `base_branch` de `$SF config` (por defecto `dev`):

```
git checkout <base_branch>
git pull origin <base_branch>
```

Si `git pull` falla (sin remoto, sin red), muestra el error y pregunta si seguir con la
base local o parar. No lo ignores en silencio: ramificar de una base vieja es la causa
número uno de rebases dolorosos después.

## 3. Crea la rama de la spec

```
git checkout -b $($SF branch-name $ARGUMENTS)
```

Si ya existe, haz checkout de ella en vez de crearla.

## 4. Marca la spec como en curso

```
$SF status $ARGUMENTS in-progress
git add <ruta-de-la-spec> && git commit -m "SPEC-XXX: en progreso"
```

Este commit hace visible para el otro dev que alguien tomó la spec.

## 5. Implementa

Trabaja contra la **descripción** y los **criterios de aceptación** de la spec, con commits
incrementales y mensajes descriptivos (`SPEC-XXX: <qué hiciste>`). Un commit por unidad de
trabajo coherente, no uno gigante al final.

Sigue las convenciones que ya existan en el repo y en `CLAUDE.md`. No amplíes el scope: si
descubres algo importante fuera de lo que la spec declara, anótalo y menciónalo al final
como candidato a otra spec.

## 6. Los tests son parte del trabajo, no un after

Escribe los tests de cada criterio de aceptación **mientras implementas**, no al final.
El equipo es nuevo en testing automatizado, así que **explica lo que haces y por qué** —
cada corrida de esta skill debería enseñarles algo.

### Antes de escribir un test nuevo desde cero

Busca primero en la carpeta de tests (`test_paths` en `$SF config`) si ya existe algo
aplicable a este tipo de entidad:

- Helpers o utilidades de test compartidas.
- Factories / fixtures / builders para crear objetos de prueba.
- Shared examples o suites parametrizadas (validaciones comunes de un Model,
  comportamiento común de un Controller).
- Setup común: base de datos de prueba, cliente HTTP, mocks de servicios.

Busca por nombre de archivo (`helper`, `factory`, `fixture`, `support`, `shared`,
`conftest`) y por contenido, no solo por carpeta.

### Decide con esta regla

1. **Ya existe algo aplicable** → reúsalo o extiéndelo. Nunca dupliques lógica de test.
   Si te queda casi bien pero no del todo, generaliza el helper existente en vez de
   escribir una copia divergente.

2. **No existe, pero el patrón se va a repetir** — por ejemplo es el primer Model del
   proyecto y habrá más Models con las mismas validaciones → **crea el helper reutilizable**
   en lugar de un test aislado. Colócalo donde se encuentre fácil (`tests/helpers/`,
   `spec/support/`, `conftest.py`, según la convención del repo), con un comentario arriba
   que diga qué cubre y cómo usarlo, para que la próxima spec lo encuentre.

3. **Es un caso genuinamente único** → test normal, sin ceremonia.

### Trazabilidad: etiqueta SIEMPRE con el id

Todo test —o el `describe`/bloque que lo agrupa— debe llevar el id de la spec en su nombre:

```js
describe('User model — SPEC-001', () => { ... })
```

```python
class TestUserModel:  # SPEC-001
```

Si creas un helper compartido, menciona el id en su comentario de cabecera también.

Esto es lo que permite que `grep SPEC-001` encuentre spec y tests en ambas direcciones,
y es de donde `/spec-finish` saca el campo `tests:` del frontmatter. Un test sin etiquetar
es un test que el flujo pierde.

### Verifica sobre la marcha

Corre los tests mientras avanzas (`$SF test-cmd` te dice el comando de este repo). No
dejes la primera ejecución para el final.

## 7. Cierra el turno

**No** cambies el status a `finished`. **No** abras PR. **No** hagas push salvo que el
usuario lo pida. Eso es trabajo de `/spec-finish`.

Termina con un resumen que incluya:

- Qué implementaste, criterio por criterio.
- Los commits que hiciste.
- **Qué helpers de test reusaste y cuáles creaste, y por qué** — explicado en lenguaje
  llano. Si creaste un shared example, muestra cómo lo usará la próxima spec. Esta parte
  no es relleno: es la que le enseña el patrón al equipo.
- Estado de la suite de tests.
- Cualquier cosa que quedó fuera de scope y merece su propia spec.
- Que el siguiente paso es revisar el trabajo o correr `/spec-finish <id>`.
