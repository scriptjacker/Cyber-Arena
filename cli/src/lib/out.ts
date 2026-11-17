/** Minimal console formatting. No dependency, works in any terminal. */
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (useColour ? `\u001b[${code}m${s}\u001b[0m` : s);

export const bold = (s: string) => c('1', s);
export const dim = (s: string) => c('2', s);
export const green = (s: string) => c('32', s);
export const red = (s: string) => c('31', s);
export const yellow = (s: string) => c('33', s);
export const cyan = (s: string) => c('36', s);

export function heading(text: string): void {
  console.log(`\n${bold(text)}\n${dim('─'.repeat(Math.min(72, text.length + 8)))}`);
}

export function ok(text: string): void {
  console.log(`  ${green('✓')} ${text}`);
}

export function fail(text: string): void {
  console.log(`  ${red('✗')} ${text}`);
}

export function warn(text: string): void {
  console.log(`  ${yellow('!')} ${text}`);
}

export function info(text: string): void {
  console.log(`  ${dim('·')} ${text}`);
}

export function kv(key: string, value: string | number): void {
  console.log(`  ${key.padEnd(28, ' ')} ${bold(String(value))}`);
}

export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}
