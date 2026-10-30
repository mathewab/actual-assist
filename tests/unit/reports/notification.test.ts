import { expect, it, vi } from 'vitest';
import { ReportNotificationAdapter } from '../../../src/infra/reports/ReportNotificationAdapter.js';
it('is disabled by default and sends only a generic message with exact saved-report link when explicitly enabled', async () => {
  const transport = { send: vi.fn() };
  const id = '00000000-0000-4000-8000-000000000001';
  await new ReportNotificationAdapter(transport).notify(id, 'https://fixture.invalid');
  expect(transport.send).not.toHaveBeenCalled();
  await new ReportNotificationAdapter(transport, true).notify(id, 'https://fixture.invalid');
  expect(transport.send).toHaveBeenCalledWith({
    title: 'Report ready',
    message: 'Your monthly report is ready',
    url: `https://fixture.invalid/reports/${id}`,
    url_title: 'View saved report',
  });
  await expect(
    new ReportNotificationAdapter(transport, true).notify(
      id,
      'https://fixture.invalid/?token=secret'
    )
  ).rejects.toThrow('INVALID_APP_ORIGIN');
});
