/**
 * Normalización de texto compartida. Vive aparte de specs.mjs porque notes.mjs también la
 * necesita, y specs.mjs ya importa notes.mjs: dejarla allí crearía un ciclo de imports.
 */

export function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'spec';
}
