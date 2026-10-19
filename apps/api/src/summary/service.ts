import { RISK_DISCLAIMER, type TokenExplanation } from '@sift/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { RiskService } from '../risk/service';
import type { TokenRepository } from '../tokens/repository';
import type { SummaryModel } from './claude';
import { looksLikeAdvice } from './guard';
import { type SummaryInput, buildUserMessage } from './prompt';
import { rulesSummary } from './rules';

export interface SummaryService {
  /** A plain-language explanation of the token, or null if the address is not a mint. */
  getSummary(mint: string): Promise<TokenExplanation | null>;
}

export interface SummaryServiceOptions {
  risk: RiskService;
  repository: TokenRepository;
  /** Null without an Anthropic key: every summary is rules-based. */
  model: SummaryModel | null;
  log: Pick<FastifyBaseLogger, 'warn'>;
  now?: () => Date;
  /** How long a summary is reused (the plan asks for 5 minutes). */
  ttlMs?: number;
  maxEntries?: number;
}

const HOUR_MS = 3_600_000;
// A rules-based answer given because Claude failed is retried sooner.
const FALLBACK_TTL_MS = 30_000;

export function createSummaryService(options: SummaryServiceOptions): SummaryService {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const maxEntries = options.maxEntries ?? 5_000;
  type Entry = { expiresAt: number; result: Promise<TokenExplanation | null> };
  const cache = new Map<string, Entry>();

  async function compute(mint: string, entry: Entry): Promise<TokenExplanation | null> {
    const risk = await options.risk.getRisk(mint);
    if (!risk) return null;

    const at = now();
    const [token, activityLastHour, activityLast24h] = await Promise.all([
      options.repository.getToken(mint),
      options.repository.getActivity(mint, new Date(at.getTime() - HOUR_MS)),
      options.repository.getActivity(mint, new Date(at.getTime() - 24 * HOUR_MS)),
    ]);
    const input: SummaryInput = { mint, token, risk, activityLastHour, activityLast24h, now: at };

    // Only tokens Sift tracks get an AI summary, so lookups of arbitrary addresses
    // can't run up the Claude bill.
    let written = options.model && token ? await askModel(options.model, input) : null;
    if (options.model && token && !written) entry.expiresAt = at.getTime() + FALLBACK_TTL_MS;
    const source = written ? 'ai' : 'rules';
    written ??= rulesSummary(input);

    return {
      mint,
      summary: written.summary,
      redFlags: written.redFlags,
      riskLevel: risk.level,
      source,
      generatedAt: at.toISOString(),
      disclaimer: RISK_DISCLAIMER,
    };
  }

  async function askModel(model: SummaryModel, input: SummaryInput) {
    try {
      const answer = await model.summarize(buildUserMessage(input));
      if (!answer) {
        options.log.warn({ mint: input.mint }, 'Claude summary unusable; using rules');
        return null;
      }
      if (looksLikeAdvice(answer.summary, ...answer.redFlags)) {
        options.log.warn({ mint: input.mint }, 'Claude summary read as advice; using rules');
        return null;
      }
      return answer;
    } catch (err) {
      options.log.warn({ err, mint: input.mint }, 'Claude summary failed; using rules');
      return null;
    }
  }

  return {
    getSummary(mint) {
      const at = now().getTime();
      const cached = cache.get(mint);
      if (cached && cached.expiresAt > at) return cached.result;

      const entry = { expiresAt: at + ttlMs } as Entry;
      entry.result = compute(mint, entry);
      entry.result.catch(() => {
        if (cache.get(mint) === entry) cache.delete(mint);
      });
      cache.delete(mint);
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
      cache.set(mint, entry);
      return entry.result;
    },
  };
}
