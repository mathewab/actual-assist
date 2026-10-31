import { z } from 'zod';
import type { ReportNotificationTransport } from './ReportNotificationAdapter.js';
export class NotificationFailure extends Error {
  constructor(public outcome: 'failed' | 'uncertain') {
    super('NOTIFICATION_UNAVAILABLE');
  }
}
/** No response body, URL or credential is logged. One bounded attempt; no implicit retry. */
export class PushoverTransport implements ReportNotificationTransport {
  constructor(
    private token: string,
    private user: string,
    private request: typeof fetch = fetch
  ) {}
  async send(payload: Parameters<ReportNotificationTransport['send']>[0]): Promise<void> {
    let response: Response;
    try {
      response = await this.request('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token, user: this.user, ...payload }),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
    } catch {
      throw new NotificationFailure('uncertain');
    }
    if (!response.ok)
      throw new NotificationFailure(response.status >= 500 ? 'uncertain' : 'failed');
    try {
      if (z.object({ status: z.number() }).parse(await response.json()).status !== 1)
        throw new NotificationFailure('failed');
    } catch (error) {
      if (error instanceof NotificationFailure) throw error;
      throw new NotificationFailure('uncertain');
    }
  }
}
