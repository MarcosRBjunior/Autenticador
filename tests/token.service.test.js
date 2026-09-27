const jwt = require('jsonwebtoken');
const tokenService = require('../src/services/TokenService');

const claims = { sub: '6ab96172d8ad5c88490d49d3', role: 'user', tv: 0 };
const SECRET = process.env.JWT_SECRET;

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('TokenService', () => {
  it('assina com sub, role, tv e expiração de 1 hora', () => {
    const token = tokenService.sign(claims);

    const payload = jwt.decode(token);
    expect(payload).toMatchObject(claims);
    expect(payload.exp - payload.iat).toBe(3600);
    expect(tokenService.EXPIRES_IN_SECONDS).toBe(3600);
  });

  it('usa HS256', () => {
    const token = tokenService.sign(claims);

    expect(jwt.decode(token, { complete: true }).header.alg).toBe('HS256');
  });

  it('verifica e devolve o payload de um token válido', () => {
    const payload = tokenService.verify(tokenService.sign(claims));

    expect(payload).toMatchObject(claims);
  });

  it('recusa token com a assinatura alterada', () => {
    const token = tokenService.sign(claims);
    const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');

    expect(() => tokenService.verify(tampered)).toThrow(jwt.JsonWebTokenError);
  });

  it('recusa token com o payload alterado', () => {
    const [header, , signature] = tokenService.sign(claims).split('.');
    const forged = [header, base64url({ ...claims, role: 'admin' }), signature].join('.');

    expect(() => tokenService.verify(forged)).toThrow(jwt.JsonWebTokenError);
  });

  it('recusa token sem assinatura (alg: none)', () => {
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ ...claims, role: 'admin' })}.`;

    expect(() => tokenService.verify(unsigned)).toThrow(jwt.JsonWebTokenError);
  });

  it('recusa token expirado', () => {
    const expired = jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, {
      algorithm: 'HS256',
    });

    expect(() => tokenService.verify(expired)).toThrow(jwt.TokenExpiredError);
  });

  it('recusa token assinado com outro segredo', () => {
    const other = jwt.sign(claims, 'outro-segredo-com-pelo-menos-32-caracteres', {
      algorithm: 'HS256',
    });

    expect(() => tokenService.verify(other)).toThrow(jwt.JsonWebTokenError);
  });

  it('recusa token com outro algoritmo, mesmo usando o segredo certo', () => {
    const hs512 = jwt.sign(claims, SECRET, { algorithm: 'HS512' });

    expect(() => tokenService.verify(hs512)).toThrow(jwt.JsonWebTokenError);
  });
});
