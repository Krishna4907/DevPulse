'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] text-[#fafafa] p-6 text-center">
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.2)]">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Something went wrong</h1>
      <p className="text-zinc-400 text-sm mt-2 max-w-md">
        An unexpected error occurred while loading this view. Please refresh the page or head back to the dashboard.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-xl bg-violet-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-violet-500 transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] active:scale-95 cursor-pointer"
        >
          Refresh the page
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
