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
        rendererVersion: 2,
        analysis: {
          evidenceVersion: 1,
          evidence: [],
          observations: [],
          history: [],
          observedStart: '2026-08-10',
          observedEnd: '2026-09-10',
        },
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
          categories: [{ id: 'food', name: 'Food', amount: 50000 }],
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
    if (url.pathname.endsWith('/observations')) {
      await route.fulfill({
        json: {
          observations: [
            {
              id: 'largest-category',
              kind: 'category',
              text: 'Food: $500.00 recorded net spending.',
              evidenceIds: ['row1'],
            },
          ],
          merchants: [{ id: 'merchant', name: 'Frozen merchant', net: 50000, count: 1 }],
          history: [
            { month: '2026-08', spending: 40000, income: 0, transactionCount: 1, cutoffDay: null },
          ],
          observedStart: '2026-08-10',
          observedEnd: '2026-09-10',
        },
      });
      return;
    }
    if (url.pathname.endsWith('/transactions')) {
      await route.fulfill({
        json: {
          total: 1,
          netSpending: 50000,
          rows: [
            {
              id: 'row1',
              sourceId: 't1',
              month: '2026-09',
              date: '2026-09-10',
              accountId: 'a',
              accountName: 'Frozen account',
              categoryId: 'food',
              categoryName: 'Food',
              payeeId: 'merchant',
              payeeName: 'Frozen merchant',
              amount: -50000,
              role: 'spending',
              parentId: null,
              parentAmount: null,
            },
          ],
        },
      });
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
  await page.getByRole('button', { name: 'Food: $500.00 recorded net spending.' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Frozen merchant' })).toBeVisible();
  await expect(page.getByText('Filtered net spending: $500.00', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Back to report', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
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
