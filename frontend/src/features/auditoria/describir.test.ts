import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { paginaDePrueba, registroDePrueba, ROSA_CLIENTE, SUCURSAL_CENTRO } from '../../test/auditoriaDePrueba';
import { leerPagina } from './api/auditoriaApi';
import { antes, cuando, queHizo, sobreQue, textoRevision } from './describir';
import { FILTRO_INICIAL, parametrosAuditoria } from './filtro';
import { ACCIONES, TABLAS, type RegistroAuditoria } from './types';

const NOMBRES = {
  clientes: new Map([[ROSA_CLIENTE, 'Rosa Quispe']]),
  cuentas: new Map<string, string>(),
  sucursales: new Map([[SUCURSAL_CENTRO, 'Centro']]),
};

/** Un registro ya leído, como lo usa la pantalla. */
function registro(cambios: Record<string, unknown> = {}): RegistroAuditoria {
  const leida = leerPagina(paginaDePrueba([registroDePrueba(cambios)]));
  if (!leida?.registros[0]) throw new Error('El registro de prueba no cumple el contrato.');
  return leida.registros[0];
}

describe('Auditoría: qué hizo, en palabras — SPEC-KRILINXI-018', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['registrar ropa', { accion: 'CREAR', tablaAfectada: 'ordenes' }, 'Registró ropa'],
    ['cobrar', { accion: 'COBRAR', tablaAfectada: 'pagos' }, 'Cobró'],
    ['entregar', { accion: 'ENTREGAR', tablaAfectada: 'entregas' }, 'Entregó ropa'],
    ['entrar', { accion: 'LOGIN', tablaAfectada: 'usuarios' }, 'Entró al sistema'],
    ['dar de alta un cliente', { accion: 'CREAR', tablaAfectada: 'clientes' }, 'Dio de alta un cliente'],
    ['avanzar o anular', { accion: 'EDITAR', tablaAfectada: 'ordenes', valoresAnteriores: { estado: 'RECIBIDO' } }, 'Cambió el estado de una boleta'],
    ['dar de baja', { accion: 'EDITAR', tablaAfectada: 'usuarios', valoresAnteriores: { activo: true } }, 'Dio de baja una cuenta'],
    ['cerrar una sucursal', { accion: 'EDITAR', tablaAfectada: 'sucursales', valoresAnteriores: { activa: true } }, 'Cerró una sucursal'],
    ['volver a abrirla', { accion: 'EDITAR', tablaAfectada: 'sucursales', valoresAnteriores: { activa: false } }, 'Volvió a abrir una sucursal'],
  ])('%s', (_caso, cambios, esperado) => {
    expect(queHizo(registro(cambios))).toBe(esperado);
  });

  it('nombra lo que la tablet conoce (un cliente) y no inventa lo que no (una boleta)', () => {
    expect(sobreQue(registro({ accion: 'CREAR', tablaAfectada: 'clientes', registroId: ROSA_CLIENTE }), NOMBRES)).toBe('Rosa Quispe');
    expect(sobreQue(registro({ accion: 'CREAR', tablaAfectada: 'ordenes' }), NOMBRES)).toBeNull();
  });
});

describe('Auditoría: cuándo y qué había antes — SPEC-KRILINXI-018', () => {
  it('dice cuándo llegó solo si es distinto de cuándo pasó', () => {
    expect(cuando(registro())).toEqual({ paso: '15/10/2026 18:30', llego: null });
    expect(cuando(registro({ fechaDelHecho: '2026-10-15 10:00:00', fecha: '2026-10-15 15:20:00' }))).toEqual({
      paso: '15/10/2026 10:00',
      llego: '15/10/2026 15:20',
    });
  });

  it('muestra los valores anteriores en palabras, y de la contraseña solo que cambió', () => {
    const edicion = registro({
      accion: 'EDITAR',
      tablaAfectada: 'usuarios',
      valoresAnteriores: { nombre_completo: 'Rosa Q.', sucursal_id: SUCURSAL_CENTRO, contrasena_cambiada: true },
    });
    expect(antes(edicion, NOMBRES)).toEqual(['Nombre antes: Rosa Q.', 'Sucursal antes: Centro', 'Le cambió la contraseña']);
  });

  it('un estado y un precio se dicen como en el mostrador', () => {
    const edicion = registro({ accion: 'EDITAR', valoresAnteriores: { estado: 'LISTO', precio_total: '50.00' } });
    expect(antes(edicion, NOMBRES)).toEqual(['Estado antes: Listo para retirar', 'Precio antes: Bs 50,00']);
  });

  it('la marca de revisión se dice en palabras', () => {
    expect(textoRevision('cuenta_dada_de_baja')).toBe('Para revisar: lo hizo una cuenta que ya estaba dada de baja.');
    expect(textoRevision(null)).toBeNull();
  });
});

describe('Auditoría: el contrato y el filtro — SPEC-KRILINXI-018', () => {
  it('rechaza una página con un registro roto, entera', () => {
    expect(leerPagina(paginaDePrueba([registroDePrueba(), registroDePrueba({ accion: 'BORRAR_TODO' })]))).toBeNull();
    expect(leerPagina(paginaDePrueba([registroDePrueba({ usuario: { id: 'x' } })]))).toBeNull();
  });

  it('las acciones y las tablas son las mismas que en el backend', () => {
    const raiz = resolve(import.meta.dirname, '../../../../backend/src');
    const dominio = readFileSync(resolve(raiz, 'utils/dominio.ts'), 'utf8');
    const modelo = readFileSync(resolve(raiz, 'models/auditoria.model.ts'), 'utf8');
    const lista = (fuente: string, nombre: string) =>
      [...(new RegExp(`${nombre} = \\[([^\\]]*)\\]`).exec(fuente)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(lista(dominio, 'ACCIONES_AUDITORIA')).toEqual([...ACCIONES]);
    expect(lista(modelo, 'TABLAS_AUDITADAS')).toEqual([...TABLAS]);
  });

  it('sin elegir nada pide los últimos 30 días; cada filtro puesto va como parámetro', () => {
    expect(parametrosAuditoria(FILTRO_INICIAL, '2026-10-16')).toEqual({ desde: '2026-09-17', hasta: '2026-10-16' });
    expect(
      parametrosAuditoria(
        { fechas: { desde: '2026-10-01', hasta: '2026-10-15' }, usuarioId: 'u', sucursalId: 's', que: 'boletas', soloParaRevisar: true },
        '2026-10-16',
      ),
    ).toEqual({ desde: '2026-10-01', hasta: '2026-10-15', usuario_id: 'u', sucursal_id: 's', accion: 'EDITAR', tabla: 'ordenes', revisar: 'true' });
  });
});
