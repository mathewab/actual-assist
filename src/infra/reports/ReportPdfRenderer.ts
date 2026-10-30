import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import type { ReportFacts } from '../../domain/reports/Report.js';
const ink = '#142F36',
  teal = '#147A72';
export function reportMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);
}
export function localNarrative(facts: ReportFacts): string {
  return `Recorded income was ${reportMoney(facts.income, facts.currency)} and net spending was ${reportMoney(facts.spending, facts.currency)}. The recorded difference was ${reportMoney(facts.net, facts.currency)}. Import coverage is unconfirmed; this is not a verified savings balance.`;
}
/** Local rendering only: no remote fonts, URLs, HTML or model output. */
export async function renderReportPdf(
  facts: ReportFacts,
  version: number,
  narrative: string
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: `Monthly report ${facts.month} v${version}`, Author: 'Actual Assist' },
  });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font(fileURLToPath(new URL('./fonts/DejaVuSans.ttf', import.meta.url)));
  const text = (s: string, size = 11, color = ink) => doc.fontSize(size).fillColor(color).text(s);
  const title = (label: string) => {
    text('ACTUAL / ASSIST', 11, teal);
    doc.moveDown();
    text(label, 27);
    doc.moveDown(0.5);
    text(`${facts.month} / version ${version} / ${facts.currency}`, 11, teal);
    doc.moveDown();
  };
  title('Your month, in perspective');
  text('IMPORT COVERAGE UNCONFIRMED', 11, '#9A631D');
  text(
    'Manual CSV imports may be missing. Figures describe the captured records, not a confirmed complete month.'
  );
  doc.moveDown(1.5);
  const cardY = doc.y;
  for (const [index, [label, amount]] of (
    [
      ['Recorded income', facts.income],
      ['Net spending', facts.spending],
      ['Recorded net', facts.net],
    ] as const
  ).entries()) {
    const x = 40 + index * 176;
    doc.roundedRect(x, cardY, 164, 102, 9).fill('#E7EEE7');
    doc
      .fillColor(teal)
      .fontSize(10)
      .text(label, x + 12, cardY + 15, { width: 142 });
    const value = reportMoney(amount, facts.currency);
    let size = 21;
    while (size > 8 && doc.fontSize(size).widthOfString(value) > 142) size--;
    doc
      .fillColor(ink)
      .fontSize(size)
      .text(value, x + 12, cardY + 42, { width: 142, lineBreak: false });
  }
  doc.x = 40;
  doc.y = cardY + 130;
  if (facts.income > 0 && facts.spending >= 0 && facts.spending <= facts.income) {
    text('Where recorded income went', 16, teal);
    const y = doc.y + 10;
    const proportion = facts.spending / facts.income;
    doc.roundedRect(40, y, 515, 24, 5).fill('#C9DF9D');
    if (proportion > 0) doc.rect(40, y, 515 * proportion, 24).fill(teal);
    doc.y = y + 38;
    text(
      `${(proportion * 100).toFixed(1)}% net spending / ${((1 - proportion) * 100).toFixed(1)}% recorded net`,
      10
    );
    doc.moveDown(1.5);
  }
  text('The month in words', 17, teal);
  text(narrative);
  doc.moveDown();
  text('Deterministic summary / AI disabled', 9);
  doc.moveDown();
  text(
    `Captured ${facts.capturedAt}. On-budget scope. Internal transfers excluded. ${facts.transactionCount} transaction entries.`,
    9
  );
  for (const warning of facts.warnings.slice(1)) {
    doc.moveDown();
    text(warning, 10, '#9A631D');
  }
  doc.addPage();
  title('Spending & coverage');
  const maximum = Math.max(1, ...facts.categories.map((c) => Math.abs(c.amount)));
  for (const category of facts.categories) {
    if (doc.y > 680) {
      doc.addPage();
      title('Spending continued');
    }
    text(`${category.name}: ${reportMoney(category.amount, facts.currency)}`);
    const y = doc.y + 4;
    doc.rect(40, y, 510, 9).fill('#E7EEE7');
    doc
      .rect(40, y, (510 * Math.abs(category.amount)) / maximum, 9)
      .fill(category.amount < 0 ? '#9A631D' : teal);
    doc.y = y + 22;
    if (category.amount < 0) text('Net refund (negative spending)', 9);
  }
  if (doc.y > 610) doc.addPage();
  doc.moveDown();
  text('Account coverage', 17, teal);
  for (const account of facts.accounts) {
    if (doc.y > 700) doc.addPage();
    text(
      `${account.name} / latest record: ${account.latestRecord ?? 'none this month'} / coverage unconfirmed`,
      10
    );
    doc.moveDown(0.5);
  }
  doc.moveDown();
  text(
    'Later imports never change this saved version. Generate a new version to reflect updated records.',
    10
  );
  const pages = doc.bufferedPageRange();
  for (let page = 0; page < pages.count; page++) {
    doc.switchToPage(page);
    doc
      .fontSize(8)
      .fillColor('#52666A')
      .text(
        `Actual Assist / ${facts.month} / v${version} / ${page + 1} of ${pages.count}`,
        40,
        790,
        { lineBreak: false }
      );
  }
  doc.end();
  return result;
}
