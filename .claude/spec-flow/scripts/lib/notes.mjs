/**
 * Bitácoras: la explicación que /spec-code deja por escrito de lo que implementó, pensada
 * para que alguien que empieza entienda la lógica y la arquitectura leyéndola.
 *
 * Una por spec y en su propio archivo, a propósito: dos personas en ramas distintas nunca
 * escriben en el mismo, así que la bitácora no genera conflictos de merge.
 *
 * El campo `explica:` de su frontmatter declara qué conceptos cubre. De ahí sale el índice
 * que permite explicar cada fundamento UNA vez en todo el proyecto y referenciarlo después.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse, setList } from './frontmatter.mjs';
import { notesDir } from './config.mjs';

/** Ruta absoluta de la bitácora de una spec. No comprueba que exista. */
export function notesPath(cfg, spec) {
  return path.join(notesDir(cfg), `${spec.id}-${spec.slug}.md`);
}

/** La misma ruta, relativa a la raíz del repo: es la que se le enseña a una persona. */
export function notesRelPath(cfg, spec) {
  return path.relative(cfg.__root, notesPath(cfg, spec));
}

export function noteExists(cfg, spec) {
  return fs.existsSync(notesPath(cfg, spec));
}

/** El cuerpo de la bitácora, sin frontmatter. '' si todavía no hay bitácora. */
export function noteBody(cfg, spec) {
  const file = notesPath(cfg, spec);
  if (!fs.existsSync(file)) return '';
  return parse(fs.readFileSync(file, 'utf8')).body.trim();
}

/**
 * Qué concepto explicó qué spec. Recorre las bitácoras y lee su `explica:`.
 *
 * Si dos bitácoras declaran el mismo concepto —dos ramas en paralelo que lo explicaron cada
 * una por su lado— gana la de id más bajo y la otra sale en `duplicados`, para que se vea
 * en vez de quedar enterrada.
 */
export function conceptIndex(cfg) {
  const dir = notesDir(cfg);
  const conceptos = {};
  const duplicados = [];
  if (!fs.existsSync(dir)) return { conceptos, duplicados };

  const notas = fs.readdirSync(dir)
    .filter((f) => /^SPEC-\d+.*\.md$/i.test(f))
    .sort();

  for (const f of notas) {
    const file = path.join(dir, f);
    const { data } = parse(fs.readFileSync(file, 'utf8'));
    const id = data.id ?? f.match(/^(SPEC-\d+)/i)?.[1] ?? f;
    const nota = path.relative(cfg.__root, file);
    for (const raw of Array.isArray(data.explica) ? data.explica : []) {
      const concepto = String(raw).trim();
      if (!concepto) continue;
      if (concepto in conceptos) duplicados.push({ concepto, spec: id, nota });
      else conceptos[concepto] = { spec: id, nota };
    }
  }
  return { conceptos, duplicados };
}

/**
 * Reescribe `explica:` en la bitácora. Lo hace el motor y no el modelo porque de ese campo
 * depende el índice: un formato torcido rompe el "no repitas lo ya explicado" en silencio.
 */
export function setConcepts(cfg, spec, conceptos) {
  const file = notesPath(cfg, spec);
  if (!fs.existsSync(file)) {
    throw new Error(`todavía no hay bitácora en ${notesRelPath(cfg, spec)} — escríbela antes`);
  }
  const unique = [...new Set(conceptos.map((c) => String(c).trim()).filter(Boolean))].sort();
  fs.writeFileSync(file, setList(fs.readFileSync(file, 'utf8'), 'explica', unique), 'utf8');
  return { id: spec.id, nota: notesRelPath(cfg, spec), explica: unique };
}
