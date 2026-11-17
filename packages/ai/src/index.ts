import type { ZodType } from 'zod';

/**
 * The guarded AI layer. INTERFACE ONLY — no provider is implemented yet.
 *
 * This file exists so the workspace package resolves rather than dangling, and
 * so the constraints are written down before any model is wired in. The three
 * planned surfaces are the Lure Composer, the Coach and the AI-threat
 * curriculum (see docs/01-ARCHITECTURE.md §8).
 *
 * The rules below are not aspirational — they are the reason this package is a
 * separate module with a narrow interface, rather than an SDK call sprinkled
 * through the console:
 *
 *  1. Participant PII never enters `vars`. Role archetypes and department
 *     names only, so no individual is described to a third-party model.
 *  2. Every response is parsed against a zod schema and rejected on mismatch.
 *     A model does not get to decide the shape of our data.
 *  3. A generated template is persisted ONLY after passing @chetna/safety-lint
 *     and @chetna/ethics. Generation is a proposal, not an authorisation.
 *  4. No tool or function calling. The model returns text; nothing it says can
 *     cause an action.
 *  5. Template content read from the database is never concatenated into an
 *     instruction position. A lure containing "ignore previous instructions"
 *     is data being summarised, not a command.
 *  6. The default provider is deterministic and offline, so a demo never
 *     depends on a network or an API key.
 */
export interface AiRequest<T> {
  promptId: string;
  /** PII-free. Role archetypes, departments and cue tags only. */
  vars: Record<string, string>;
  schema: ZodType<T>;
  maxTokens: number;
}

export interface AiProvider {
  readonly id: 'offline' | 'anthropic';
  complete<T>(request: AiRequest<T>): Promise<T>;
}

export const AI_NOT_IMPLEMENTED =
  'No AI provider is implemented yet. Set CHETNA_AI_PROVIDER=offline (the default) and use the seeded template library.';

/** Throws until a provider lands, so a caller can never silently get nothing. */
export function getProvider(): AiProvider {
  throw new Error(AI_NOT_IMPLEMENTED);
}
