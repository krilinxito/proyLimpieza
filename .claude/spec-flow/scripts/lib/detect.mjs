import fs from 'node:fs';
import path from 'node:path';

const read = (root, f) => {
  try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return null; }
};
const exists = (root, f) => fs.existsSync(path.join(root, f));

/**
 * Work out how this project runs its tests.
 *
 * Returns { command, framework, reason, confident }. `confident: false` means we
 * are guessing and the skill should confirm with the user before running anything.
 */
export function detectTestCommand(cfg) {
  const root = cfg.__root;

  if (cfg.test_command) {
    return {
      command: cfg.test_command,
      framework: 'configurado a mano',
      reason: 'test_command definido en .spec-flow.json',
      confident: true,
    };
  }

  const pkgRaw = read(root, 'package.json');
  if (pkgRaw) {
    let pkg = {};
    try { pkg = JSON.parse(pkgRaw); } catch { /* malformed package.json — fall through */ }
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const script = pkg.scripts?.test;
    const runner = exists(root, 'pnpm-lock.yaml') ? 'pnpm'
      : exists(root, 'yarn.lock') ? 'yarn'
      : exists(root, 'bun.lockb') ? 'bun'
      : 'npm';
    const viaScript = runner === 'npm' ? 'npm test' : `${runner} test`;

    for (const [dep, name] of [['jest', 'jest'], ['vitest', 'vitest'], ['mocha', 'mocha'], ['@playwright/test', 'playwright'], ['ava', 'ava']]) {
      if (deps[dep]) {
        const isPlaceholder = !script || /no test specified/i.test(script);
        return {
          command: isPlaceholder ? `npx ${dep === '@playwright/test' ? 'playwright test' : dep}` : viaScript,
          framework: name,
          reason: `${dep} está en las dependencias de package.json`,
          confident: true,
        };
      }
    }
    if (script && !/no test specified/i.test(script)) {
      return { command: viaScript, framework: 'script npm', reason: `package.json define scripts.test = "${script}"`, confident: true };
    }
  }

  if (exists(root, 'pytest.ini') || exists(root, 'tox.ini')
      || (read(root, 'pyproject.toml') ?? '').includes('pytest')
      || (read(root, 'setup.cfg') ?? '').includes('[tool:pytest]')) {
    return { command: 'pytest', framework: 'pytest', reason: 'configuración de pytest en el repo', confident: true };
  }

  if ((read(root, 'Gemfile') ?? '').includes('rspec') || exists(root, '.rspec')) {
    return { command: 'bundle exec rspec', framework: 'rspec', reason: 'rspec declarado en Gemfile/.rspec', confident: true };
  }

  if (exists(root, 'go.mod')) {
    return { command: 'go test ./...', framework: 'go test', reason: 'go.mod en la raíz', confident: true };
  }

  if (exists(root, 'Cargo.toml')) {
    return { command: 'cargo test', framework: 'cargo test', reason: 'Cargo.toml en la raíz', confident: true };
  }

  if ((read(root, 'composer.json') ?? '').includes('phpunit') || exists(root, 'phpunit.xml') || exists(root, 'phpunit.xml.dist')) {
    return { command: './vendor/bin/phpunit', framework: 'phpunit', reason: 'phpunit declarado en composer.json/phpunit.xml', confident: true };
  }

  const makefile = read(root, 'Makefile');
  if (makefile && /^test:/m.test(makefile)) {
    return { command: 'make test', framework: 'make', reason: 'el Makefile define un target "test"', confident: true };
  }

  // Python projects often ship tests with no config file at all.
  if (exists(root, 'tests') && (exists(root, 'requirements.txt') || exists(root, 'pyproject.toml') || exists(root, 'setup.py'))) {
    return { command: 'pytest', framework: 'pytest (supuesto)', reason: 'hay tests/ y el proyecto es Python, pero no encontré config de pytest', confident: false };
  }

  return {
    command: null,
    framework: null,
    reason: 'no reconocí ningún framework de testing en este repo',
    confident: false,
  };
}
