import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { SYSTEM_PROMPT } from './prompt';

export interface ModelSummary {
  summary: string;
  redFlags: string[];
}

export interface SummaryModel {
  /** A summary for the given token data, or null if the model declined or answered unusably. */
  summarize(userMessage: string): Promise<ModelSummary | null>;
}

export interface ClaudeSummaryOptions {
  apiKey: string;
  model: string;
  /** For tests. */
  fetch?: typeof fetch;
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Exactly three short plain-language sentences.' },
    red_flags: {
      type: 'array',
      items: { type: 'string' },
      description: 'One short phrase per red or amber check, most serious first.',
    },
  },
  required: ['summary', 'red_flags'],
  additionalProperties: false,
} as const;

const output = z.object({
  summary: z.string().trim().min(1).max(1200),
  red_flags: z.array(z.string().trim().min(1).max(200)).max(10),
});

export function createClaudeSummaryModel(options: ClaudeSummaryOptions): SummaryModel {
  const client = new Anthropic({
    apiKey: options.apiKey,
    fetch: options.fetch,
    timeout: 60_000,
    maxRetries: 1,
  });

  return {
    async summarize(userMessage) {
      const response = await client.beta.messages.create({
        model: options.model,
        max_tokens: 4000,
        // If a safety classifier declines, the API re-runs the request on a fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // A short factual summary needs little reasoning.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      // Refusals (from every model in the chain) and truncated answers are unusable.
      if (response.stop_reason !== 'end_turn') return null;
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return null;
      }
      const parsed = output.safeParse(json);
      return parsed.success
        ? { summary: parsed.data.summary, redFlags: parsed.data.red_flags }
        : null;
    },
  };
}
