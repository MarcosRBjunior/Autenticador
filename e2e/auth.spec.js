const { test, expect } = require('@playwright/test');

async function login(page, username, password) {
  await page.goto('/login');
  await page.getByLabel('Usuário ou e-mail').fill(username);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('login, lista de usuários e saída', async ({ page }) => {
  await login(page, 'ana', 'senha-forte-123');

  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'ana' })).toBeVisible();

  await page.getByRole('link', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
});

test('cadastro, ativação pelo link e login', async ({ page, request }) => {
  // Único por tentativa: o retry do CI roda no mesmo servidor e mesmo banco.
  const name = `bia${test.info().retry}${Date.now()}`;
  const email = `${name}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-456');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('senha-forte-456');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(page.getByRole('status')).toContainText('link de ativação');

  let token = null;
  await expect
    .poll(async () => {
      ({ token } = await (
        await request.get(`/__e2e/last-activation-token?email=${encodeURIComponent(email)}`)
      ).json());
      return token;
    })
    .toBeTruthy();

  await page.goto(`/activate?token=${token}`);
  await page.getByRole('button', { name: 'Ativar minha conta' }).click();
  await expect(page).toHaveURL(/\/login\?activated=1$/);

  await login(page, name, 'senha-forte-456');
  await expect(page).toHaveURL(/\/users$/);
});

test('o olho mostra e esconde a senha', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByLabel('Senha', { exact: true });
  await password.fill('segredo');

  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(password).toHaveAttribute('type', 'text');

  await page.getByRole('button', { name: 'Ocultar senha' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});
