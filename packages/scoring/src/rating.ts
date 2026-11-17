import { Difficulty } from '@chetna/core';

/**
 * Participant resilience rating — an Elo-style number, deliberately private.
 *
 * Why a rating rather than a click count: a person who spots a very hard lure
 * has demonstrated more than someone who spots an obvious one, and a person who
 * fails a near-undetectable lure has demonstrated almost nothing. A rating
 * handles both, and it cannot be gamed by sending easier simulations.
 *
 * The number is shown ONLY to the participant. Cohort views show bands, never
 * numbers, so nothing can be reverse-engineered back to an individual.
 */

export const START_RATING = 1200;
export const K_FACTOR = 24;

/** Difficulty expressed on the same scale as a participant rating. */
export const TEMPLATE_RATING: Record<Difficulty, number> = {
  [Difficulty.VERY_LOW]: 1000,
  [Difficulty.LOW]: 1100,
  [Difficulty.MODERATE]: 1200,
  [Difficulty.HIGH]: 1350,
  [Difficulty.VERY_HIGH]: 1500,
};

export type Outcome = 'REPORTED' | 'IGNORED' | 'FAILED';

/** Reporting is the behaviour we want, so it scores highest — not merely "not clicking". */
export const OUTCOME_SCORE: Record<Outcome, number> = {
  REPORTED: 1,
  IGNORED: 0.5,
  FAILED: 0,
};

export function expectedScore(participantRating: number, templateRating: number): number {
  return 1 / (1 + 10 ** ((templateRating - participantRating) / 400));
}

export function updateRating(
  participantRating: number,
  difficulty: Difficulty,
  outcome: Outcome,
  k = K_FACTOR,
): number {
  const d = TEMPLATE_RATING[difficulty];
  const expected = expectedScore(participantRating, d);
  const actual = OUTCOME_SCORE[outcome];
  return Math.round((participantRating + k * (actual - expected)) * 10) / 10;
}

export type ResilienceBand = 'DEVELOPING' | 'CAPABLE' | 'STRONG';

export const BAND_LABEL: Record<ResilienceBand, string> = {
  DEVELOPING: 'Developing',
  CAPABLE: 'Capable',
  STRONG: 'Strong',
};

/**
 * Three bands, not five, and no numbers — because a manager seeing "1187 vs
 * 1243" is a performance-management conversation waiting to happen, which is
 * exactly what the NCSC warns destroys the reporting signal.
 */
export function bandOf(rating: number): ResilienceBand {
  if (rating < 1150) return 'DEVELOPING';
  if (rating <= 1300) return 'CAPABLE';
  return 'STRONG';
}

export function bandDistribution(ratings: readonly number[]): Record<ResilienceBand, number> {
  const out: Record<ResilienceBand, number> = { DEVELOPING: 0, CAPABLE: 0, STRONG: 0 };
  for (const r of ratings) out[bandOf(r)] += 1;
  return out;
}
