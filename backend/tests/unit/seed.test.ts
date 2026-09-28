import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Los dos models se reemplazan por dobles: lo que se prueba es la lógica de la
// semilla —qué crea, qué no vuelve a crear, cómo guarda la contraseña—, y eso
// no necesita una base de datos.
vi.mock('../../src/models/sucursales.model.js', () => ({
  buscarPorNombre: vi.fn(),
  crear: vi.fn(),
}));
vi.mock('../../src/models/usuarios.model.js', () => ({
  buscarPorUsername: vi.fn(),
  buscarPorId: vi.fn(),
  crear: vi.fn(),
}));

const sucursales = vi.mocked(await import('../../src/models/sucursales.model.js'));
const usuarios = vi.mocked(await import('../../src/models/usuarios.model.js'));
const { leerDatos, sembrar } = await import('../../src/db/seed.js');

const SUCURSAL = {
  id: '22222222-2222-2222-2222-222222222222',
  nombre: 'Sucursal Central',
  direccion: null,
  telefono: null,
  activa: true,
};

const ADMIN = {
  id: '33333333-3333-3333-3333-333333333333',
  nombreCompleto: 'Administrador',
  username: 'admin',
  rol: 'ADMIN' as const,
  sucursalId: null,
  activo: true,
};

const ENTORNO = { SEED_ADMIN_PASSWORD: 'una-contrasena-larga' };

describe('leerDatos de la semilla — SPEC-ALE186-002', () => {
  it('exige la contraseña por entorno y explica cómo pasarla', () => {
    // No hay contraseña por defecto a propósito: un `admin123` escrito en el
    // repositorio acabaría siendo la contraseña real de alguna instalación.
    expect(() => leerDatos({})).toThrow(/SEED_ADMIN_PASSWORD/);
    expect(() => leerDatos({})).toThrow(/npm run seed/);
  });

  it('rechaza una contraseña demasiado corta', () => {
    expect(() => leerDatos({ SEED_ADMIN_PASSWORD: 'corta' })).toThrow(/al menos 8/);
  });

  it('tiene valores por defecto para todo lo que no es secreto', () => {
    expect(leerDatos(ENTORNO)).toMatchObject({
      sucursal: 'Sucursal Central',
      username: 'admin',
      nombreCompleto: 'Administrador',
    });
  });

  it('deja cambiar el nombre de la sucursal y del administrador', () => {
    expect(
      leerDatos({ ...ENTORNO, SEED_SUCURSAL: 'Miraflores', SEED_ADMIN_USERNAME: 'wilmer' }),
    ).toMatchObject({ sucursal: 'Miraflores', username: 'wilmer' });
  });
});

describe('Semilla inicial — SPEC-ALE186-002', () => {
  beforeEach(() => {
    sucursales.buscarPorNombre.mockReset();
    sucursales.crear.mockReset();
    usuarios.crear.mockReset();
  });

  it('crea la sucursal y el admin sobre una base vacía', async () => {
    sucursales.buscarPorNombre.mockResolvedValue(null);
    sucursales.crear.mockResolvedValue(SUCURSAL);
    usuarios.crear.mockResolvedValue(ADMIN);

    const resultado = await sembrar(ENTORNO);

    expect(resultado).toEqual({
      sucursal: { nombre: 'Sucursal Central', creada: true },
      admin: { username: 'admin', creado: true },
    });
  });

  it('guarda la contraseña hasheada con bcrypt, nunca en claro', async () => {
    sucursales.buscarPorNombre.mockResolvedValue(SUCURSAL);
    usuarios.crear.mockResolvedValue(ADMIN);

    await sembrar(ENTORNO);

    const [enviado] = usuarios.crear.mock.calls[0] ?? [];
    expect(enviado?.passwordHash).not.toBe('una-contrasena-larga');
    expect(enviado?.passwordHash).toMatch(/^\$2[aby]\$/);
    // Y es el hash de ESA contraseña: un hash cualquiera pasaría la prueba de
    // arriba y dejaría a nadie poder entrar.
    expect(await bcrypt.compare('una-contrasena-larga', enviado?.passwordHash ?? '')).toBe(true);
  });

  it('crea el admin sin sucursal, porque un ADMIN es global', async () => {
    sucursales.buscarPorNombre.mockResolvedValue(SUCURSAL);
    usuarios.crear.mockResolvedValue(ADMIN);

    await sembrar(ENTORNO);

    const [enviado] = usuarios.crear.mock.calls[0] ?? [];
    expect(enviado).toMatchObject({ rol: 'ADMIN', sucursalId: null });
  });

  it('no duplica nada si se corre dos veces', async () => {
    // Segunda corrida: la sucursal ya está y el username también, así que
    // `usuarios.crear` no inserta y devuelve null (ON CONFLICT DO NOTHING).
    sucursales.buscarPorNombre.mockResolvedValue(SUCURSAL);
    usuarios.crear.mockResolvedValue(null);

    const resultado = await sembrar(ENTORNO);

    expect(sucursales.crear).not.toHaveBeenCalled();
    expect(resultado).toEqual({
      sucursal: { nombre: 'Sucursal Central', creada: false },
      admin: { username: 'admin', creado: false },
    });
  });

  it('no toca la base si la contraseña no vino', async () => {
    await expect(sembrar({})).rejects.toThrow(/SEED_ADMIN_PASSWORD/);

    expect(sucursales.buscarPorNombre).not.toHaveBeenCalled();
    expect(usuarios.crear).not.toHaveBeenCalled();
  });
});
