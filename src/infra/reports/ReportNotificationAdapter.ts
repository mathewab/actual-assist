/** Not wired into report generation. A later opt-in workflow must supply transport and credentials. */
export interface ReportNotificationTransport {
  send(payload: { title: string; message: string; url: string; url_title: string }): Promise<void>;
}
export class ReportNotificationAdapter {
  constructor(
    private transport: ReportNotificationTransport,
    private enabled = false
  ) {}
  async notify(reportId: string, appOrigin: string): Promise<void> {
    if (!this.enabled) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(reportId))
      throw new Error('INVALID_REPORT_ID');
    const origin = new URL(appOrigin);
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== '/'
    )
      throw new Error('INVALID_APP_ORIGIN');
    await this.transport.send({
      title: 'Report ready',
      message: 'Your monthly report is ready',
      url: new URL(`/reports/${reportId}`, origin).href,
      url_title: 'View saved report',
    });
  }
}
