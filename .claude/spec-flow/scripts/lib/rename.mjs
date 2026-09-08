/**
 * Detección de ids repetidos y renumerado de una spec.
 *
 * Van juntos porque uno es la consecuencia del otro: las guardas te dicen que dos specs
 * comparten id, y `rename-id` es lo que lo arregla sin tener que renombrar a mano el
 * archivo, la bitácora y sus dos campos de frontmatter.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setScalar } from './frontmatter.mjs';
import { specsDir, notesDir } from './config.mjs';
import { grepSpecId } from './paths.mjs';
import { listSpecs, findSpec, normalizeId, duplicateIds } from './specs.mjs';
import { notesPath, notesRelPath } from './notes.mjs';

function git(cfg, args) {
  try {
    return execFileSync('git', args, {
      cwd: cfg.__root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const ID_EN_NOMBRE = /^(SPEC-(?:[A-Za-z][A-Za-z0-9]{0,7}-)?\d+)/i;

/** Los ids de spec que hay en una rama, leídos de los nombres de archivo. */
function idsEnRef(cfg, ref) {
  const salida = git(cfg, ['ls-tree', '-r', '--name-only', ref, '--', cfg.specs_dir]);
  if (salida === null) return null;

  const encontrados = new Map();
  for (const ruta of salida.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const base = path.basename(ruta);
    // Las bitácoras repiten el id de su spec; solo interesan las specs.
    if (path.dirname(ruta) !== cfg.specs_dir) continue;
    const m = base.match(ID_EN_NOMBRE);
    if (m) encontrados.set(normalizeId(m[1]), ruta);
  }
  return encontrados;
}

/**
 * Dos comprobaciones distintas:
 *
 * 1. Ids repetidos en el working tree — lo que queda DESPUÉS de mergear dos ramas que
 *    eligieron el mismo número.
 * 2. Con `--against origin/dev`: si un id mío ya está en esa rama con OTRO archivo. Mismo
 *    id y mismo archivo no es choque: es mi propia spec, ya mergeada.
 */
export function checkIds(cfg, ref = null) {
  const duplicados = duplicateIds(cfg);
  const resultado = { ok: duplicados.length === 0, duplicados, ref: ref ?? null, choques: [] };

  if (!ref) return resultado;

  const enRef = idsEnRef(cfg, ref);
  if (enRef === null) {
    resultado.aviso = `no pude leer ${ref} (¿hace falta git fetch?) — comprobé solo el working tree`;
    return resultado;
  }

  for (const spec of listSpecs(cfg)) {
    const alla = enRef.get(spec.id);
    if (alla && alla !== spec.path) {
      resultado.choques.push({ id: spec.id, aqui: spec.path, en: `${ref}:${alla}` });
    }
  }
  resultado.ok = duplicados.length === 0 && resultado.choques.length === 0;
  return resultado;
}

/**
 * Renumera una spec: su archivo, su bitácora y los campos de frontmatter que se refieren
 * a ella.
 *
 * No toca los tests ni la rama a propósito. Reescribir a ciegas la etiqueta de un test es
 * cambiar código que alguien tiene que revisar, y renombrar la rama de otro puede romperle
 * un push en curso. Devuelve los dos como pendientes, con los archivos concretos.
 */
export function renameId(cfg, viejo, nuevo) {
  if (!viejo || !nuevo) throw new Error('uso: rename-id <id-viejo> <id-nuevo>');

  const spec = findSpec(cfg, viejo);
  const nuevoId = normalizeId(nuevo);
  if (nuevoId === spec.id) throw new Error(`${spec.id} ya tiene ese id`);
  if (listSpecs(cfg).some((s) => s.id === nuevoId)) {
    throw new Error(`ya hay una spec con id ${nuevoId}`);
  }

  const specVieja = path.join(cfg.__root, spec.path);
  const specNueva = path.join(specsDir(cfg), `${nuevoId}-${spec.slug}.md`);
  fs.writeFileSync(specVieja, setScalar(fs.readFileSync(specVieja, 'utf8'), 'id', nuevoId), 'utf8');
  fs.renameSync(specVieja, specNueva);

  const resultado = {
    de: spec.id,
    a: nuevoId,
    spec: path.relative(cfg.__root, specNueva),
    nota: null,
    pendientes: {},
  };

  const notaVieja = notesPath(cfg, spec);
  if (fs.existsSync(notaVieja)) {
    const notaNueva = path.join(notesDir(cfg), `${nuevoId}-${spec.slug}.md`);
    let texto = fs.readFileSync(notaVieja, 'utf8');
    texto = setScalar(texto, 'id', nuevoId);
    texto = setScalar(texto, 'spec', resultado.spec);
    fs.writeFileSync(notaVieja, texto, 'utf8');
    fs.renameSync(notaVieja, notaNueva);
    resultado.nota = path.relative(cfg.__root, notaNueva);
  }

  const tests = grepSpecId(cfg.__root, cfg.test_paths, spec.id);
  if (tests.length) {
    resultado.pendientes.tests = {
      archivos: tests,
      accion: `cambiá "${spec.id}" por "${nuevoId}" en el describe/bloque de cada uno`,
    };
  }

  const ramaActual = git(cfg, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const ramaVieja = `${cfg.branch_prefix}${spec.id}-${spec.slug}`;
  if (ramaActual === ramaVieja) {
    resultado.pendientes.rama = {
      de: ramaVieja,
      accion: `git branch -m ${cfg.branch_prefix}${nuevoId}-${spec.slug}`,
    };
  }

  return resultado;
}
