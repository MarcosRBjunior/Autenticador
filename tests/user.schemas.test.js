const { listUsersQuery, userIdParams } = require('../src/validators/user.schemas');

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
