const { z } = require('zod');
const { registerSchema } = require('../src/validators/auth.schemas');

const valid = { username: 'ana.maria_01', email: 'ana@example.com', password: 'senha-forte' };

// Devolve os campos com erro, ou [] quando o body é válido.
const fieldsWithErrors = (body) => {
  const result = registerSchema.safeParse(body);
  return result.success ? [] : Object.keys(z.flattenError(result.error).fieldErrors).sort();
};

describe('registerSchema', () => {
  it('aceita um body válido', () => {
    expect(fieldsWithErrors(valid)).toEqual([]);
  });

  it('remove espaços do username e normaliza o e-mail para minúsculas', () => {
    const data = registerSchema.parse({
      ...valid,
      username: '  ana  ',
      email: ' Ana@Example.COM ',
    });

    expect(data).toMatchObject({ username: 'ana', email: 'ana@example.com' });
  });

  it('descarta campos desconhecidos, como role', () => {
    const data = registerSchema.parse({ ...valid, role: 'admin', isActive: true });

    expect(data).toEqual(valid);
  });

  it('exige username, e-mail e senha', () => {
    expect(fieldsWithErrors({})).toEqual(['email', 'password', 'username']);
  });

  it.each([
    ['curto demais', 'an'],
    ['longo demais', 'a'.repeat(31)],
    ['com espaço', 'ana maria'],
    ['com acento', 'anã'],
    ['com @', 'ana@site'],
  ])('rejeita username %s', (_why, username) => {
    expect(fieldsWithErrors({ ...valid, username })).toEqual(['username']);
  });

  it.each(['sem-arroba', 'ana@', '@example.com'])('rejeita o e-mail %s', (email) => {
    expect(fieldsWithErrors({ ...valid, email })).toEqual(['email']);
  });

  it('rejeita senha com menos de 8 caracteres', () => {
    expect(fieldsWithErrors({ ...valid, password: '1234567' })).toEqual(['password']);
  });

  it('aceita senha de exatamente 72 bytes', () => {
    expect(fieldsWithErrors({ ...valid, password: 'a'.repeat(72) })).toEqual([]);
  });

  it('rejeita senha acima de 72 bytes', () => {
    expect(fieldsWithErrors({ ...valid, password: 'a'.repeat(73) })).toEqual(['password']);
  });

  // O bcrypt ignora o que passa de 72 bytes: 40 "é" são 40 caracteres mas 80 bytes.
  it('conta o limite em bytes, não em caracteres', () => {
    expect(fieldsWithErrors({ ...valid, password: 'é'.repeat(40) })).toEqual(['password']);
  });

  it.each([
    ['objeto (tentativa de injeção NoSQL)', { $gt: '' }],
    ['número', 12345678],
  ])('rejeita username do tipo %s', (_why, username) => {
    expect(fieldsWithErrors({ ...valid, username })).toEqual(['username']);
  });
});
