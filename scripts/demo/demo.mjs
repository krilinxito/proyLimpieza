/**
 * `npm run demo` — la demo para el cliente con un solo túnel de ngrok (SPEC-KRILINXI-064).
 *
 * Compila el frontend con la dirección pública y levanta el servidor de la app compilada, que
 * reparte /api al backend y /powersync a PowerSync. Las reglas (qué dirección vale, qué se
 * reenvía) viven en `frontend/src/pwa/demo.ts`; aquí solo se corre todo en orden.
 *
 *   DEMO_URL_PUBLICA=https://mi-demo.ngrok-free.app npm run demo
 *   npm run demo -- https://mi-demo.ngrok-free.app
 *   npm run demo -- https://mi-demo.ngrok-free.app --simular   (muestra el plan, sin compilar)
 */
import { spawnSync, spawn } from 'node:child_process';
import { entornoDeLaDemo, leerDireccionPublica, DESTINOS_POR_DEFECTO } from '../../frontend/src/pwa/demo.ts';

const PUERTO = 4173;
const argumentos = process.argv.slice(2);
const simular = argumentos.includes('--simular');
const direccion = argumentos.find((a) => !a.startsWith('--')) ?? process.env.DEMO_URL_PUBLICA;

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

console.log(`\nListo. En OTRA terminal, abre el túnel con tu dominio de ngrok:\n\n    ngrok http --url=${dominio} ${PUERTO}\n`);
console.log(`Después abre ${publica} en el navegador o en el celular. Para apagar la demo, Ctrl+C aquí y en la terminal de ngrok.\n`);

const servidor = spawn('npm', ['run', 'preview', '--workspace', 'frontend', '--', '--port', String(PUERTO), '--strictPort'], {
  stdio: 'inherit',
  shell: true,
  env: entorno,
});
servidor.on('exit', (codigo) => process.exit(codigo ?? 0));
