/**
 * `npm run demo` — la demo para el cliente con un solo túnel de ngrok (SPEC-KRILINXI-064).
 *
 * Compila el frontend con la dirección pública, levanta el servidor de la app compilada (que reparte
 * /api al backend y /powersync a PowerSync) y abre el túnel de ngrok. Las reglas (qué dirección vale,
 * qué se reenvía) viven en `frontend/src/pwa/demo.ts`; aquí solo se corre todo en orden.
 *
 *   npm run demo                         (la dirección sale de DEMO_URL_PUBLICA en el .env)
 *   DEMO_URL_PUBLICA=https://mi-demo.ngrok-free.app npm run demo
 *   npm run demo -- https://mi-demo.ngrok-free.app
 *   npm run demo -- https://mi-demo.ngrok-free.app --simular     (muestra el plan, sin compilar)
 *   npm run demo -- --sin-ngrok                                  (no abre el túnel: lo abres tú)
 *
 * ngrok tiene que estar instalado y con su authtoken puesto (CLAUDE.md §11).
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { entornoDeLaDemo, leerDireccionPublica, DESTINOS_POR_DEFECTO } from '../../frontend/src/pwa/demo.ts';

const PUERTO = 4173;
const argumentos = process.argv.slice(2);
const simular = argumentos.includes('--simular');
const sinNgrok = argumentos.includes('--sin-ngrok');

/** DEMO_URL_PUBLICA del .env de la raíz, para no tener que escribirla cada vez. */
function direccionDelEnv() {
  if (!existsSync('.env')) return undefined;
  const linea = readFileSync('.env', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('DEMO_URL_PUBLICA='));
  return linea?.slice('DEMO_URL_PUBLICA='.length).trim().replace(/^["']|["']$/g, '');
}

const direccion = argumentos.find((a) => !a.startsWith('--')) || process.env.DEMO_URL_PUBLICA || direccionDelEnv();

let publica;
try {
  publica = leerDireccionPublica(direccion);
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}

const entorno = { ...process.env, ...entornoDeLaDemo(publica), DEMO_URL_PUBLICA: publica };
const dominio = new URL(publica).hostname;

console.log(`\nDemo en ${publica}`);
console.log(`  La app se compila apuntando a ${entorno.VITE_API_URL} (API) y ${entorno.VITE_POWERSYNC_URL} (sincronización).`);
if (simular) {
  console.log(`  Simulación: no se compila ni se levanta nada. Después correría el servidor en el puerto ${PUERTO}.\n`);
  process.exit(0);
}

// ngrok se comprueba antes de compilar, para no dejar el servidor corriendo sin túnel.
if (!sinNgrok && spawnSync('ngrok', ['version'], { stdio: 'ignore' }).status !== 0) {
  console.error(
    '\nNo se encontró ngrok. Instálalo con: winget install ngrok.ngrok (cierra y abre la terminal),' +
      ' y pon tu authtoken con: ngrok config add-authtoken <TU_TOKEN>.\n' +
      'O corre npm run demo -- --sin-ngrok y abre el túnel tú.\n',
  );
  process.exit(1);
}

const compilacion = spawnSync('npm', ['run', 'build', '--workspace', 'frontend'], { stdio: 'inherit', shell: true, env: entorno });
if (compilacion.status !== 0) {
  console.error('\nNo se pudo compilar la app. Revisa el error de arriba y vuelve a correr npm run demo.\n');
  process.exit(compilacion.status ?? 1);
}

// Un aviso, no un freno: el servidor de la demo arranca igual, pero sin estos dos no hay nada que mostrar.
for (const [nombre, url, ruta] of [
  ['el servidor (backend)', DESTINOS_POR_DEFECTO.backend, '/api/health'],
  ['la sincronización (PowerSync)', DESTINOS_POR_DEFECTO.powersync, '/probes/liveness'],
]) {
  try {
    await fetch(`${url}${ruta}`, { signal: AbortSignal.timeout(2000) });
  } catch {
    console.warn(`\nAviso: ${nombre} no responde en ${url}. Levántalo antes de abrir la demo (docker compose up, y npm run dev en backend).`);
  }
}

const hijos = [];
const apagar = (codigo = 0) => {
  for (const hijo of hijos) hijo.kill();
  process.exit(codigo);
};
process.on('SIGINT', () => apagar(0));
process.on('SIGTERM', () => apagar(0));

// `vite preview` con node directo (sin npm ni shell): así Ctrl+C lo apaga de verdad, también en Windows.
const vite = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
const servidor = spawn(process.execPath, [vite, 'preview', '--port', String(PUERTO), '--strictPort'], {
  cwd: 'frontend',
  stdio: 'inherit',
  env: entorno,
});
hijos.push(servidor);
servidor.on('exit', (codigo) => apagar(codigo ?? 0));

if (sinNgrok) {
  console.log(`\nListo. En OTRA terminal, abre el túnel con tu dominio de ngrok:\n\n    ngrok http --url=${dominio} ${PUERTO}\n`);
} else {
  const tunel = spawn('ngrok', ['http', `--url=${dominio}`, String(PUERTO), '--log=stdout'], { stdio: 'inherit' });
  hijos.push(tunel);
  tunel.on('exit', (codigo) => {
    console.error('\nngrok se cerró. Si fue por un error, mira el mensaje de arriba (lo más común: falta el authtoken o el dominio no es tuyo).');
    apagar(codigo ?? 1);
  });
}
console.log(`\nAbre ${publica} en el navegador o en el celular. Para apagar la demo, Ctrl+C.\n`);
