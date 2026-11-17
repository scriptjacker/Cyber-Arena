import { z } from 'zod';
import {
  Channel,
  CueTag,
  DataClass,
  DsarKind,
  EventType,
  IpClass,
  Role,
  RunMode,
  Scenario,
  SuppressionScope,
} from './enums';

const enumOf = <T extends Record<string, string>>(obj: T) =>
  z.enum(Object.values(obj) as [string, ...string[]]);

export const RoleSchema = enumOf(Role);
export const ChannelSchema = enumOf(Channel);
export const ScenarioSchema = enumOf(Scenario);
export const EventTypeSchema = enumOf(EventType);
export const IpClassSchema = enumOf(IpClass);
export const CueTagSchema = enumOf(CueTag);
export const RunModeSchema = enumOf(RunMode);
export const DataClassSchema = enumOf(DataClass);
export const DsarKindSchema = enumOf(DsarKind);
export const SuppressionScopeSchema = enumOf(SuppressionScope);

/**
 * Event metadata is an ALLOWLIST, and `.strict()` is the whole point: there is
 * no key in which a submitted value, keystroke or credential could be smuggled
 * into the database. tests/abuse A16 attacks this directly.
 */
export const EventMetaSchema = z
  .object({
    cueId: z.string().max(64).optional(),
    moduleSlug: z.string().max(64).optional(),
    dwellMs: z.number().int().nonnegative().max(86_400_000).optional(),
    drillScore: z.number().min(0).max(100).optional(),
    clusterKey: z.string().max(64).optional(),
    reasonCode: z.string().max(64).optional(),
    channel: ChannelSchema.optional(),
  })
  .strict();

/**
 * The body of POST /t/:token/intent. Deliberately an empty strict object: the
 * endpoint records THAT a person would have submitted, never WHAT.
 */
export const IntentBodySchema = z.object({}).strict();

/** The interaction beacon that promotes a click to CLICK_CONFIRMED. */
export const InteractBodySchema = z
  .object({
    dwellMs: z.number().int().nonnegative().max(600_000),
    signals: z.array(z.enum(['pointer', 'scroll', 'key', 'focus'])).max(8),
  })
  .strict();

export const TrainingBodySchema = z
  .object({
    moduleSlug: z.string().max(64),
    event: z.enum([
      EventType.TRAINING_START,
      EventType.TRAINING_COMPLETE,
      EventType.DRILL_PASS,
      EventType.DRILL_FAIL,
    ]),
    dwellMs: z.number().int().nonnegative().max(3_600_000),
    drillScore: z.number().min(0).max(100).optional(),
  })
  .strict();

export const TokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/, 'not a valid simulation token');

export const EmailSchema = z.string().email().max(254);

export const DomainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i, 'not a valid domain')
  .transform((s) => s.toLowerCase());

export const TemplateInputSchema = z.object({
  name: z.string().min(3).max(120),
  channel: ChannelSchema,
  scenario: ScenarioSchema,
  subject: z.string().min(1).max(200),
  fromName: z.string().min(1).max(80),
  fromAddress: EmailSchema,
  html: z.string().min(1).max(200_000),
  text: z.string().max(50_000).optional(),
  /** 1..5. The NIST Phish Scale premise-alignment judgement. */
  premiseAlignment: z.number().int().min(1).max(5),
  attachments: z
    .array(
      z.object({
        filename: z.string().max(120),
        contentType: z.string().max(120),
      }),
    )
    .max(3)
    .optional(),
});
export type TemplateInput = z.infer<typeof TemplateInputSchema>;

export const CampaignInputSchema = z
  .object({
    name: z.string().min(3).max(120),
    templateIds: z.array(z.string()).min(1).max(20),
    rosterImportId: z.string(),
    senderDomain: DomainSchema,
    landingDomain: DomainSchema,
    recipientDomains: z.array(DomainSchema).min(1).max(20),
    windowStart: z.string().datetime(),
    windowEnd: z.string().datetime(),
    timezone: z.string().max(64).default('Asia/Kolkata'),
    holdoutPct: z.number().int().min(0).max(50).default(20),
    rateLimitPerHour: z.number().int().min(1).max(100_000).default(500),
  })
  .refine((c) => new Date(c.windowEnd) > new Date(c.windowStart), {
    message: 'windowEnd must be after windowStart',
    path: ['windowEnd'],
  });
export type CampaignInput = z.infer<typeof CampaignInputSchema>;

export const RosterRowSchema = z.object({
  email: EmailSchema,
  displayName: z.string().min(1).max(120),
  department: z.string().min(1).max(80),
  roleArchetype: z.string().min(1).max(80),
  locale: z.string().max(16).default('en-IN'),
  joinedAt: z.string().optional(),
});
export type RosterRow = z.infer<typeof RosterRowSchema>;

export const EthicsOverrideInputSchema = z.object({
  templateId: z.string(),
  themes: z.array(z.string()).min(1),
  /** Long enough that nobody can wave it through with "ok". */
  justification: z.string().min(120).max(4000),
});

export const SuppressionInputSchema = z.object({
  scope: SuppressionScopeSchema,
  value: z.string().min(1).max(254),
  reason: z.string().min(3).max(500),
  expiresAt: z.string().datetime().optional(),
});

export const DsarInputSchema = z.object({
  pid: z.string().min(3).max(64),
  kind: DsarKindSchema,
});
