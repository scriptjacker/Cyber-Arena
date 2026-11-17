import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { recordQrScan } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

/**
 * A scanned QR code.
 *
 * Recorded as QR_SCAN, which counts as a failure in its own right — the scan
 * has already moved the person from a managed laptop to a personal phone,
 * outside the mail gateway and the endpoint controls. Then straight to the same
 * teachable moment, which explains precisely that.
 */
export default async function QrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const assignment = await recordQrScan(token, new Request('http://local/q'));
  if (!assignment) notFound();
  redirect(`/t/${token}`);
}
