import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize, setScalar, setList } from './frontmatter.mjs';
import { specsDir } from './config.mjs';
import { scopeOverlaps } from './paths.mjs';
import { whoami, devPrefix } from './identity.mjs';
import { slugify } from './text.mjs';
import { noteBody } from './notes.mjs';

// Reexportada para no romper a quien la importaba desde aquí.
export { slugify };

export const FRONTMATTER_ORDER = [
  'id', 'name', 'slug', 'status', 'owner', 'created', 'scope', 'priority', 'depends_on', 'tests',
];
export const STATUSES = ['draft', 'approved', 'in-progress', 'finished'];
export const ACTIVE_STATUSES = STATUSES.filter((s) => s !== 'finished');

/** Un id de spec, ya sea `SPEC-KRI-001` o el `SPEC-001` de antes del prefijo de dev. */
const ID_RE = /^SPEC-(?:([A-Za-z][A-Za-z0-9]{0,7})-)?(\d+)$/i;

/**
 * Parte un id en sus dos piezas. `prefix` es `null` en las specs creadas antes de que los
 * ids llevaran prefijo de dev — siguen siendo válidas y se resuelven igual.
 */
export function parseId(id) {
  const m = String(id ?? '').trim().match(ID_RE);
  if (!m) return { prefix: null, numero: null };
  return { prefix: m[1] ? m[1].toUpperCase() : null, numero: Number(m[2]) };
}

/**
 * Acepta `1`, `001`, `SPEC-001`, `kri-001`, `SPEC-KRI-001` y devuelve la forma canónica.
 *
 * El `SPEC-` inicial se quita ANTES de buscar el prefijo: si no, en `SPEC-001` el parser
 * leería `SPEC` como prefijo de dev y el número se perdería.
 */
export function normalizeId(input) {
  const raw = String(input ?? '').trim();
  const sinSpec = raw.replace(/^spec[-_\s]*/i, '');
  const m = sinSpec.match(/^(?:([A-Za-z][A-Za-z0-9]{0,7})[-_\s]+)?(\d+)\s*$/);
  if (!m) throw new Error(`no encuentro un número de spec en "${raw}"`);
  const numero = m[2].padStart(3, '0');
  return m[1] ? `SPEC-${m[1].toUpperCase()}-${numero}` : `SPEC-${numero}`;
}

/** El id que lleva el propio nombre del archivo, o null si no lo lleva. */
function idFromFilename(archivo) {
  const m = archivo.match(/^(SPEC-(?:[A-Za-z][A-Za-z0-9]{0,7}-)?\d+)/i);
  return m ? normalizeId(m[1]) : null;
}

/** The slug part of `SPEC-003-auth-backend.md` — '' if the file has none. */
function slugFromFilename(file) {
  return path.basename(file)
    .replace(/\.md$/i, '')
    .replace(/^SPEC-(?:[A-Za-z][A-Za-z0-9]{0,7}-)?\d+-?/i, '');
}

