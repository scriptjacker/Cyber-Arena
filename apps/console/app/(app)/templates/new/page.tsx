import { pageCapability } from '@/lib/session';
import StudioEditor from '@/components/StudioEditor';

export const dynamic = 'force-dynamic';

export default async function NewTemplatePage() {
  await pageCapability('template:write');

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Template Studio</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Three checks run as you type, and all three are visible at once. Safety linting is
          absolute — a template that fails it is never written to the database. The harmful-lure
          screen can be overridden, but only by People/HR, in writing, with a signature.
        </p>
      </div>
      <StudioEditor />
    </>
  );
}
