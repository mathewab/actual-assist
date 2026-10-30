import { test, expect } from '@playwright/test';
import type { SavedReport } from '../../src/domain/reports/ReportTypes';
test('monthly archive, saved detail, revision and download links use a stable authenticated report', async ({
  page,
}) => {
  const reports: SavedReport[] = [];
  await page.route('**/api/v1/reports**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      expect(request.headers()['x-csrf-token']).toBeTruthy();
      const input = request.postDataJSON();
      const report = {
        rendererVersion: 1,
        id: `00000000-0000-4000-8000-${String(reports.length + 1).padStart(12, '0')}`,
        budgetId: 'budget-1',
        month: input.month,
        version: reports.length + 1,
        createdAt: '2026-10-02T09:00:00Z',
        jobId: 'synthetic',
        supersedesId: input.supersedesId ?? null,
        sourceHash: 'synthetic',
        pdfHash: 'synthetic',
        narrative: 'Synthetic recorded net.',
        facts: {
          schemaVersion: 1,
          month: input.month,
          currency: input.currency,
          capturedAt: '2026-10-02T09:00:00Z',
          income: 100000,
          spending: 50000,
          net: 50000,
          unresolvedInflows: 0,
          categories: [],
          accounts: [],
          warnings: ['Coverage unconfirmed'],
          transactionCount: 2,
        },
      } as SavedReport;
      reports.unshift(report);
      await route.fulfill({ status: 201, json: report });
      return;
    }
    if (url.pathname.endsWith('/pdf')) {
      await route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
      return;
    }
    const id = url.pathname.split('/')[4];
    await route.fulfill({ json: id ? reports.find((r) => r.id === id) : { reports } });
  });
  await page.goto('/reports');
  await page.getByLabel('Operator credential').fill('fixture-browser-operator-token-at-least-32');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monthly reports' })).toBeVisible();
  await page.getByLabel('Month', { exact: true }).fill('2026-09');
  await page.getByLabel('Budget currency (ISO code)').fill('USD');
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  await page.getByRole('link', { name: 'View version 1' }).click();
  await expect(page.getByRole('heading', { name: '2026-09 · version 1' })).toBeVisible();
  const oldUrl = page.url();
  await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
    'href',
    /000000000001\/pdf\?download=1$/
  );
  await page.getByRole('button', { name: 'Generate revised version' }).click();
  await page.getByRole('link', { name: 'View version 2' }).click();
  await expect(page.getByRole('heading', { name: '2026-09 · version 2' })).toBeVisible();
  await page.goto(oldUrl);
  await expect(page.getByRole('heading', { name: '2026-09 · version 1' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to monthly archive' }).click();
  await expect(page.getByRole('heading', { name: '2026-09 · version 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2026-09 · version 2' })).toBeVisible();
});
