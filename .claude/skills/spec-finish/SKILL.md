---
name: spec-finish
description: "Slash command /spec-finish <id> — cierra una spec implementada. Corre la suite completa detectando el framework, revisa el código contra los criterios de aceptación, rellena el campo tests: buscando el id de la spec, comprueba que la bitácora esté escrita, pasa el status a finished, hace rebase sobre dev resolviendo conflictos contigo paso a paso, y abre el PR contra dev."
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
  - Bash(gh:*)
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

# /spec-finish — cerrar una spec y abrir su PR

Spec pedida: **$ARGUMENTS**

```
SF="bash .claude/spec-flow/scripts/specflow"
```

Esta skill toca git y GitHub. Cuando algo no cuadre, **para y pregunta**; no improvises.

## 1. Preflight

Corre `$SF doctor` y `$SF show $ARGUMENTS`. Debe cumplirse todo esto antes de seguir:

- La rama `feature/SPEC-<id>-*` **existe y está activa** (`git branch --show-current`
  coincide con `$SF branch-name $ARGUMENTS`). Si estás en otra rama, ofrece hacer checkout.
  Si la rama no existe, detente: esta spec no se ha implementado — toca `/spec-code <id>`.
- `gh` está autenticado. Si no, detente y dile que corra `gh auth login`.
- La rama base (`dev` por defecto) existe en `origin`.

Si hay cambios sin commitear, muéstralos y pregunta si commitearlos antes de continuar.
Un rebase con el working tree sucio no arranca.

## 2. Corre la suite completa

```
$SF test-cmd
```

Te devuelve el comando y **por qué** lo eligió. Si `confident` es `false` o `command` es
`null`, **pregúntale al usuario** cuál es el comando en vez de adivinar.

Dile al usuario qué framework detectó y qué va a correr antes de ejecutarlo. Corre la
**suite completa**, no solo los tests nuevos: lo que importa aquí es que esta rama no haya
roto nada de lo que ya funcionaba.

**Si algo falla, detente.** Muestra el output real del fallo y ayuda a arreglarlo. No sigas
a los pasos siguientes con la suite en rojo, y no cierres la spec "asumiendo" que el fallo
no tiene que ver.

## 3. Revisa contra los criterios de aceptación

Recorre los criterios de la spec **uno por uno** y comprueba en el código que cada uno está
realmente implementado y cubierto por al menos un test. Preséntalo como una lista explícita:
criterio → dónde está implementado → qué test lo cubre.

Si algún criterio no está cumplido, dilo claramente y pregunta si completarlo ahora o si el
usuario prefiere ajustar la spec. No lo des por bueno.

Comprueba también la bitácora (`$SF notes-path $ARGUMENTS`), salvo que `notes` sea `false`
en `$SF config`. Si falta, **avisa pero no bloquees**: el PR se puede abrir igual, pero
quien lo revise se queda sin la explicación de por qué el código es así. Ofrece escribirla
antes de seguir.

## 4. Rellena la trazabilidad

```
$SF scan-tests $ARGUMENTS
```

Escanea los archivos de test buscando el id de la spec (la convención de
`describe('... — SPEC-001')`). Enséñale al usuario lo que encontró.

Si no encuentra nada pero sí escribiste tests, es que faltó etiquetarlos: **añade el id**
al `describe`/bloque correspondiente y vuelve a escanear. Ese campo es lo que permite ir
de la spec a sus tests y al revés dentro de seis meses.

Cuando la lista sea correcta:

```
$SF set-tests $ARGUMENTS
```

## 5. Cierra la spec

```
$SF status $ARGUMENTS finished
git add <ruta-de-la-spec> && git commit -m "SPEC-XXX: finished"
```

El status y el campo `tests:` van en el **mismo commit**.

## 6. Rebase sobre la base actualizada

```
git fetch origin <base_branch>
git rebase origin/<base_branch>
```

### Si hay conflictos — el punto delicado

**No resuelvas nada por tu cuenta.** Procede así:

1. Detente y lista los archivos en conflicto (`git diff --name-only --diff-filter=U`).
2. Para **cada** archivo, uno a uno:
   - Muestra el conflicto real (el bloque con `<<<<<<<` / `=======` / `>>>>>>>`).
   - Explica en lenguaje llano qué cambió cada lado: qué venía de `dev` (trabajo del otro
     dev) y qué viene de esta spec.
   - **Propón** una resolución y muestra exactamente cómo quedaría el archivo.
   - **Pide confirmación con AskUserQuestion antes de escribir nada.**
3. Solo tras el visto bueno, aplica la resolución, `git add` y sigue con el siguiente.
4. Cuando no queden conflictos: `git rebase --continue`.

Si el usuario prefiere abortar, `git rebase --abort` deja todo como estaba.

Nunca uses `--ours` / `--theirs` a ciegas, ni descartes trabajo del otro dev sin que lo
haya visto en pantalla. Un conflicto significa que dos personas tocaron lo mismo: quién
gana es una decisión del equipo, no tuya.

Después del rebase, **vuelve a correr la suite**: el código de `dev` es nuevo y puede
romper esta rama aunque el rebase haya sido limpio.

## 7. Push y PR

```
git push -u origin <rama-de-la-spec>
$SF pr-body $ARGUMENTS > /tmp/pr-body.md
gh pr create --base <base_branch> --title "SPEC-XXX: <nombre>" --body-file /tmp/pr-body.md
```

Si la rama ya se había pusheado y el rebase reescribió su historia, hará falta
`git push --force-with-lease`. Avisa al usuario y **pide confirmación** antes de forzar.

Si ya existe un PR abierto para esta rama, no crees otro: muestra el existente
(`gh pr view`) y menciona que el push ya lo actualizó.

`$SF pr-body` arma el cuerpo con la descripción, los criterios de aceptación, la lista de
tests que cubren la spec y —si existe— la bitácora, para que quien revise lea el recorrido
del código y el porqué de cada decisión sin abrir otro archivo.

## 8. Cierra el turno

Termina con:

- El enlace del PR.
- Resumen de la suite (cuántos tests, en verde).
- Los criterios de aceptación verificados.
- Los archivos de test que quedaron registrados en `tests:`.
- **Dejando explícito que el merge de `dev` → `main` es un proceso de release aparte,
  manual, fuera de esta skill.** Esta skill llega hasta el PR contra `dev` y ni un paso más.
