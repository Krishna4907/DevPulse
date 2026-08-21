'use client';

import { useState, useEffect } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, githubProvider } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, githubProvider);
      
      // Save user to Firestore users collection
      const userRef = doc(db, 'users', result.user.uid);
      await setDoc(userRef, {
        id: result.user.uid,
        name: result.user.displayName || 'GitHub User',
        email: result.user.email || '',
        image: result.user.photoURL || '',
        createdAt: new Date(),
      }, { merge: true });

      router.push('/dashboard');
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setError(err?.message || 'Authentication failed. Please try again.');
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-[#09090b] text-[#fafafa]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
          <p className="text-zinc-400 animate-pulse font-medium">Loading DevPulse...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-1 flex-col items-center justify-center overflow-hidden bg-[#09090b] px-4 text-[#fafafa] font-sans">
      {/* Background Decorative Glows */}
      <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none"></div>

      <div className="z-10 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 backdrop-blur-xl shadow-2xl flex flex-col items-center text-center">
        {/* Logo Icon */}
        <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-[0_0_20px_rgba(124,58,237,0.3)]">
          <svg
            className="h-8 w-8 text-white animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          DevPulse
        </h1>

        {/* Tagline */}
        <p className="mt-3 text-zinc-400 text-base leading-relaxed max-w-sm">
          Smart collaboration for student teams
        </p>

        {/* Action Button */}
        <div className="mt-8 w-full flex flex-col gap-3">
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-black transition-all hover:bg-zinc-100 hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
            ) : (
              <>
                <svg
                  className="h-5 w-5 fill-current"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                <span>Sign in with GitHub</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 text-xs font-medium text-rose-500 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg w-full">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
