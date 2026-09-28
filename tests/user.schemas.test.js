const { z } = require('zod');
const {
  listUsersQuery,
  userIdParams,
  updateUserSchema,
  updateRoleSchema,
} = require('../src/validators/user.schemas');

describe('listUsersQuery', () => {
  it('usa page 1 e limit 20 por padrão', () => {
    expect(listUsersQuery.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('converte page e limit, que chegam como texto na query', () => {
    expect(listUsersQuery.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('aceita limit de até 100', () => {
    expect(listUsersQuery.parse({ limit: '100' }).limit).toBe(100);
  });

  it.each([
    ['limit acima de 100', { limit: '101' }],
    ['limit zero', { limit: '0' }],
    ['page zero', { page: '0' }],
    ['page negativa', { page: '-1' }],
    ['page que não é número', { page: 'abc' }],
    ['page fracionada', { page: '1.5' }],
    ['parâmetro repetido (vira lista)', { search: ['a', 'b'] }],
    ['busca longa demais', { search: 'a'.repeat(51) }],
  ])('recusa %s', (_why, query) => {
    expect(listUsersQuery.safeParse(query).success).toBe(false);
  });

  it('remove espaços da busca', () => {
    expect(listUsersQuery.parse({ search: '  ana ' }).search).toBe('ana');
  });

  it('descarta parâmetros desconhecidos', () => {
    expect(listUsersQuery.parse({ 'search[$regex]': '.*', sort: 'password' })).toEqual({
      page: 1,
      limit: 20,
    });
  });
});

describe('userIdParams', () => {
  it('aceita um ObjectId de 24 caracteres hexadecimais', () => {
    expect(userIdParams.parse({ id: '6ab9d3e327b44b76dd42a759' })).toEqual({
      id: '6ab9d3e327b44b76dd42a759',
    });
  });

  it.each([
    ['curto demais', '123'],
    ['com caractere fora do hexadecimal', 'zab9d3e327b44b76dd42a759'],
    // O mongoose.isValidObjectId aceita qualquer texto de 12 caracteres.
    ['de 12 caracteres', 'abcdefghijkl'],
  ])('recusa id %s', (_why, id) => {
    expect(userIdParams.safeParse({ id }).success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('aceita só o username, sem espaços nas pontas', () => {
    expect(updateUserSchema.parse({ username: '  ana.maria ' })).toEqual({ username: 'ana.maria' });
  });

  it('aceita só a senha', () => {
    expect(updateUserSchema.parse({ password: 'nova-senha-456' })).toEqual({
      password: 'nova-senha-456',
    });
  });

  it('aceita username e senha juntos', () => {
    expect(updateUserSchema.parse({ username: 'ana', password: 'nova-senha-456' })).toEqual({
      username: 'ana',
      password: 'nova-senha-456',
    });
  });

  // RN-08: role só muda pela rota dedicada. email, isActive e tokenVersion
  // também não são editáveis aqui.
  it('descarta campos fora da lista permitida', () => {
    const body = {
      username: 'ana',
      role: 'admin',
      email: 'outro@example.com',
      isActive: true,
      tokenVersion: 0,
    };

    expect(updateUserSchema.parse(body)).toEqual({ username: 'ana' });
  });

  it.each([
    ['corpo vazio', {}],
    ['só campos ignorados', { role: 'admin' }],
  ])('recusa %s, apontando os dois campos', (_why, body) => {
    const result = updateUserSchema.safeParse(body);

    expect(result.success).toBe(false);
    expect(Object.keys(z.flattenError(result.error).fieldErrors).sort()).toEqual([
      'password',
      'username',
    ]);
  });

  it.each([
    ['username curto', { username: 'ab' }],
    ['username com espaço no meio', { username: 'ana maria' }],
    ['username nulo', { username: null }],
    ['senha curta', { password: '1234567' }],
    ['senha acima de 72 bytes', { password: 'é'.repeat(37) }],
  ])('aplica as regras do registro: recusa %s', (_why, body) => {
    expect(updateUserSchema.safeParse(body).success).toBe(false);
  });
});

describe('updateRoleSchema', () => {
  it.each(['user', 'admin'])('aceita a role %s', (role) => {
    expect(updateRoleSchema.parse({ role })).toEqual({ role });
  });

  it('descarta outros campos: esta rota só muda a role', () => {
    const body = { role: 'admin', username: 'outro', password: 'nova-senha-456', isActive: true };

    expect(updateRoleSchema.parse(body)).toEqual({ role: 'admin' });
  });

  it.each([
    ['role fora do enum', { role: 'superadmin' }],
    ['role com maiúscula', { role: 'Admin' }],
    ['role nula', { role: null }],
    ['role repetida (lista)', { role: ['admin'] }],
    ['corpo sem role', {}],
  ])('recusa %s, apontando o campo role', (_why, body) => {
    const result = updateRoleSchema.safeParse(body);

    expect(result.success).toBe(false);
    expect(Object.keys(z.flattenError(result.error).fieldErrors)).toEqual(['role']);
  });
});
