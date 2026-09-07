import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize, setScalar, setList } from './frontmatter.mjs';
import { specsDir } from './config.mjs';
import { scopeOverlaps } from './paths.mjs';
import { whoami } from './identity.mjs';
import { slugify } from './text.mjs';
import { noteBody } from './notes.mjs';

// Reexportada para no romper a quien la importaba desde aquí.
export { slugify };

export const FRONTMATTER_ORDER = [
  'id', 'name', 'slug', 'status', 'owner', 'created', 'scope', 'priority', 'depends_on', 'tests',
];
export const STATUSES = ['draft', 'approved', 'in-progress', 'finished'];
export const ACTIVE_STATUSES = STATUSES.filter((s) => s !== 'finished');

/** Accepts `1`, `001`, `SPEC-001`, `spec-001` — always yields `SPEC-001`. */
export function normalizeId(input) {
  const raw = String(input ?? '').trim();
  const m = raw.match(/(\d+)\s*$/);
  if (!m) throw new Error(`cannot read a spec number out of "${raw}"`);
  return `SPEC-${m[1].padStart(3, '0')}`;
}

/** The slug part of `SPEC-003-auth-backend.md` — '' if the file has none. */
function slugFromFilename(file) {
  return path.basename(file).replace(/\.md$/i, '').replace(/^SPEC-\d+-?/i, '');
}

export function listSpecs(cfg) {
  const dir = specsDir(cfg);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^SPEC-\d+.*\.md$/i.test(f))
    .map((f) => {
      const file = path.join(dir, f);
      const text = fs.readFileSync(file, 'utf8');
      const { data, body } = parse(text);
      return {
        id: data.id ?? normalizeId(f),
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

export function findSpec(cfg, idish) {
  const id = normalizeId(idish);
  const spec = listSpecs(cfg).find((s) => s.id === id);
  if (!spec) throw new Error(`no spec found with id ${id} in ${cfg.specs_dir}/`);
  return spec;
}

export function nextId(cfg) {
  const nums = listSpecs(cfg).map((s) => Number(s.id.match(/(\d+)/)?.[1] ?? 0));
  const max = nums.length ? Math.max(...nums) : 0;
  return `SPEC-${String(max + 1).padStart(3, '0')}`;
}

/** Active specs (status !== finished) whose scope collides with the proposed one. */
export function findOverlaps(cfg, proposedScope, { excludeId = null } = {}) {
  return listSpecs(cfg)
    .filter((s) => s.status !== 'finished' && s.id !== excludeId)
    .map((s) => ({ spec: s, matches: scopeOverlaps(proposedScope, s.scope) }))
    .filter((r) => r.matches.length > 0);
}

function renderBody(cfg, { description, criteria }) {
  // Resolved from this module, so it works no matter where the repo root is.
  const tmpl = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/SPEC.md.tmpl');
  const fallback = '## Descripción\n\n{{DESCRIPTION}}\n\n## Criterios de aceptación\n\n{{CRITERIA}}\n';
  const raw = fs.existsSync(tmpl) ? fs.readFileSync(tmpl, 'utf8') : fallback;
  const checklist = (criteria ?? []).length
    ? criteria.map((c) => `- [ ] ${c}`).join('\n')
    : '- [ ] (pendiente de definir)';
  return raw
    .replace('{{DESCRIPTION}}', (description ?? '').trim() || '(pendiente de definir)')
    .replace('{{CRITERIA}}', checklist);
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

  fs.writeFileSync(file, `${serialize(data, FRONTMATTER_ORDER)}\n\n${renderBody(cfg, payload)}`, 'utf8');
  return path.relative(cfg.__root, file);
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
