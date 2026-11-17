import { createHash } from 'node:crypto';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/**
 * Deterministic JSON serialisation: keys sorted at every depth, no whitespace,
 * `undefined` members dropped. Two structurally equal objects always produce
 * byte-identical output, which is what makes a signature over a campaign scope
 * meaningful.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): JsonValue {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value as JsonValue;
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new Error('canonicalJson: non-finite number cannot be canonicalised');
    }
    return value as number;
  }
  if (Array.isArray(value)) return value.map(normalise);
  if (t === 'object') {
    const out: { [k: string]: JsonValue } = {};
    for (const key of Object.keys(value as object).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = normalise(v);
    }
    return out;
  }
  throw new Error(`canonicalJson: unsupported type ${t}`);
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** SHA-256 over the canonical form of a value. The scope hash, the template hash. */
export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
