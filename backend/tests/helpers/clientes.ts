// Factory de clientes de prueba — creada en SPEC-ALE186-003.
//
// Mismo patrón que `usuarios.ts`: un cliente coherente en una línea, que el
// test retoca solo en lo que le importa.
//
//   const ana  = clienteDePrueba();
//   const otro = clienteDePrueba({ nombre: 'Luis', telefono: '71111111' });
//
// `cuerpoDeAlta` es lo que manda el dispositivo al subir un alta: el id lo
// genera él (CLAUDE.md, sección 6), así que cada llamada trae uno nuevo.
import { randomUUID } from 'node:crypto';
import type { Cliente } from '../../src/models/clientes.model.js';

export function clienteDePrueba(campos: Partial<Cliente> = {}): Cliente {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    nombre: 'Ana Quispe',
    telefono: '70123456',
    carnet: null,
    fechaRegistro: '2026-09-28 10:15:00',
    sucursalRegistroId: '22222222-2222-2222-2222-222222222222',
    ...campos,
  };
}

export function cuerpoDeAlta(campos: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: randomUUID(), nombre: 'Ana Quispe', telefono: '70123456', ...campos };
}
