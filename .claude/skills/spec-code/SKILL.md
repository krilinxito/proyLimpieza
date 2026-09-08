---
name: spec-code
description: "Slash command /spec-code <id> — implementa una spec aprobada. Actualiza dev, crea la rama feature/SPEC-XXX-<nombre>, pasa la spec a in-progress y codea con commits incrementales, escribiendo los tests de cada criterio de aceptación en el mismo trabajo y reutilizando o creando helpers de test compartidos. Deja una bitácora que explica cómo funciona lo implementado y por qué, para que alguien que está aprendiendo entienda el código y la arquitectura leyéndola. No cierra la spec ni abre PR."
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

### Comprueba que el id no choque con la base

```
$SF check-ids --against origin/<base_branch>
```

Este es **el mejor momento del flujo para descubrir un choque de ids**: acabas de traerte
la base y todavía no has escrito una línea de código, así que renumerar cuesta un archivo.
Más adelante cuesta también las etiquetas de todos los tests.

Si `choques` no está vacío, significa que esa misma spec ya existe en la base con otro
archivo — dos personas eligieron el mismo id. **Detente y díselo**, con los dos archivos.
Ofrece renumerar la de aquí:

```
$SF rename-id <id-viejo> <id-nuevo>
```

Devuelve lo que ha renombrado y lo que queda por hacer a mano: las etiquetas de los tests
y el nombre de la rama. Ocúpate de esos dos pasos también.

Si `duplicados` no está vacío, el choque ya está dentro de tu rama y hay que resolverlo
igual antes de seguir.

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

Todo test —o el `describe`/bloque que lo agrupa— debe llevar el id **completo** de la spec,
con su prefijo de dev, tal como lo devuelve `$SF show`:

```js
describe('User model — SPEC-ANA-001', () => { ... })
```

```python
class TestUserModel:  # SPEC-ANA-001
```

El prefijo no es decorativo: es lo que hace que la búsqueda encuentre solo tus tests. Sin
él, dos specs con el mismo número mezclarían sus tests, porque la búsqueda es por texto.

Si creas un helper compartido, menciona el id en su comentario de cabecera también.

Esto es lo que permite que `grep SPEC-ANA-001` encuentre spec y tests en ambas direcciones,
y es de donde `/spec-finish` saca el campo `tests:` del frontmatter. Un test sin etiquetar
es un test que el flujo pierde.

### Verifica sobre la marcha

Corre los tests mientras avanzas (`$SF test-cmd` te dice el comando de este repo). No
dejes la primera ejecución para el final.

## 7. Escribe la bitácora

Si `notes` es `false` en `$SF config`, sáltate este paso entero.

Todo lo que explicaste en el chat mientras implementabas se pierde en cuanto se cierra la
sesión: el compañero que hace `pull` no lo ve, y dentro de un mes nadie recuerda por qué el
código es así. La bitácora es eso mismo, por escrito y versionado.

**Para quién se escribe:** alguien que sabe leer código pero todavía no conoce los patrones
de este proyecto. Al terminar de leerla tiene que poder seguir el recorrido en el repo por
su cuenta, saber qué capa es cada pieza, y entender los conceptos nuevos que aparecieron.

### Antes de escribir, mira qué está ya explicado

```
$SF notes-index
```

Te devuelve el glosario del proyecto: qué concepto explicó qué spec y en qué bitácora.
**Un concepto se explica a fondo una sola vez en todo el proyecto.** Si ya está en el
índice, va en "Ya explicado antes" como una línea con su enlace, y no lo vuelves a contar.
Si no está, es tuyo: explícalo bien, porque las bitácoras siguientes van a apuntar a la
tuya.

### Escríbela

La ruta te la da el motor, y la estructura la plantilla:

```
$SF notes-path $ARGUMENTS
cat .claude/spec-flow/templates/NOTAS.md.tmpl
```

Las tres secciones que cargan el peso:

- **Cómo funciona, paso a paso** — el recorrido real de un caso concreto, de punta a punta,
  citando `archivo:línea` en cada salto. Sigue un dato: qué entra, por dónde pasa, en qué se
  convierte, qué sale. Nunca una descripción abstracta de módulos: lo que enseña a leer un
  repo es ver a alguien recorrerlo.
- **Dónde encaja en la arquitectura** — qué capa es cada pieza, por qué el proyecto está
  partido así, y **qué no le toca hacer** a esa capa. Átalo a las reglas que el `CLAUDE.md`
  o el `README` ya declaran, y di qué se rompe si se saltan. Si el repo no documenta su
  arquitectura, describe la que se deduce del código y **deja claro que es tu lectura**, no
  una regla del proyecto.
- **Fundamentos** — los conceptos nuevos, desde cero y sin dar nada por sabido: qué es, por
  qué existe el patrón, qué pasaría sin él, y el ejemplo **de este repo** con su
  `archivo:línea` en vez de uno de manual.

Cuando la termines, declara los conceptos que explicaste:

```
$SF notes-explains $ARGUMENTS "middleware, jwt, hash de contraseña"
```

Commitea la bitácora junto al trabajo, para que viaje en el diff del PR.

Si retomas una spec que ya estaba `in-progress` y su bitácora existe, **amplíala**; no la
sobrescribas.

### Lo que no va en la bitácora

- **La lista de archivos tocados.** Eso ya lo dice el diff, y repetirlo la vuelve ilegible.
- **Un concepto que ya está en el índice.** Se referencia, no se reexplica.
- **Relleno.** Si la spec no tuvo ninguna decisión interesante, dos líneas honestas valen
  más que tres párrafos de paja. El presupuesto de longitud se lo llevan el recorrido y los
  fundamentos nuevos; lo demás va corto.

## 8. Cierra el turno

**No** cambies el status a `finished`. **No** abras PR. **No** hagas push salvo que el
usuario lo pida. Eso es trabajo de `/spec-finish`.

Termina con un resumen que incluya:

- Qué implementaste, criterio por criterio.
- Los commits que hiciste.
- **Qué helpers de test reusaste y cuáles creaste, y por qué** — explicado en lenguaje
  llano. Si creaste un shared example, muestra cómo lo usará la próxima spec. Esta parte
  no es relleno: es la que le enseña el patrón al equipo.
- **La bitácora**: su ruta, y qué conceptos nuevos quedaron explicados ahí. No repitas su
  contenido en el chat — apunta a ella, que para eso se escribió.
- Estado de la suite de tests.
- Cualquier cosa que quedó fuera de scope y merece su propia spec.
- Que el siguiente paso es revisar el trabajo o correr `/spec-finish <id>`.
