import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Los textos de la app van en tuteo neutro, no en voseo — SPEC-KRILINXI-053. La gente que usa el sistema es boliviana y
// "Elegí" o "Probá" les suena ajeno. Este test recorre el código fuente del backend y del frontend (sin los tests) y
// falla si encuentra una forma de voseo de la lista. Lee archivos desde la raíz, como `versionesDelEntorno.test.ts`:
// una sola lista para los dos lados, así los mensajes de la API y los de la pantalla no se desfasan.
const RAIZ = resolve(import.meta.dirname, '../../..');
const CARPETAS = ['backend/src', 'frontend/src'];

// Formas que solo existen en voseo (o que, con el pronombre pegado, no son tuteo). Las que coinciden con el tuteo
// ("estás", "fíjate") no van: serían falsos positivos.
const VOSEO = [
  'escribí', 'elegí', 'probá', 'volvé', 'revisá', 'tocá', 'podés', 'necesitás', 'esperá', 'usá', 'indicá', 'corregí',
  'copiá', 'cerrá', 'verificá', 'tomá', 'subí', 'sembrá', 'salís', 'registrá', 'querés', 'probás', 'pasá', 'leé', 'hacé',
  'guardá', 'generá', 'descartá', 'dejá', 'completá', 'buscá', 'avisá', 'vos', 'tenés', 'sabés', 'mirá', 'tené', 'intentá',
  'anotá', 'confirmá', 'llená', 'ingresá', 'seleccioná', 'agregá', 'cargá', 'quitá', 'mandá', 'cambiá', 'apretá',
  'contactá', 'consultá', 'abrí', 'recordá', 'aguardá', 'reintentá', 'actualizá',
  'pedile', 'revisalo', 'revisalas', 'revisala', 'avisale', 'elegila', 'elegilo', 'descartalo', 'descartala', 'aplicalas',
  'aplicala', 'pasala', 'volvelo', 'escribilo', 'escribila', 'probalo', 'guardala', 'guardalo', 'mandala', 'buscalo',
  'correlo', 'dejala', 'dejalo', 'envolvela', 'llamala', 'ponelo', 'renombralo', 'usala', 'usalo',
];

const LETRAS = '\\p{L}\\p{N}_';
const BUSCAR = new RegExp(`(?<![${LETRAS}])(${VOSEO.join('|')})(?![${LETRAS}])`, 'giu');

/** Las formas de voseo que aparecen en un texto, en minúscula y sin repetir. */
const voseoEn = (texto: string) => [...new Set([...texto.matchAll(BUSCAR)].map((m) => m[1]?.toLowerCase() ?? ''))];

function* codigo(carpeta: string): Generator<string> {
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === 'dist') continue;
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) yield* codigo(ruta);
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) yield ruta;
  }
}

describe('Textos en tuteo neutro — SPEC-KRILINXI-053', () => {
  it('el detector reconoce el voseo, con mayúscula y con el pronombre pegado, y no se confunde con el tuteo', () => {
    expect(voseoEn('Elegí una sucursal. Probá de nuevo y avisale al encargado.')).toEqual(['elegí', 'probá', 'avisale']);
    expect(voseoEn('Elige una sucursal. Prueba de nuevo y avísale al encargado.')).toEqual([]);
    // Dentro de otra palabra no cuenta.
    expect(voseoEn('Servosistema')).toEqual([]);
  });

  it.each(CARPETAS)('ningún archivo de %s (sin tests) usa voseo', (carpeta) => {
    const con = [...codigo(resolve(RAIZ, carpeta))]
      .map((ruta) => ({ ruta: ruta.slice(RAIZ.length + 1), formas: voseoEn(readFileSync(ruta, 'utf8')) }))
      .filter((a) => a.formas.length > 0);

    expect(con).toEqual([]);
  });
});
