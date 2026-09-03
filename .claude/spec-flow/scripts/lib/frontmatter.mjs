/**
 * Minimal YAML frontmatter reader/writer for the spec format.
 *
 * Deliberately NOT a general YAML implementation: it handles exactly the shape
 * specs use (top-level scalars plus block or inline lists of scalars). Writes are
 * surgical line edits so everything we do not understand survives untouched.
 */

const FENCE = /^---[ \t]*$/;

export function splitDocument(text) {
  const lines = text.split('\n');
  if (!FENCE.test(lines[0] ?? '')) {
    return { hasFrontmatter: false, fmLines: [], bodyLines: lines, start: -1, end: -1 };
  }
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      return {
        hasFrontmatter: true,
        fmLines: lines.slice(1, i),
        bodyLines: lines.slice(i + 1),
        start: 0,
        end: i,
      };
    }
  }
  return { hasFrontmatter: false, fmLines: [], bodyLines: lines, start: -1, end: -1 };
}

function unquote(raw) {
  const s = raw.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    const inner = s.slice(1, -1);
    return s[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'");
  }
  return s;
}

function parseInlineList(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  // Split on commas that are not inside quotes.
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      cur += ch;
      quote = ch;
    } else if (ch === ',') {
      out.push(unquote(cur));
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(unquote(cur));
  return out;
}

/** Parse frontmatter into a plain object. Missing frontmatter yields {}. */
export function parse(text) {
  const { hasFrontmatter, fmLines, bodyLines } = splitDocument(text);
  const data = {};
  if (!hasFrontmatter) return { data, body: bodyLines.join('\n'), hasFrontmatter };

  let currentKey = null;
  for (const line of fmLines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const item = line.match(/^[ \t]+-[ \t]*(.*)$/);
    if (item && currentKey) {
      const val = item[1].trim();
      if (val) data[currentKey].push(unquote(val));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
    if (!kv) continue;
    const [, key, rest] = kv;
    const raw = rest.trim();
    if (raw === '') {
      data[key] = [];          // block list (or an empty value) — items may follow
      currentKey = key;
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      data[key] = parseInlineList(raw);
      currentKey = null;
    } else {
      data[key] = unquote(raw);
      currentKey = null;
    }
  }
  return { data, body: bodyLines.join('\n'), hasFrontmatter };
}

/** Quote a scalar only when plain YAML would misread it. */
export function yamlScalar(value) {
  const s = String(value ?? '');
  if (s === '') return "''";
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /:\s/.test(s) || /\s#/.test(s) || /[\n\r]/.test(s)) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}

function listLines(key, items) {
  if (!items || items.length === 0) return [`${key}: []`];
  return [`${key}:`, ...items.map((i) => `  - ${yamlScalar(i)}`)];
}

/** Line span a key occupies inside the frontmatter (including its block-list items). */
function keySpan(fmLines, key) {
  const re = new RegExp(`^${key}:`);
  const start = fmLines.findIndex((l) => re.test(l));
  if (start === -1) return null;
  let end = start;
  for (let i = start + 1; i < fmLines.length; i++) {
    if (/^[ \t]+-/.test(fmLines[i]) || /^[ \t]+\S/.test(fmLines[i])) end = i;
    else break;
  }
  return { start, end };
}

function rewrite(text, key, replacementLines) {
  const { hasFrontmatter, fmLines, bodyLines, end } = splitDocument(text);
  if (!hasFrontmatter) throw new Error('file has no YAML frontmatter');

  const span = keySpan(fmLines, key);
  const next = [...fmLines];
  if (span) next.splice(span.start, span.end - span.start + 1, ...replacementLines);
  else next.push(...replacementLines);

  const trailingNewline = text.endsWith('\n');
  const out = ['---', ...next, '---', ...bodyLines].join('\n');
  return trailingNewline && !out.endsWith('\n') ? `${out}\n` : out;
}

/** Replace a scalar field, preserving every other byte of the file. */
export function setScalar(text, key, value) {
  return rewrite(text, key, [`${key}: ${yamlScalar(value)}`]);
}

/** Replace a list field, preserving every other byte of the file. */
export function setList(text, key, items) {
  return rewrite(text, key, listLines(key, items));
}

/** Build a complete frontmatter block from an ordered object. */
export function serialize(data, order) {
  const keys = order ?? Object.keys(data);
  const lines = [];
  for (const key of keys) {
    if (!(key in data)) continue;
    const value = data[key];
    if (Array.isArray(value)) lines.push(...listLines(key, value));
    else lines.push(`${key}: ${yamlScalar(value)}`);
  }
  return ['---', ...lines, '---'].join('\n');
}
