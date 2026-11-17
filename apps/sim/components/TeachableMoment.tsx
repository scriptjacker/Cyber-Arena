'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The teachable moment.
 *
 * Engineered against one number from the evidence: in the UCSD study of 19,500
 * employees, **75% of people spent one minute or less** on embedded training and
 * a third closed it immediately — while those who *completed* an interactive
 * session failed later exercises less often.
 *
 * So the whole lesson is built to land inside a 45-second budget:
 *   1. what just happened, in one line
 *   2. the cues in YOUR email, highlighted where they were
 *   3. three things to do differently
 *   4. one interactive question, which is the completion signal
 *
 * Depth is available underneath for anyone who wants it, but nothing important
 * is hidden there. No shaming copy anywhere: per NCSC guidance, blame suppresses
 * the reporting behaviour that actually protects an organisation.
 */

export interface CueView {
  id: string;
  label: string;
  explanation: string;
  category: string;
  anchored: boolean;
}

export interface DrillOptionView {
  text: string;
  correct: boolean;
  why: string;
}

export interface ModuleView {
  slug: string;
  title: string;
  summary: string;
  body: string;
  action: string;
  minutes: number;
  drill: { question: string; options: DrillOptionView[] };
}

export interface TeachableMomentProps {
  token: string;
  emailHtml: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  firstName: string;
  orgName: string;
  cues: CueView[];
  actions: string[];
  module: ModuleView;
  difficultyLabel: string;
  cueCount: number;
  reportedAlready: boolean;
  showDecoy: boolean;
}

type Stage = 'decoy' | 'lesson';

