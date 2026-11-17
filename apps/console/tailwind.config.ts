import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../content/**/*.ts',
  ],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0b0e14', soft: '#141922', line: '#222938' },
        paper: '#f7f7f5',
        accent: { DEFAULT: '#3b82f6', warm: '#f59e0b', bad: '#ef4444', good: '#10b981' },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
