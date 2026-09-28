const userRepository = require('../src/repositories/UserRepository');
const authTokenRepository = require('../src/repositories/AuthTokenRepository');
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

describe('UserService.getProfile', () => {
  // Outra requisição excluiu o usuário entre o guard e a leitura do perfil.
  it('responde 404 quando o usuário some depois de autenticado', async () => {
    jest.spyOn(userRepository, 'findById').mockResolvedValue(null);

    await expect(
      userService.getProfile({ id: '6ab9d3e327b44b76dd42a759', role: 'user' }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('UserService.changeRole', () => {
  // Outra requisição excluiu o usuário entre a leitura e a atualização.
  it('responde 404 quando o usuário some antes de ser atualizado', async () => {
    jest.spyOn(userRepository, 'findById').mockResolvedValue({ role: 'user' });
    jest.spyOn(userRepository, 'update').mockResolvedValue(null);

    const attempt = userService.changeRole({ role: 'admin' }, '6ab9d3e327b44b76dd42a759', 'admin');

    await expect(attempt).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('UserService.deleteUser', () => {
  // Outra requisição excluiu o usuário entre a leitura e a exclusão.
  it('responde 404 quando o usuário some antes de ser excluído', async () => {
    jest.spyOn(userRepository, 'findById').mockResolvedValue({ role: 'user' });
    jest.spyOn(userRepository, 'delete').mockResolvedValue(false);
    jest.spyOn(authTokenRepository, 'deleteByUserId').mockResolvedValue(0);

    await expect(userService.deleteUser('6ab9d3e327b44b76dd42a759')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});
