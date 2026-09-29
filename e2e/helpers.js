const { expect } = require('@playwright/test');

async function login(page, username, password) {
  await page.goto('/login');
  await page.getByLabel('Usuário ou e-mail').fill(username);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

// Conta nova e ativa, única por tentativa: o retry do CI roda no mesmo
// servidor e no mesmo banco.
async function activeUser(request, prefix, testInfo) {
  const name = `${prefix}${testInfo.retry}${Date.now()}`;
  const email = `${name}@example.com`;
  const created = await request.post('/api/v1/register', {
    data: { username: name, email, password: 'senha-forte-789' },
  });
  expect(created.status()).toBe(201);

  let token = null;
  await expect
    .poll(async () => {
      const res = await request.get(
        `/__e2e/last-activation-token?email=${encodeURIComponent(email)}`,
      );
      ({ token } = await res.json());
      return token;
    })
    .toBeTruthy();
  const activated = await request.post('/api/v1/auth/activate', { data: { token } });
  expect(activated.status()).toBe(200);

  return { name, email };
}

module.exports = { login, activeUser };
