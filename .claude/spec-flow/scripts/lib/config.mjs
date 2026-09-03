import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  base_branch: 'dev',
  production_branch: 'main',
  specs_dir: 'specs',
  branch_prefix: 'feature/',
  test_command: null,
  test_paths: ['test', 'tests', 'spec', '__tests__', 'src'],
};

/** Repo root via git, falling back to cwd when we are not inside a repo. */
export function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

/** `.spec-flow.json` merged over DEFAULTS. Unknown keys are kept, so the file can carry notes. */
export function loadConfig(root = repoRoot()) {
  const file = path.join(root, '.spec-flow.json');
  let user = {};
  if (fs.existsSync(file)) {
    try {
      user = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`.spec-flow.json is not valid JSON: ${err.message}`);
    }
  }
  // A null in the file means "no override", so it must not clobber a default.
  const merged = { ...DEFAULTS };
  for (const [k, v] of Object.entries(user)) {
    if (v !== null && v !== undefined) merged[k] = v;
    else if (!(k in merged)) merged[k] = v;
  }
  merged.__root = root;
  merged.__configFile = fs.existsSync(file) ? file : null;
  return merged;
}

export function specsDir(cfg) {
  return path.join(cfg.__root, cfg.specs_dir);
}
