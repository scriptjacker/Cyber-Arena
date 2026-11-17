import type { Metadata } from 'next';
import { BRAND } from '@chetna/core';
import './globals.css';

export const metadata: Metadata = {
  title: `${BRAND.name} console`,
  description: BRAND.productLine,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
