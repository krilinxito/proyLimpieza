import { execFileSync } from 'node:child_process';

function run(cmd, args, timeout = 3000) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Who is running this, and who else commits to this repo.
 *
 * `git config user.name` is the right default for a spec's owner: it is the same
 * identity that will sign the commits, so the owner field and the git history agree.
 */
/**
 * El prefijo de dev que llevan los ids de las specs que crea esta persona.
 *
 * Existe para que dos personas puedan crear una spec a la vez, en ramas distintas y sin
 * hablarlo, y no les toque el mismo id. Cada una numera su propia serie, así que la
 * colisión es imposible por construcción y no depende de que nadie recuerde hacer pull.
 *
 * Sale solo de `git config user.name`: nadie tiene que configurar nada. Como el recorte a 8
 * puede empatar dos nombres parecidos, se puede fijar a mano con
 * `git config spec-flow.prefix XXX` — config de máquina, no del repo, así que no se
 * commitea ni se le impone a nadie. Es la vía de escape, no el camino normal.
 */
export function devPrefix() {
  const limpiar = (raw) => String(raw ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  // Tiene que empezar por letra: un prefijo todo dígitos sería indistinguible del número
  // de la spec al leer un id.
  const valido = (p) => (/^[A-Z]/.test(p) ? p : '');

  return valido(limpiar(run('git', ['config', 'spec-flow.prefix'])))
    || valido(limpiar(whoami().name))
    || 'DEV';
}

export function whoami() {
  const name = run('git', ['config', 'user.name']);
  const email = run('git', ['config', 'user.email']);

  // Only reached when git has no identity configured — a network call, so it is capped.
  const ghLogin = name ? '' : run('gh', ['api', 'user', '--jq', '.login']);

  // Everyone else who has committed here: the realistic set of alternative owners.
  const authors = run('git', ['log', '--format=%aN', '-n', '300']);
  const counts = new Map();
  for (const a of authors.split('\n').map((s) => s.trim()).filter(Boolean)) {
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  counts.delete(name);
  const collaborators = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([a]) => a);

  return {
    name: name || ghLogin,
    email,
    source: name ? 'git config user.name' : ghLogin ? 'gh api user' : null,
    collaborators,
  };
}