// ---------------------------------------------------------------------------
// A deliberately tiny markdown renderer.
//
// Returns React nodes rather than HTML, so there is no dangerouslySetInnerHTML
// anywhere in the learning path. The content is ours (content/modules), but
// rendering it as elements means a future editable module cannot introduce
// markup either.
// ---------------------------------------------------------------------------
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <code key={`${keyPrefix}-c-${i}`} className="rounded bg-ink-line px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + token.length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={bi} className="my-3 space-y-1.5 pl-5">
              {lines.map((l, li) => (
                <li key={li} className="list-disc text-slate-300">
                  {inline(l.slice(2), `${bi}-${li}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="my-3 leading-relaxed text-slate-300">
            {inline(block.replace(/\n/g, ' '), String(bi))}
          </p>
        );
      })}
    </>
  );
}

export default function TeachableMoment(props: TeachableMomentProps) {
  const [stage, setStage] = useState<Stage>(props.showDecoy ? 'decoy' : 'lesson');
  const [answered, setAnswered] = useState<number | null>(null);
  const [showDepth, setShowDepth] = useState(false);
  const [activeCue, setActiveCue] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const beaconSent = useRef(false);
  const trainingStarted = useRef(false);

  const post = useCallback(
    (path: string, body: unknown) => {
      void fetch(`/t/${props.token}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {
        /* telemetry is best-effort; it must never interrupt the lesson */
      });
    },
    [props.token],
  );

  // The interaction beacon. A gateway or link scanner fetches the page but
  // never moves a pointer, so this is what separates a person from a machine.
  useEffect(() => {
    const signals = new Set<string>();
    const fire = () => {
      if (beaconSent.current) return;
      beaconSent.current = true;
      post('interact', {
        dwellMs: Date.now() - startedAt.current,
        signals: [...signals].slice(0, 8),
      });
    };
    const on = (name: string, signal: string) => {
      const handler = () => {
        signals.add(signal);
        fire();
      };
      window.addEventListener(name, handler, { once: true, passive: true });
      return () => window.removeEventListener(name, handler);
    };
    const cleanups = [
      on('pointermove', 'pointer'),
      on('scroll', 'scroll'),
      on('keydown', 'key'),
      on('pointerdown', 'pointer'),
    ];
    const focusTimer = window.setTimeout(() => {
      signals.add('focus');
      fire();
    }, 1200);
    return () => {
      window.clearTimeout(focusTimer);
      for (const c of cleanups) c();
    };
  }, [post]);

  // Training starts when the lesson is actually on screen, not when the page
  // loads — otherwise a scanner would register as a learner.
  useEffect(() => {
    if (stage !== 'lesson' || trainingStarted.current) return;
    trainingStarted.current = true;
    startedAt.current = Date.now();
    post('training', {
      moduleSlug: props.module.slug,
      event: 'TRAINING_START',
      dwellMs: 0,
    });
  }, [stage, post, props.module.slug]);

  const reveal = useCallback(
    (viaSignIn: boolean) => {
      if (viaSignIn) post('intent', {});
      setStage('lesson');
    },
    [post],
  );

  const answer = useCallback(
    (index: number) => {
      if (answered !== null) return;
      setAnswered(index);
      const option = props.module.drill.options[index];
      const dwellMs = Date.now() - startedAt.current;
      post('training', {
        moduleSlug: props.module.slug,
        event: option?.correct ? 'DRILL_PASS' : 'DRILL_FAIL',
        dwellMs,
        drillScore: option?.correct ? 100 : 0,
      });
      post('training', {
        moduleSlug: props.module.slug,
        event: 'TRAINING_COMPLETE',
        dwellMs,
      });
    },
    [answered, post, props.module],
  );

  const anchoredCues = useMemo(() => props.cues.filter((c) => c.anchored), [props.cues]);
  const structuralCues = useMemo(() => props.cues.filter((c) => !c.anchored), [props.cues]);

  // ------------------------------------------------------------- decoy stage
  if (stage === 'decoy') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="rounded-xl border border-ink-line bg-ink-soft p-7 shadow-2xl">
          <div className="mb-6 flex items-center gap-2.5">
            <div className="h-7 w-7 rounded bg-accent/20 ring-1 ring-accent/40" />
            <span className="text-sm font-medium text-slate-300">{props.orgName} Single Sign-On</span>
          </div>

          <h1 className="text-lg font-semibold text-white">Sign in to continue</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Your session has expired. Confirm your identity to view this item.
          </p>

          {/*
            There is no input element here. Not a disabled one, not a read-only
            one — none. A real `type="password"` field makes browsers and
            password managers autofill genuine credentials, which the page could
            then read. Removing the field removes the entire risk class rather
            than promising not to look.
          */}
          <div className="mt-6 space-y-3" aria-hidden="true">
            <div className="h-11 rounded-lg border border-ink-line bg-ink/60" />
            <div className="h-11 rounded-lg border border-ink-line bg-ink/60" />
          </div>

          <button
            type="button"
            onClick={() => reveal(true)}
            className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/85"
          >
            Sign in
          </button>

          {/* No dark patterns: the way out is visible from the first frame. */}
          <button
            type="button"
            onClick={() => reveal(false)}
            className="mt-3 w-full text-center text-xs text-slate-500 underline decoration-dotted transition hover:text-slate-300"
          >
            Something feels wrong about this page
          </button>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------ lesson stage
  const selected = answered === null ? null : props.module.drill.options[answered];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* 1 — what just happened */}
      <div className="rounded-xl border border-accent-warm/40 bg-accent-warm/10 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded bg-accent-warm/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-warm">
            Simulation
          </span>
          <div>
            <h1 className="text-lg font-semibold text-white">
              That was an authorized phishing simulation, {props.firstName}.
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              No real system was touched and nothing you did was recorded against you. Nobody is
              told who clicked. Forty-five seconds here is genuinely all it takes.
            </p>
          </div>
        </div>
      </div>

      {/* 2 — the cues, in the actual email */}
      <section className="mt-7">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            The message you received
          </h2>
          <span className="text-xs text-slate-500">
            {props.cueCount} detectable {props.cueCount === 1 ? 'cue' : 'cues'} · rated{' '}
            <span className="text-slate-300">{props.difficultyLabel}</span> on the NIST Phish Scale
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-ink-line bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-700">
            <div className="font-semibold text-slate-900">{props.subject}</div>
            <div className="mt-0.5 text-slate-500">
              {props.fromName} &lt;{props.fromAddress}&gt;
            </div>
          </div>
          {/*
            The replayed email body. It is the participant's own message, with
            cues wrapped in <mark> by @chetna/phishscale — which walks text
            nodes only, so the original markup and styling survive intact. All
                text is escaped during annotation.
          */}
          <div
            className="prose-sm max-w-none px-4 py-4 text-slate-800 [&_a]:pointer-events-none [&_a]:text-blue-700 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: props.emailHtml }}
          />
        </div>

        {anchoredCues.length > 0 && (
          <ul className="mt-4 space-y-2">
            {anchoredCues.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setActiveCue(activeCue === c.id ? null : c.id)}
                  className="w-full rounded-lg border border-ink-line bg-ink-soft px-4 py-3 text-left transition hover:border-accent-warm/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white">{c.label}</span>
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">
                      {c.category.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </div>
                  {activeCue === c.id && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.explanation}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {structuralCues.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Also present, though not a single span of text to point at:{' '}
            {structuralCues.map((c) => c.label.toLowerCase()).join('; ')}.
          </p>
        )}
      </section>

      {/* 3 — what to do differently */}
      {props.actions.length > 0 && (
        <section className="mt-7 rounded-xl border border-ink-line bg-ink-soft p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            What would have caught it
          </h2>
          <ol className="mt-3 space-y-2.5">
            {props.actions.map((a, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-200">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[11px] font-semibold text-accent">
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 4 — the drill: this is the completion signal */}
      <section className="mt-7 rounded-xl border border-ink-line bg-ink-soft p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            One question
          </h2>
          <span className="text-xs text-slate-500">{props.module.title}</span>
        </div>
        <p className="mt-3 text-[15px] font-medium leading-relaxed text-white">
          {props.module.drill.question}
        </p>

        <div className="mt-4 space-y-2">
          {props.module.drill.options.map((o, i) => {
            const isChosen = answered === i;
            const reveal = answered !== null;
            const tone = !reveal
              ? 'border-ink-line bg-ink/40 hover:border-accent/50'
              : o.correct
                ? 'border-accent-good/60 bg-accent-good/10'
                : isChosen
                  ? 'border-accent-bad/60 bg-accent-bad/10'
                  : 'border-ink-line bg-ink/40 opacity-60';
            return (
              <button
                key={i}
                type="button"
                disabled={reveal}
                onClick={() => answer(i)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${tone}`}
              >
                <span className="text-slate-100">{o.text}</span>
                {reveal && (
                  <span className="mt-1.5 block text-xs leading-relaxed text-slate-400">
                    {o.why}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selected && (
          <p className="mt-4 text-sm font-medium text-slate-200">
            {selected.correct
              ? 'That is the one. '
              : 'Not quite, and this one catches a lot of people. '}
            <span className="font-normal text-slate-400">{props.module.action}</span>
          </p>
        )}
      </section>

      {/* Depth, for anyone who wants it. Nothing essential is hidden here. */}
      <section className="mt-5">
        <button
          type="button"
          onClick={() => setShowDepth((v) => !v)}
          className="text-sm text-accent underline decoration-dotted transition hover:text-accent/80"
        >
          {showDepth ? 'Hide the detail' : `Read the detail (${props.module.minutes} min)`}
        </button>
        {showDepth && (
          <div className="mt-4 rounded-xl border border-ink-line bg-ink-soft p-5 text-sm">
            <h3 className="text-base font-semibold text-white">{props.module.title}</h3>
            <p className="mt-1 text-slate-400">{props.module.summary}</p>
            <div className="mt-3">
              <Markdown text={props.module.body} />
            </div>
          </div>
        )}
      </section>

      <footer className="mt-10 border-t border-ink-line pt-5 text-xs leading-relaxed text-slate-500">
        {props.reportedAlready ? (
          <p>
            You also reported this message — thank you. Reporting is the single most useful thing
            anyone can do with a suspicious email, and it is the behaviour this programme measures.
          </p>
        ) : (
          <p>
            Next time, the most useful thing you can do is report it. One click, and the security
            team can warn everyone else before they open it.
          </p>
        )}
        <p className="mt-2">
          This simulation was authorized in advance by two named approvers and recorded in a
          tamper-evident log. No credentials were requested or collected, and no individual result
          is shared with your manager.
        </p>
      </footer>
    </main>
  );
}
