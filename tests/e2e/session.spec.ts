import { test, expect } from '@playwright/test';
const token = 'fixture-browser-operator-token-at-least-32';

test('operator sign-in, rejection, logout and browser back keep protected UI gated', async ({
  page,
}) => {
  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: 'Sign in to Actual Assist' })).toBeVisible();
  await page.getByLabel('Operator credential').fill('wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-in failed');
  await page.getByLabel('Operator credential').fill(token);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Signed in as fixture-operator')).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'actual_assist_session')).toMatchObject({
    httpOnly: true,
    sameSite: 'Strict',
    path: '/api',
  });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(token);
  expect(page.url()).not.toContain(token);
  await page.reload();
  await expect(page.getByText('Signed in as fixture-operator')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Actual Assist' })).toBeVisible();
  await page.goto('/history');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Sign in to Actual Assist' })).toBeVisible();
  expect((await page.request.get('/api/jobs')).status()).toBe(401);
});

test('session expiry hides protected content without storing the credential', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByLabel('Operator credential').fill(token);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Signed in as fixture-operator')).toBeVisible();
  await page.clock.fastForward(301_000);
  await expect(page.getByRole('heading', { name: 'Sign in to Actual Assist' })).toBeVisible();
  await expect(page.getByText('Signed in as fixture-operator')).not.toBeVisible();
});
