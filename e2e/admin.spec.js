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

test('em tela estreita a tabela do painel rola na horizontal sem quebrar o conteúdo', async ({
  page,
  request,
}, testInfo) => {
  await activeUser(request, 'bia', testInfo);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'root', 'senha-forte-123');
  await expect(page).toHaveURL(/\/users$/);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Painel admin' })).toBeVisible();

  const noPageScroll = await page
    .locator('html')
    .evaluate((el) => el.scrollWidth <= el.ownerDocument.defaultView.innerWidth);
  expect(noPageScroll).toBe(true);

  const wrapScrolls = await page
    .locator('.gl-table-wrap')
    .evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(wrapScrolls).toBe(true);

  const button = page.getByRole('button', { name: 'Tornar admin' }).first();
  const singleLine = await button.evaluate((el) => {
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    return el.getBoundingClientRect().height - padding < 2 * (lineHeight || 16);
  });
  expect(singleLine).toBe(true);
});
