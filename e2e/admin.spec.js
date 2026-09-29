const { test, expect } = require('@playwright/test');
const { login, activeUser } = require('./helpers');

test('o admin promove e exclui uma conta pelo painel', async ({ page, request }, testInfo) => {
  const { name } = await activeUser(request, 'caio', testInfo);
  await login(page, 'root', 'senha-forte-123');
  await expect(page).toHaveURL(/\/users$/);

  await page.goto(`/admin?search=${name}`);
  await expect(page.getByRole('heading', { name: 'Painel admin' })).toBeVisible();
  const row = () => page.getByRole('row').filter({ hasText: name });

  await row().getByRole('button', { name: 'Tornar admin' }).click();
  await expect(page.getByRole('status')).toContainText('Perfil alterado');
  await expect(row().getByRole('button', { name: 'Tornar usuário' })).toBeVisible();

  await row().getByRole('link', { name: 'Excluir' }).click();
  await expect(page.getByRole('heading', { name: 'Excluir usuário' })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir conta' }).click();
  await expect(page.getByRole('status')).toContainText('Usuário excluído');
  await expect(row()).toHaveCount(0);
});

test('usuário comum não entra no painel', async ({ page }) => {
  await login(page, 'ana', 'senha-forte-123');
  await expect(page).toHaveURL(/\/users$/);

  const res = await page.goto('/admin');

  expect(res.status()).toBe(403);
  await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
});
