// Genera los íconos de la app (la lavadora, en el turquesa de la marca) — SPEC-KRILINXI-059.
//
//   node frontend/scripts/generar-iconos.mjs        (desde la raíz del repo)
//
// Escribe `frontend/public/icono-192.png`, `icono-512.png` e `icono-maskable-512.png`. Sin librerías: dibuja con distancias a figuras
// simples y suaviza los bordes tomando 4×4 muestras por píxel, y arma el PNG con `zlib`. Está en el repo para que, cuando cambie
// el color de la marca, los íconos se vuelvan a hacer con un comando en vez de a mano. El color sale de `src/index.css`
// (`--color-marca`), no de acá: así no se desfasan (lo vigila `src/pwa/iconos.test.ts`).
//
// El ícono "maskable" es el mismo dibujo, más chico y rodeado de marca hasta el borde: Android lo recorta con la forma que
// prefiera (círculo, cuadrado redondeado…) y lo que importa tiene que quedar dentro de la "zona segura", un círculo del 80% del lado.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PUBLICO = resolve(AQUI, '../public');
const CSS = readFileSync(resolve(AQUI, '../src/index.css'), 'utf8');

/** `--color-marca` del tema claro (el primer bloque), como [r, g, b]. */
function colorDeLaMarca() {
  const hex = /--color-marca:\s*(#[0-9a-fA-F]{6})/.exec(CSS)?.[1];
  if (!hex) throw new Error('No encuentro --color-marca en src/index.css');
  return aRgb(hex);
}
function aRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const MARCA = colorDeLaMarca();
const BLANCO = [255, 255, 255];
// El agua del tambor: el mismo celeste-turquesa suave que `marca-suave` en oscuro (`--color-marca-fuerte` oscuro).
const AGUA = aRgb('#99f6e4');

/** ¿Está el punto dentro de un rectángulo de esquinas redondeadas? (centro, mitad del ancho/alto, radio) */
function enRectRedondeado(x, y, cx, cy, mitad, radio) {
  const dx = Math.abs(x - cx) - (mitad - radio);
  const dy = Math.abs(y - cy) - (mitad - radio);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) <= radio;
}
const enCirculo = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) <= r;

/** El color del dibujo en un punto del cuadrado unidad (0 a 1). */
function colorEn(x, y) {
  // La carcasa: blanca, con dos botones de la marca arriba.
  if (!enRectRedondeado(x, y, 0.5, 0.5, 0.36, 0.07)) return MARCA;
  if (enCirculo(x, y, 0.238, 0.227, 0.027) || enCirculo(x, y, 0.342, 0.227, 0.027)) return MARCA;
  // La puerta: un aro de la marca, y adentro el agua arriba y la marca abajo.
  if (enCirculo(x, y, 0.5, 0.5625, 0.18)) return y < 0.586 ? AGUA : MARCA;
  if (enCirculo(x, y, 0.5, 0.5625, 0.23)) return MARCA;
  return BLANCO;
}

/** Los píxeles de un ícono de `lado` px; `escala` achica el dibujo hacia el centro (1 = completo). */
function dibujar(lado, escala) {
  const MUESTRAS = 4;
  const filas = [];
  for (let py = 0; py < lado; py++) {
    const fila = Buffer.alloc(1 + lado * 3); // el 0 del principio es el filtro "ninguno" de PNG
    for (let px = 0; px < lado; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < MUESTRAS; sy++) {
        for (let sx = 0; sx < MUESTRAS; sx++) {
          const x = (px + (sx + 0.5) / MUESTRAS) / lado;
          const y = (py + (sy + 0.5) / MUESTRAS) / lado;
          const [cr, cg, cb] = colorEn((x - 0.5) / escala + 0.5, (y - 0.5) / escala + 0.5);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const n = MUESTRAS * MUESTRAS;
      fila[1 + px * 3] = Math.round(r / n);
      fila[2 + px * 3] = Math.round(g / n);
      fila[3 + px * 3] = Math.round(b / n);
    }
    filas.push(fila);
  }
  return Buffer.concat(filas);
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const control = Buffer.alloc(4);
  control.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, control]);
}

function png(lado, escala) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8; // 8 bits por canal
  cabecera[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(dibujar(lado, escala), { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(PUBLICO, { recursive: true });
// El maskable al 74%: las esquinas de la carcasa quedan dentro de la zona segura (el círculo del 80% del lado).
for (const [archivo, lado, escala] of [
  ['icono-192.png', 192, 1],
  ['icono-512.png', 512, 1],
  ['icono-maskable-512.png', 512, 0.74],
]) {
  writeFileSync(resolve(PUBLICO, archivo), png(lado, escala));
  console.log(`${archivo}: ${lado}×${lado}`);
}
