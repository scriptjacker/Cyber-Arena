import type { Metadata } from 'next';
import { BRAND } from '@chetna/core';
import './globals.css';

export const metadata: Metadata = {
  title: `${BRAND.name} — simulation surface`,
  description: 'Authorized security awareness simulation. No credentials are collected here.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink font-sans antialiased">{children}</body>
    </html>
  );
}
