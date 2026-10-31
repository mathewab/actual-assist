import { expect, it, vi } from 'vitest';
import { ReportNarrativeService } from '../../../src/services/ReportNarrativeService.js';
import { PushoverTransport } from '../../../src/infra/reports/PushoverTransport.js';
import {
  ReportScheduler,
  previousReportMonth,
  scheduledReportKey,
} from '../../../src/scheduler/ReportScheduler.js';
import { envSchema } from '../../../src/infra/env.js';
import type { ReportFacts, ReportObservation } from '../../../src/domain/reports/ReportTypes.js';
import type { AIAdapter } from '../../../src/infra/ai/AIAdapter.js';
const facts: ReportFacts = {
  schemaVersion: 1,
  month: '2026-09',
  currency: 'USD',
  capturedAt: '2026-10-01T00:00:00Z',
  income: 10000,
  spending: 5000,
  net: 5000,
  unresolvedInflows: 0,
  categories: [{ id: 'private-category', name: 'PRIVATE_CATEGORY', amount: 5000 }],
  accounts: [{ name: 'PRIVATE_ACCOUNT', latestRecord: '2026-09-30' }],
  warnings: ['PRIVATE_WARNING'],
  transactionCount: 2,
};
const observations: ReportObservation[] = [
  {
    id: 'largest-category',
    kind: 'category',
    text: 'PRIVATE_MERCHANT category: $50.00.',
    evidenceIds: ['PRIVATE_TRANSACTION'],
  },
];
function ai() {
  return {
    completion: vi.fn(async () => JSON.stringify({ ids: ['largest-category'] })),
    isConfigured: () => true,
    getCapabilities: () => ({
      supportsWebSearch: false,
      supportsStructuredOutput: true,
      supportsStreaming: false,
    }),
    getBackendName: () => 'mock',
  } satisfies AIAdapter;
}
it('AI is disabled by default; opt-in sends aggregates and generic IDs only and uses validated local wording', async () => {
  const adapter = ai();
  expect((await new ReportNarrativeService(adapter).summarize(facts, observations)).source).toBe(
    'local'
  );
  expect(adapter.completion).not.toHaveBeenCalled();
  expect(
    (await new ReportNarrativeService(adapter, true).summarize(facts, observations)).source
  ).toBe('ai-assisted');
  const input = JSON.stringify(adapter.completion.mock.calls);
  expect(input).not.toContain('PRIVATE_');
  expect(input).toContain('"webSearch":false');
});
it('unknown model references, invented prose, provider failure and timeout fall back locally', async () => {
  const adapter = ai();
  for (const response of [
    JSON.stringify({ ids: ['invented'] }),
    JSON.stringify({ ids: ['largest-category'], reason: 'invented cause' }),
    'not json',
  ]) {
    adapter.completion.mockResolvedValueOnce(response);
    expect(
      (await new ReportNarrativeService(adapter, true).summarize(facts, observations)).source
    ).toBe('local');
  }
  adapter.completion.mockRejectedValueOnce(new Error('private body'));
  expect(
    (await new ReportNarrativeService(adapter, true).summarize(facts, observations)).source
  ).toBe('local');
  adapter.completion.mockImplementationOnce(() => new Promise(() => undefined));
  expect(
    (await new ReportNarrativeService(adapter, true, 5).summarize(facts, observations)).source
  ).toBe('local');
});
it('Pushover sends a generic availability message in one bounded request; errors are sanitized', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ status: 1 }), { status: 200 }));
  const payload = {
    title: 'Report ready',
    message: 'Your monthly report is ready',
    url: 'https://fixture.invalid/reports/00000000-0000-4000-8000-000000000001',
    url_title: 'View saved report',
  };
  await new PushoverTransport('synthetic-token', 'synthetic-user', request).send(payload);
  expect(request.mock.calls[0][0]).toBe('https://api.pushover.net/1/messages.json');
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
    token: 'synthetic-token',
    user: 'synthetic-user',
    ...payload,
  });
  request.mockRejectedValueOnce(new Error('PRIVATE_RESPONSE'));
  await expect(new PushoverTransport('x', 'y', request).send(payload)).rejects.toMatchObject({
    message: 'NOTIFICATION_UNAVAILABLE',
    outcome: 'uncertain',
  });
  request.mockResolvedValueOnce(new Response('{}', { status: 400 }));
  await expect(new PushoverTransport('x', 'y', request).send(payload)).rejects.toMatchObject({
    outcome: 'failed',
  });
});
it('monthly schedule is disabled by default in config and uses timezone-aware previous month and stable idempotency', async () => {
  const base = {
    ACTUAL_SERVER_URL: 'https://fixture.invalid',
    ACTUAL_PASSWORD: 'fixture',
    ACTUAL_BUDGET_ID: '00000000-0000-4000-8000-000000000001',
  };
  const env = envSchema.parse(base);
  expect([env.REPORT_AI_ENABLED, env.REPORT_PUSH_ENABLED, env.REPORT_SCHEDULE_ENABLED]).toEqual([
    false,
    false,
    false,
  ]);
  expect(envSchema.safeParse({ ...base, REPORT_SCHEDULE_ENABLED: 'true' }).success).toBe(false);
  expect(previousReportMonth(new Date('2026-03-01T00:30:00Z'), 'America/Los_Angeles')).toBe(
    '2026-01'
  );
  expect(scheduledReportKey('a', '2026-09')).not.toBe(scheduledReportKey('b', '2026-09'));
  const service = { generate: vi.fn() };
  const options = {
    enabled: false,
    day: 2,
    hour: 8,
    timezone: 'UTC',
    currency: 'USD',
    budgetId: 'a',
  };
  await new ReportScheduler(service, options).run();
  expect(service.generate).not.toHaveBeenCalled();
  const scheduler = new ReportScheduler(service, { ...options, enabled: true });
  await scheduler.run(new Date('2026-10-02T00:00:00Z'));
  await scheduler.run(new Date('2026-10-03T00:00:00Z'));
  expect(service.generate.mock.calls[0]).toEqual(service.generate.mock.calls[1]);
  expect(service.generate.mock.calls[0][0].month).toBe('2026-09');
});
