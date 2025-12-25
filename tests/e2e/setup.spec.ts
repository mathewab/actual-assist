import { test, expect } from '@playwright/test';

test('Playwright configuration', async ({ page }) => {
  // Basic smoke test to verify UI loads with mocked API
  await page.goto('/');
  await expect(page).toHaveTitle(/Actual Budget Assistant/);
});