export function listSpecs(cfg) {
  const dir = specsDir(cfg);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^SPEC-(?:[A-Za-z][A-Za-z0-9]{0,7}-)?\d+.*\.md$/i.test(f))
    .map((f) => {
      const file = path.join(dir, f);
      const text = fs.readFileSync(file, 'utf8');
      const { data, body } = parse(text);
      const id = data.id ?? idFromFilename(f) ?? '';
      return {
        id,
        ...parseId(id),
        name: data.name ?? '',
        // `slug` decide el nombre del archivo y el de la rama; va aparte de `name` para
        // que el título pueda ser descriptivo sin alargar los dos. Las specs anteriores a
        // este campo no lo traen: ahí el nombre del archivo es la fuente de verdad —
        // coincide con la rama que /spec-code ya creó— y `name` el último recurso.
        slug: data.slug || slugFromFilename(f) || slugify(data.name ?? ''),
        status: data.status ?? 'draft',
        owner: data.owner ?? '',
        created: data.created ?? '',
        scope: Array.isArray(data.scope) ? data.scope : [],
        priority: data.priority ?? '',
        depends_on: Array.isArray(data.depends_on) ? data.depends_on : [],
        tests: Array.isArray(data.tests) ? data.tests : [],
        path: path.relative(cfg.__root, file),
        body,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * La spec con ese id. Un `001` a secas vale mientras no haya dos specs con ese número.
 *
 * Cuando las hay, esto **falla** en vez de elegir una: operar en silencio sobre la spec
 * equivocada es justo el fallo que el prefijo de dev vino a evitar, y un error molesto se
 * arregla en un minuto mientras que una trazabilidad cruzada no se ve hasta mucho después.
 */
export function findSpec(cfg, idish) {
  const id = normalizeId(idish);
  const { prefix, numero } = parseId(id);
  const todas = listSpecs(cfg);
  const candidatas = prefix
    ? todas.filter((s) => s.id === id)
    : todas.filter((s) => s.numero === numero);

  if (candidatas.length === 1) return candidatas[0];
  if (candidatas.length === 0) throw new Error(`no hay ninguna spec con id ${id} en ${cfg.specs_dir}/`);

  throw new Error(
    `"${idish}" es ambiguo: ${candidatas.length} specs comparten ese número.\n`
    + candidatas.map((s) => `  ${s.id}  ${s.path}`).join('\n')
    + `\nUsá el id completo, por ejemplo: ${candidatas[0].id}`,
  );
}

/**
 * El siguiente id libre **de esta persona**: cuenta solo las specs con su prefijo.
 *
 * Que cada dev numere su propia serie es lo que hace imposible la colisión. Con una serie
 * global habría que leer las specs del otro para saber el siguiente número, y dos personas
 * creando una spec a la vez —sin haber pusheado— volverían a llevarse el mismo.
 */
export function nextId(cfg) {
  const mio = devPrefix();
  const nums = listSpecs(cfg).filter((s) => s.prefix === mio).map((s) => s.numero ?? 0);
  const max = nums.length ? Math.max(...nums) : 0;
  return `SPEC-${mio}-${String(max + 1).padStart(3, '0')}`;
}

/** Ids que aparecen en más de un archivo. Vacío es lo sano. */
export function duplicateIds(cfg) {
  const porId = new Map();
  for (const s of listSpecs(cfg)) {
    if (!porId.has(s.id)) porId.set(s.id, []);
    porId.get(s.id).push(s.path);
  }
  return [...porId.entries()]
    .filter(([, rutas]) => rutas.length > 1)
    .map(([id, rutas]) => ({ id, rutas }));
}

/** Active specs (status !== finished) whose scope collides with the proposed one. */
export function findOverlaps(cfg, proposedScope, { excludeId = null } = {}) {
  return listSpecs(cfg)
    .filter((s) => s.status !== 'finished' && s.id !== excludeId)
    .map((s) => ({ spec: s, matches: scopeOverlaps(proposedScope, s.scope) }))
    .filter((r) => r.matches.length > 0);
}

function renderBody(cfg, { description, criteria, id }) {
  // Resolved from this module, so it works no matter where the repo root is.
  const tmpl = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/SPEC.md.tmpl');
  const fallback = '## Descripción\n\n{{DESCRIPTION}}\n\n## Criterios de aceptación\n\n{{CRITERIA}}\n';
  const raw = fs.existsSync(tmpl) ? fs.readFileSync(tmpl, 'utf8') : fallback;
  const checklist = (criteria ?? []).length
    ? criteria.map((c) => `- [ ] ${c}`).join('\n')
    : '- [ ] (pendiente de definir)';
  return raw
    .replace('{{DESCRIPTION}}', (description ?? '').trim() || '(pendiente de definir)')
    .replace('{{CRITERIA}}', checklist)
    .replaceAll('{{ID}}', id ?? 'SPEC-XXX');
}

/** Write a brand-new spec file. Returns its repo-relative path. */
export function createSpec(cfg, payload) {
  const dir = specsDir(cfg);
  fs.mkdirSync(dir, { recursive: true });

  const id = payload.id ? normalizeId(payload.id) : nextId(cfg);
  const name = String(payload.name ?? '').trim();
  if (!name) throw new Error('a spec needs a name');
  const slug = slugify(payload.slug ?? name);

  const data = {
    id,
    name,
    slug,
    status: 'draft',                       // /spec-new never approves; the human does
    // Falls back to the git identity that will sign the commits. An explicit ''
    // still means "sin asignar", so the skill can leave it open on purpose.
    owner: payload.owner ?? whoami().name,
    created: payload.created ?? new Date().toISOString().slice(0, 10),
    scope: payload.scope ?? [],
    priority: payload.priority ?? 'medium',
    depends_on: (payload.depends_on ?? []).map(normalizeId),
    tests: [],                             // filled by /spec-finish, never by hand
  };

  const file = path.join(dir, `${id}-${slug}.md`);
  if (fs.existsSync(file)) throw new Error(`${path.relative(cfg.__root, file)} already exists`);

  fs.writeFileSync(file, `${serialize(data, FRONTMATTER_ORDER)}\n\n${renderBody(cfg, { ...payload, id })}`, 'utf8');
  // Devuelve el id además de la ruta: sacarlo del nombre del archivo obliga a mantener un
  // regex en sincronía con el formato del id, y ese regex ya se quedó atrás una vez.
  return { path: path.relative(cfg.__root, file), id };
}

export function setStatus(cfg, idish, status) {
  if (!STATUSES.includes(status)) {
    throw new Error(`invalid status "${status}" (expected one of: ${STATUSES.join(', ')})`);
  }
  const spec = findSpec(cfg, idish);
  const file = path.join(cfg.__root, spec.path);
  fs.writeFileSync(file, setScalar(fs.readFileSync(file, 'utf8'), 'status', status), 'utf8');
  return { id: spec.id, path: spec.path, from: spec.status, to: status };
}

export function setTests(cfg, idish, tests) {
  const spec = findSpec(cfg, idish);
  const file = path.join(cfg.__root, spec.path);
  const unique = [...new Set(tests)].sort();
  fs.writeFileSync(file, setList(fs.readFileSync(file, 'utf8'), 'tests', unique), 'utf8');
  return { id: spec.id, path: spec.path, tests: unique };
}

export function branchName(cfg, idish) {
  const spec = findSpec(cfg, idish);
  return `${cfg.branch_prefix}${spec.id}-${spec.slug}`;
}

/** Pull one `## Heading` section out of a spec body. */
export function section(body, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const lines = body.split('\n');
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s+/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

export function prBody(cfg, idish) {
  const spec = findSpec(cfg, idish);
  const description = section(spec.body, 'Descripci[oó]n') || section(spec.body, 'Description');
  const criteria = section(spec.body, 'Criterios de aceptaci[oó]n') || section(spec.body, 'Acceptance criteria');
  const tests = spec.tests.length
    ? spec.tests.map((t) => `- \`${t}\``).join('\n')
    : '_Ningún archivo de test referencia esta spec._';

  // La bitácora, sin su título (el PR ya lleva el suyo) y sin los comentarios de la
  // plantilla, que son instrucciones para quien la escribe y no tienen nada que hacer en un
  // PR. Quien revisa lee aquí el porqué de cada decisión sin abrir otro archivo.
  const notas = cfg.notes === false
    ? ''
    : noteBody(cfg, spec)
      .replace(/^#\s+.*\n+/, '')
      .replace(/<!--[\s\S]*?-->\n?/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  return [
    `## ${spec.id} — ${spec.name}`,
    '',
    description || '_Sin descripción._',
    '',
    '## Criterios de aceptación',
    '',
    criteria || '_Sin criterios._',
    '',
    '## Tests que cubren esta spec',
    '',
    tests,
    '',
    ...(notas ? ['## Cómo se implementó', '', notas, ''] : []),
    '---',
    '',
    `Spec: \`${spec.path}\` · prioridad **${spec.priority}** · owner **${spec.owner || 'sin asignar'}**`,
    spec.depends_on.length ? `Depende de: ${spec.depends_on.join(', ')}` : null,
    '',
    `> Este PR va contra \`${cfg.base_branch}\`. El merge de \`${cfg.base_branch}\` → \`${cfg.production_branch}\` es un proceso de release aparte.`,
  ].filter((l) => l !== null).join('\n');
}
