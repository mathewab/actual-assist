import { test, expect } from '@playwright/test';

test('Playwright configuration', async ({ page }) => {
  // Basic smoke test to verify Playwright setup
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain/);
});
