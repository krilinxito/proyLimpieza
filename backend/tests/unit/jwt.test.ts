import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { readAuthConfig } from '../../src/config.js';
import { emitirCredenciales, verificarToken } from '../../src/utils/jwt.js';

const cfg = readAuthConfig({
  PS_JWT_SECRET_B64: 'c2VjcmV0by1kZS1wcnVlYmEtZGUtbGEtc3VpdGUtMzI',
  PS_JWT_AUDIENCE: 'lavanderia-test',
});

const EMPLEADA = {
  id: '11111111-1111-1111-1111-111111111111',
  rol: 'EMPLEADO' as const,
  sucursalId: '22222222-2222-2222-2222-222222222222',
};

/** Lee el token sin verificarlo, como haría alguien que lo intercepta. */
function contenidoDe(token: string): jwt.Jwt {
  const decodificado = jwt.decode(token, { complete: true });
  if (decodificado === null) throw new Error('el token no es un JWT');
  return decodificado;
}

describe('Tokens de sesión — SPEC-ALE186-002', () => {
  it('emite dos credenciales distintas en cada login', () => {
    const { token, tokenPowerSync } = emitirCredenciales(EMPLEADA, cfg);

    expect(token).not.toBe(tokenPowerSync);
  });

  it('firma el token de PowerSync con los bytes del secreto, en HS256 y con el kid del yaml', () => {
    const { tokenPowerSync } = emitirCredenciales(EMPLEADA, cfg);

    // Se verifica con la MISMA clave que usa PowerSync: los bytes decodificados
    // de PS_JWT_SECRET_B64, que es lo que el yaml declara como clave JWKS.
    // Si `jwt.verify` no tira, PowerSync también lo va a aceptar.
    const payload = jwt.verify(tokenPowerSync, cfg.secreto, {
      algorithms: ['HS256'],
      audience: 'lavanderia-test',
    });

    expect(typeof payload).toBe('object');
    expect(contenidoDe(tokenPowerSync).header.alg).toBe('HS256');
    expect(contenidoDe(tokenPowerSync).header.kid).toBe('lavanderia-dev');
  });

  it('pone el id del usuario en `sub`, que es lo que leen las sync rules', () => {
    const { tokenPowerSync } = emitirCredenciales(EMPLEADA, cfg);

    // `request.user_id()` de docker/powersync/sync-rules.yaml es este claim.
    // Si acá fuera cualquier otra cosa, el empleado no bajaría ninguna orden.
    expect(contenidoDe(tokenPowerSync).payload).toMatchObject({ sub: EMPLEADA.id });
  });

  it('no le manda a PowerSync el rol ni la sucursal, que no necesita', () => {
    const { tokenPowerSync } = emitirCredenciales(EMPLEADA, cfg);
    const payload = contenidoDe(tokenPowerSync).payload;

    expect(payload).not.toHaveProperty('rol');
    expect(payload).not.toHaveProperty('sucursal_id');
  });

  it('el token de la API sí lleva rol y sucursal, y vuelve como una Sesion', () => {
    const { token } = emitirCredenciales(EMPLEADA, cfg);

    expect(verificarToken(token, cfg)).toEqual(EMPLEADA);
  });

  it('acepta un ADMIN sin sucursal', () => {
    const admin = { id: '33333333-3333-3333-3333-333333333333', rol: 'ADMIN' as const, sucursalId: null };

    expect(verificarToken(emitirCredenciales(admin, cfg).token, cfg)).toEqual(admin);
  });

  it('no acepta el token de PowerSync para llamar a la API', () => {
    // Los dos están firmados con el mismo secreto: lo único que los separa es
    // la audiencia. Sin esta comprobación, el token que se le entrega a otro
    // servicio serviría para operar contra nuestros endpoints.
    const { tokenPowerSync } = emitirCredenciales(EMPLEADA, cfg);

    expect(() => verificarToken(tokenPowerSync, cfg)).toThrow(/No pudimos validar tu sesión/);
  });

  it('rechaza un token con la firma alterada', () => {
    const { token } = emitirCredenciales(EMPLEADA, cfg);
    const alterado = `${token.slice(0, -3)}xyz`;

    expect(() => verificarToken(alterado, cfg)).toThrow(/No pudimos validar tu sesión/);
  });

  it('rechaza un token firmado con otro secreto', () => {
    const otro = readAuthConfig({
      PS_JWT_SECRET_B64: Buffer.from('otro-secreto-de-32-bytes-exactos').toString('base64url'),
      PS_JWT_AUDIENCE: 'lavanderia-test',
    });

    expect(() => verificarToken(emitirCredenciales(EMPLEADA, otro).token, cfg)).toThrow();
  });

  it('distingue el token vencido, porque ahí el mensaje sí ayuda', () => {
    const vencido = emitirCredenciales(EMPLEADA, { ...cfg, expiraEn: '-1s' });

    expect(() => verificarToken(vencido.token, cfg)).toThrow(/venció/);
  });

  it('rechaza un token bien firmado cuyo contenido no es una sesión', () => {
    // Una versión vieja del backend, o alguien con el secreto pero sin saber
    // qué claims esperamos. La firma da igual: el contenido se comprueba.
    const raro = jwt.sign({ rol: 'JEFE' }, cfg.secreto, {
      algorithm: 'HS256',
      subject: EMPLEADA.id,
      audience: 'lavanderia-test-api',
      expiresIn: '1h',
    });

    expect(() => verificarToken(raro, cfg)).toThrow(/No pudimos validar tu sesión/);
  });
});
