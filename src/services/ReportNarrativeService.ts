import { z } from 'zod';
import type { AIAdapter } from '../infra/ai/AIAdapter.js';
import type { ReportFacts, ReportObservation } from '../domain/reports/ReportTypes.js';
import { localNarrative } from '../infra/reports/ReportPdfRenderer.js';
/** External use is explicit opt-in. Model selects fact IDs; server owns every word/amount. */
export class ReportNarrativeService {
  constructor(
    private adapter?: AIAdapter,
    private enabled = false,
    private timeoutMs = 20000
  ) {}
  async summarize(facts: ReportFacts, observations: ReportObservation[]) {
    const fallback = { text: localNarrative(facts), source: 'local' as const };
    if (!this.enabled || !this.adapter?.isConfigured() || !observations.length) return fallback;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        this.adapter.completion({
          instructions:
            'Select up to three observation IDs to highlight. Return only the requested JSON. Do not invent IDs or add prose.',
          input: JSON.stringify({
            currency: facts.currency,
            income: facts.income,
            netSpending: facts.spending,
            net: facts.net,
            observations: observations.map((o) => ({ id: o.id, kind: o.kind })),
          }),
          webSearch: false,
          signal: controller.signal,
          jsonSchema: {
            name: 'report_highlights',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['ids'],
              properties: {
                ids: {
                  type: 'array',
                  maxItems: 3,
                  items: { type: 'string', enum: observations.map((o) => o.id) },
                },
              },
            },
          },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('TIMEOUT'));
          }, this.timeoutMs);
        }),
      ]);
      const parsed = z
        .strictObject({ ids: z.array(z.string()).min(1).max(3) })
        .parse(JSON.parse(response));
      if (
        new Set(parsed.ids).size !== parsed.ids.length ||
        parsed.ids.some((id) => !observations.some((o) => o.id === id))
      )
        return fallback;
      return {
        text:
          parsed.ids.map((id) => observations.find((o) => o.id === id)!.text).join(' ') +
          ' Figures describe recorded transactions, not inferred causes.',
        source: 'ai-assisted' as const,
      };
    } catch {
      return fallback;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
