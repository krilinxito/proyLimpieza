import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'out', 'coverage',
  '.venv', 'venv', '__pycache__', 'target', '.next', '.nuxt', '.cache', 'tmp',
]);

const TEST_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rb', '.go',
  '.php', '.java', '.rs', '.kt', '.cs', '.swift', '.ex', '.exs',
]);

const TEST_DIR_NAMES = new Set(['test', 'tests', 'spec', 'specs', '__tests__', 'testing']);

export function normalizeEntry(entry) {
  return String(entry).trim().replace(/^\.\//, '').replace(/\/+$/, '');
}

/** Compile a glob (supporting ** , * and ?) into an anchored regex. */
export function globToRegex(glob) {
  let re = '';
  const g = normalizeEntry(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        // `**/` may match zero directories, so the slash is optional.
        if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const hasWildcard = (s) => /[*?]/.test(s);
/** Longest leading path segment run with no wildcard — the directory a glob is rooted in. */
const staticPrefix = (s) => {
  const parts = normalizeEntry(s).split('/');
  const keep = [];
  for (const p of parts) {
    if (hasWildcard(p)) break;
    keep.push(p);
  }
  return keep.join('/');
};
const isUnder = (child, parent) => parent !== '' && (child === parent || child.startsWith(`${parent}/`));

/**
 * Do two scope entries refer to overlapping territory?
 *
 * Works on the strings alone rather than on the filesystem, because a spec's scope
 * routinely names files that do not exist yet.
 */
export function entriesOverlap(a, b) {
  const x = normalizeEntry(a);
  const y = normalizeEntry(b);
  if (!x || !y) return false;
  if (x === y) return true;

  const wx = hasWildcard(x);
  const wy = hasWildcard(y);

  if (!wx && !wy) return isUnder(x, y) || isUnder(y, x);
  if (wx && !wy) return globToRegex(x).test(y) || isUnder(y, staticPrefix(x));
  if (!wx && wy) return globToRegex(y).test(x) || isUnder(x, staticPrefix(y));

  const px = staticPrefix(x);
  const py = staticPrefix(y);
  if (px === '' || py === '') return true; // one of them is rooted at the repo top
  return isUnder(px, py) || isUnder(py, px);
}

/** Every pair of entries from two scopes that overlap. */
export function scopeOverlaps(scopeA, scopeB) {
  const hits = [];
  for (const a of scopeA ?? []) {
    for (const b of scopeB ?? []) {
      if (entriesOverlap(a, b)) hits.push({ a, b });
    }
  }
  return hits;
}

function* walk(dir, root) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      yield* walk(full, root);
    } else if (e.isFile()) {
      yield path.relative(root, full);
    }
  }
}

/** Heuristic: does this path look like a test file? */
export function looksLikeTest(rel) {
  const base = path.basename(rel);
  const ext = path.extname(base);
  if (!TEST_EXTS.has(ext)) return false;
  const stem = base.slice(0, base.length - ext.length);
  const inTestDir = rel.split('/').slice(0, -1).some((seg) => TEST_DIR_NAMES.has(seg.toLowerCase()));
  // `tests.py` on its own is a real suite (Django), but a file called just
  // `spec.ts` or `specs.mjs` is almost always a module about specs, not a suite.
  // Those only count when they live in a test directory.
  if (/^specs?$/i.test(stem)) return inTestDir;
  if (/(^|[._-])(test|spec)s?([._-]|$)/i.test(stem)) return true;
  return inTestDir;
}

/**
 * Candidate test files under the configured test_paths, falling back to the whole
 * repo when none of those directories exist yet.
 */
export function findTestFiles(root, testPaths) {
  const roots = (testPaths ?? []).map((p) => path.join(root, p)).filter((p) => fs.existsSync(p));
  const searchRoots = roots.length ? roots : [root];
  const found = new Set();
  for (const r of searchRoots) {
    if (fs.statSync(r).isFile()) {
      const rel = path.relative(root, r);
      if (looksLikeTest(rel)) found.add(rel);
      continue;
    }
    for (const rel of walk(r, root)) {
      if (looksLikeTest(rel)) found.add(rel);
    }
  }
  return [...found].sort();
}

/** Test files whose contents mention the given spec id. */
export function grepSpecId(root, testPaths, specId) {
  const hits = [];
  for (const rel of findTestFiles(root, testPaths)) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (text.includes(specId)) hits.push(rel);
  }
  return hits;
}
