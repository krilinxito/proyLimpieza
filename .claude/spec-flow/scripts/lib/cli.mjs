#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadConfig, DEFAULTS } from './config.mjs';
import { detectTestCommand } from './detect.mjs';
import { grepSpecId } from './paths.mjs';
import { whoami } from './identity.mjs';
import {
  listSpecs, findSpec, nextId, createSpec, setStatus, setTests,
  branchName, prBody, findOverlaps, normalizeId, ACTIVE_STATUSES,
} from './specs.mjs';

const out = (v) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));

function git(args) {
  try {
    return { ok: true, value: execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() };
  } catch (err) {
    return { ok: false, value: (err.stderr || err.stdout || String(err)).trim() };
  }
}

const USAGE = `specflow — motor determinista de las skills /spec-new, /spec-code y /spec-finish

  doctor                        preflight: git, gh, rama base, specs/, framework de tests
  config                        configuración efectiva (.spec-flow.json sobre los defaults)
  whoami                        identidad git de quien corre el comando, y otros autores del repo
  list [--active]               todas las specs como JSON
  show <id>                     una spec como JSON (frontmatter + cuerpo)
  next-id                       siguiente id libre, p.ej. SPEC-004
  create --json <archivo|->     crea specs/SPEC-XXX-<slug>.md en status draft
  overlap --scope a,b,c         specs activas cuyo scope choca con el propuesto
  status <id> <nuevo-status>    cambia status (draft|approved|in-progress|finished)
  scan-tests <id>               archivos de test que mencionan el id de la spec
  set-tests <id> [rutas...]     rellena tests: (sin rutas, usa scan-tests)
  test-cmd                      comando de tests detectado para este repo
  branch-name <id>              feature/SPEC-XXX-<slug>
  pr-body <id>                  cuerpo del PR a partir de la spec`;

function cmdDoctor(cfg) {
  const report = { ok: true, checks: [] };
  const add = (name, ok, detail, fatal = false) => {
    report.checks.push({ name, ok, detail, fatal });
    if (!ok && fatal) report.ok = false;
  };

  const inRepo = git(['rev-parse', '--is-inside-work-tree']);
  add('git', inRepo.ok, inRepo.ok ? `repo en ${cfg.__root}` : 'no estás dentro de un repositorio git', true);

  let gh = { ok: false, value: '' };
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: ['ignore', 'pipe', 'pipe'] });
    gh = { ok: true, value: 'gh autenticado' };
  } catch (err) {
    // ENOENT = el binario no existe. `err.status` no sirve para distinguirlo:
    // en ese caso Node lo deja en null, no en undefined.
    const missing = err.code === 'ENOENT';
    gh = { ok: false, value: missing ? 'gh no está instalado (instálalo: https://cli.github.com)' : 'gh instalado pero no autenticado (corre: gh auth login)' };
  }
  add('gh', gh.ok, gh.value, false); // solo /spec-finish lo necesita

  if (inRepo.ok) {
    const local = git(['rev-parse', '--verify', `refs/heads/${cfg.base_branch}`]);
    add(`rama local ${cfg.base_branch}`, local.ok,
      local.ok ? 'existe' : `no existe (créala: git checkout -b ${cfg.base_branch})`, false);

    const remote = git(['ls-remote', '--exit-code', '--heads', 'origin', cfg.base_branch]);
    add(`rama remota origin/${cfg.base_branch}`, remote.ok,
      remote.ok ? 'existe' : `no existe en origin (pushéala: git push -u origin ${cfg.base_branch})`, false);

    const current = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    add('rama actual', true, current.ok ? current.value : 'desconocida', false);

    const dirty = git(['status', '--porcelain']);
    add('working tree', dirty.ok && dirty.value === '', dirty.value === '' ? 'limpio' : 'hay cambios sin commitear', false);
  }

  const hasSpecs = fs.existsSync(`${cfg.__root}/${cfg.specs_dir}`);
  add(`carpeta ${cfg.specs_dir}/`, hasSpecs, hasSpecs ? `${listSpecs(cfg).length} spec(s)` : 'no existe todavía (se crea sola en /spec-new)', false);

  const t = detectTestCommand(cfg);
  add('framework de tests', Boolean(t.command),
    t.command ? `${t.framework} → ${t.command} (${t.reason})` : t.reason, false);

  add('config', true, cfg.__configFile ? `${cfg.__configFile}` : 'sin .spec-flow.json, usando defaults', false);
  report.config = { base_branch: cfg.base_branch, production_branch: cfg.production_branch, specs_dir: cfg.specs_dir, branch_prefix: cfg.branch_prefix };
  return report;
}

function readJsonArg(arg) {
  const raw = arg === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(arg, 'utf8');
  return JSON.parse(raw);
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
}

function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return out(USAGE);

  const cfg = loadConfig();

  switch (cmd) {
    case 'doctor':    return out(cmdDoctor(cfg));
    case 'config':    return out({ ...DEFAULTS, ...cfg });
    case 'whoami':    return out(whoami());
    case 'list': {
      const all = listSpecs(cfg).map(({ body, ...rest }) => rest);
      return out(argv.includes('--active') ? all.filter((s) => ACTIVE_STATUSES.includes(s.status)) : all);
    }
    case 'show':      return out(findSpec(cfg, argv[0]));
    case 'next-id':   return out(nextId(cfg));
    case 'create': {
      const payload = readJsonArg(flag(argv, '--json') ?? '-');
      const file = createSpec(cfg, payload);
      return out({ created: file, id: payload.id ? normalizeId(payload.id) : file.match(/SPEC-\d+/)[0], status: 'draft' });
    }
    case 'overlap': {
      const scope = (flag(argv, '--scope') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!scope.length) throw new Error('overlap necesita --scope con al menos una ruta o glob');
      const hits = findOverlaps(cfg, scope, { excludeId: flag(argv, '--exclude') ? normalizeId(flag(argv, '--exclude')) : null });
      return out({
        proposed: scope,
        conflicts: hits.map(({ spec, matches }) => ({
          id: spec.id, name: spec.name, status: spec.status, owner: spec.owner, path: spec.path, matches,
        })),
      });
    }
    case 'status':    return out(setStatus(cfg, argv[0], argv[1]));
    case 'scan-tests': {
      const spec = findSpec(cfg, argv[0]);
      return out({ id: spec.id, searched: cfg.test_paths, found: grepSpecId(cfg.__root, cfg.test_paths, spec.id) });
    }
    case 'set-tests': {
      const spec = findSpec(cfg, argv[0]);
      const explicit = argv.slice(1).filter((a) => !a.startsWith('--'));
      const tests = explicit.length ? explicit : grepSpecId(cfg.__root, cfg.test_paths, spec.id);
      return out(setTests(cfg, spec.id, tests));
    }
    case 'test-cmd':  return out(detectTestCommand(cfg));
    case 'branch-name': return out(branchName(cfg, argv[0]));
    case 'pr-body':   return out(prBody(cfg, argv[0]));
    default:
      throw new Error(`subcomando desconocido: ${cmd}\n\n${USAGE}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`specflow: ${err.message}`);
  process.exit(1);
}
