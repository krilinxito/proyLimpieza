import { describe, expect, it } from 'vitest';
import { normalizarTelefono } from './telefono';

describe('Teléfono normalizado como en el backend — SPEC-KRILINXI-005', () => {
  // Son los mismos casos que `backend/tests/unit/validacion.test.ts`, copiados a propósito:
  // los dos lados tienen que dar el mismo resultado, o la búsqueda local no encuentra lo que
  // el servidor guardó. Si un día cambia la regla, este test y el del backend cambian juntos.
  it.each([
    ['con guion', '7012-3456', '70123456'],
    ['con espacios', '701 23 456', '70123456'],
    ['con paréntesis y prefijo', '(+591) 70123456', '59170123456'],
    ['ya limpio', '70123456', '70123456'],
    ['sin ningún dígito', 'sin teléfono', ''],
  ])('normaliza el teléfono %s', (_caso, entrada, esperado) => {
    expect(normalizarTelefono(entrada)).toBe(esperado);
  });
});
