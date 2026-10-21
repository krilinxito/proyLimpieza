---
id: SPEC-KRILINXI-045
spec: specs/SPEC-KRILINXI-045-engines-npm.md
explica:
  - el lockfile lo escribe la herramienta (npm lo normaliza distinto segun su version)
  - un aviso que nadie lee no protege (engine-strict)
---

# SPEC-KRILINXI-045 — Versiones fijas de Node y npm para el monorepo

## Qué se construyó

Una sola versión de Node y de npm para todo el equipo: **Node 24 con el npm 11 que trae**. Se declara en tres archivos de
la raíz (`package.json`, `.npmrc`, `.nvmrc`), `npm install` **falla** si la versión no coincide, y el
`package-lock.json` se regeneró una vez con esa versión. No cambió ninguna dependencia ni una línea de código de la
aplicación.

## Cómo funciona, paso a paso

El caso que motivó la spec: alguien con npm 11.19 hace `npm install` y el `package-lock.json` aparece modificado.

1. **Antes**, `package.json` solo decía `"node": ">=20"` y no pedía ningún npm. Cada máquina instalaba con la suya.
2. **Ahora** `package.json` declara `engines` con `node >=24 <25` y `npm >=11 <12`. Eso solo, sin más, **avisa** si no
   coincide: npm imprime `EBADENGINE` como advertencia y sigue instalando.
3. **`.npmrc` convierte el aviso en un error.** Su única línea activa, `engine-strict=true`, hace que npm se detenga con
   código de salida 1. Se comprobó así: en una carpeta aparte, con ese mismo `.npmrc` y un `engines` que esta máquina no
   cumple, `npm install` terminó con `npm error code EBADENGINE … Required: {"node":">=99 <100",…} Actual:
   {"node":"v24.22.0","npm":"11.19.1"}`; quitando el `.npmrc`, solo hubo un `npm warn EBADENGINE` y siguió.
4. **`.nvmrc` dice `24`.** Quien usa nvm corre `nvm use` y queda en la versión; no es obligatorio (nvm no se instala por
   esta spec), pero ahorra el paso de adivinar.
5. **El lock se regenera una vez, en su propio commit.** Con Node 24.22.0 y npm 11.19.1 se corrió `npm install`: el
   `package-lock.json` perdió las 26 líneas `"peer": true` y cambió su entrada `engines`; **ninguna línea de `version`,
   `resolved` ni `integrity` se movió**. Una segunda `npm install` dejó el archivo idéntico (mismo hash).

## Dónde encaja en la arquitectura

Es configuración de la **raíz del monorepo** (npm workspaces → SPEC-ALE186-001 y SPEC-KRILINXI-001), no de `backend/` ni de
`frontend/`: las dos carpetas comparten un solo `package-lock.json` y un solo `node_modules` hoisteado, así que la versión de
npm que lo escribe afecta a las dos. Por eso `engines` vive solo en la raíz.

No hay nada de la regla de capas de CLAUDE.md §5: no se toca código. Lo que sí toca es §4 (el stack ahora dice qué versiones y
cómo instalarlas) y §13 (por qué el lock se commitea solo con esta versión).

## Fundamentos

**El lockfile no es solo una lista de versiones: también lo escribe la herramienta.** `package-lock.json` fija qué versión
exacta de cada dependencia se instala, y eso no depende de npm. Pero npm además *normaliza* el archivo: decide cómo se anotan
campos como `"peer": true` o `engines`, y **versiones distintas de npm lo hacen distinto**. Por eso dos personas con las
mismas dependencias podían producir locks diferentes, y el diff de un PR mostraba 26 líneas borradas que no significaban nada. La
solución no es "tener cuidado" sino que la herramienta sea la misma: fijar la versión.

**Un aviso que nadie lee no protege.** `engines` en `package.json` es una *declaración*; por defecto npm solo la usa para avisar,
y un `npm warn` entre cuarenta líneas de instalación se pasa por alto. `engine-strict=true` cambia el trato: de aviso a **error**,
y el error dice qué versión se necesita y cuál hay. Es el mismo principio que usa el proyecto en otros lados (el backend no arranca
si falta una migración, CLAUDE.md §11): lo que se puede romper en silencio, se rompe en voz alta y temprano.

**Ya explicado antes:**

- **npm workspaces** (un solo lock y un solo `node_modules` para backend y frontend) → SPEC-KRILINXI-001 (`specs/notas/SPEC-KRILINXI-001-frontend-scaffold.md`)

## Decisiones y por qué

- **Node 24 y npm 11, y no un rango más ancho.** El ruido venía justamente de que cada máquina tuviera otro npm; un rango
  grande (`>=11`) lo habría dejado volver con npm 12. El tope `<25` / `<12` obliga a una decisión consciente al subir de versión,
  con los tres archivos y el lock cambiando juntos.
- **El lock en un commit aparte**, como pedía la spec: el diff del PR queda dividido en "la configuración" y "lo que npm
  reescribió", y quien revise ve de un vistazo que lo segundo es solo `peer` y `engines`.
- **Un test que vigila los cuatro archivos** (`backend/tests/unit/versionesDelEntorno.test.ts`). La spec no lo pedía, pero sin él
  alguien puede subir `engines` en `package.json` y olvidarse de regenerar el lock, o editar `.nvmrc` solo. El test no instala
  nada: lee y compara. Queda fuera del alcance declarado de la spec (que lista solo los cuatro archivos de configuración y
  `CLAUDE.md`).
- **No se agregó una comprobación en el test de la versión de Node que corre.** Haría que `npm test` fallara en una máquina con otro
  Node aunque el código esté bien; el que protege ahí es `npm install`.
- **No se tocó `allowScripts`.** npm 11.19 avisa que `bcrypt`, `better-sqlite3` y `esbuild` tienen scripts de instalación "no
  cubiertos". Es un aviso, no un error, y aprobarlos es otra decisión (qué scripts se permiten correr): queda anotado en CLAUDE.md §13
  como candidato a una spec propia.

## Los tests

- `backend/tests/unit/versionesDelEntorno.test.ts` — cuatro comprobaciones sobre los archivos de la raíz: los `engines` de
  `package.json`, la línea activa de `.npmrc` (un comentario `# engine-strict=true` no cuenta), que `.nvmrc` sea la versión mayor
  de `engines.node`, y que el lock tenga los mismos `engines` (prueba de que se regeneró).
- Lo que no es de un test se **verificó a mano y quedó dicho arriba**: que `npm install` falle con otra versión (en una carpeta
  aparte, con el mismo `.npmrc`), que el diff del lock solo toque `peer` y `engines`, y que una segunda instalación no lo cambie.

No hizo falta ningún helper: son pruebas de lectura de archivos, sin base de datos ni HTTP.

## Si mañana tenés que tocar esto

Para subir de versión (Node 26, npm 12): **una spec**, y se cambian juntos `engines`, `.nvmrc` y el lock (`npm install` con la versión
nueva, en un commit aparte); el test de arriba falla si falta alguno. Si ves el lock modificado sin haber tocado dependencias,
casi seguro tu Node o npm no es el acordado: `node --version` y `npm --version`, `git checkout package-lock.json` y reinstalá.
