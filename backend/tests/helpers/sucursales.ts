// Factory de sucursales de prueba — creada en SPEC-ALE186-011.
//
// Mismo patrón que `clientes.ts` y `usuarios.ts`: una sucursal coherente en una
// línea, que el test retoca solo en lo que le importa.
//
//   const central = sucursalDePrueba();
//   const cerrada = sucursalDePrueba({ activa: false });
//
// `cuerpoDeSucursal` es lo que manda la pantalla del admin al dar de alta: el id
// lo genera el cliente (CLAUDE.md, sección 6), así que cada llamada trae uno
// nuevo, y el nombre lleva un sufijo único para no chocar con la regla de
// "nombre único" cuando los tests corren contra la base real.
import { randomUUID } from 'node:crypto';
import type { Sucursal } from '../../src/models/sucursales.model.js';

export function sucursalDePrueba(campos: Partial<Sucursal> = {}): Sucursal {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    nombre: 'Central',
    direccion: null,
    telefono: null,
    activa: true,
    ...campos,
  };
}

export function cuerpoDeSucursal(campos: Record<string, unknown> = {}): Record<string, unknown> {
  const id = randomUUID();
  return { id, nombre: `Sucursal Norte ${id.slice(0, 8)}`, direccion: 'Av. Banzer 123', ...campos };
}
