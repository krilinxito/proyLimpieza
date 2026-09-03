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
