const userRepository = require('../src/repositories/UserRepository');
const userService = require('../src/services/UserService');

afterEach(() => jest.restoreAllMocks());

describe('UserService', () => {
  // O banco só aceita user/admin, mas se um perfil novo surgir sem projeção
  // definida, ele não pode herdar a visão de admin por engano.
  it('usa a visão mais restrita para um perfil desconhecido', async () => {
    const list = jest.spyOn(userRepository, 'list').mockResolvedValue({ data: [] });

    await userService.listUsers({ role: 'moderador' }, { page: 1, limit: 20 });

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ fields: 'username createdAt' }));
  });
});
