import { canonicalJson, EventMetaSchema, type EventMeta } from '@chetna/core';

/**
 * JSON-in-TEXT helpers.
 *
 * SQLite (via Prisma) supports neither scalar lists nor a Json column type, so
 * list and object fields are stored as canonical JSON in TEXT columns, suffixed
 * `...Json`. Reads go through these helpers so a corrupt or hand-edited value
 * degrades to a safe default instead of throwing somewhere far away.
 */
export function readJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(value: unknown): string {
  return canonicalJson(value ?? null);
}

export function readStringArray(raw: string | null | undefined): string[] {
  const parsed = readJson<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Event metadata is validated on the way IN, against an allowlist schema that
 * is `.strict()`. This is the last line of the non-collection guarantee: even
 * if a caller tried to attach a submitted value to an event, there is no key it
 * could use, and unknown keys are dropped rather than persisted.
 */
export function writeEventMeta(meta: EventMeta | undefined): string {
  if (!meta) return '{}';
  const parsed = EventMetaSchema.safeParse(meta);
  if (!parsed.success) {
    const stripped = EventMetaSchema.safeParse(
      Object.fromEntries(
        Object.entries(meta).filter(([key]) => key in EventMetaSchema.shape),
      ),
    );
    return writeJson(stripped.success ? stripped.data : {});
  }
  return writeJson(parsed.data);
}

export function readEventMeta(raw: string | null | undefined): EventMeta {
  const parsed = EventMetaSchema.safeParse(readJson<unknown>(raw, {}));
  return parsed.success ? (parsed.data as EventMeta) : {};
}
