'use client';

import { useState, useEffect } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, githubProvider } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
      await setDoc(
        userRef,
        {
          id: result.user.uid,
          name: result.user.displayName || 'GitHub User',
          email: result.user.email || '',
          image: result.user.photoURL || '',
          createdAt: new Date(),
        },
        { merge: true }
      );

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
    <div className="relative min-h-screen bg-[#09090b] text-[#fafafa] font-sans selection:bg-violet-500/30 selection:text-violet-200 overflow-x-hidden flex flex-col justify-between">
      {/* Background Animated Gradient Blobs (CSS only) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-tr from-violet-600/15 via-indigo-600/10 to-transparent blur-[140px] rounded-full" />
        <div className="absolute top-[600px] -left-40 w-[600px] h-[400px] bg-gradient-to-tr from-purple-600/10 to-transparent blur-[130px] rounded-full" />
        <div className="absolute top-[1200px] -right-40 w-[600px] h-[500px] bg-gradient-to-bl from-indigo-600/10 to-transparent blur-[140px] rounded-full" />
      </div>

      {/* Navigation Bar */}
      <nav className="relative z-20 border-b border-zinc-800/80 bg-zinc-950/40 backdrop-blur-md px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-black text-lg shadow-[0_0_20px_rgba(124,58,237,0.4)]">
            ⚡
          </div>
          <span className="font-extrabold text-lg tracking-tight text-white">DevPulse</span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Krishna4907/DevPulse"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors hidden sm:flex items-center gap-1.5"
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            <span>GitHub</span>
          </a>

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all active:scale-95 cursor-pointer"
          >
            {loading ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-16 pb-20 px-6 max-w-5xl mx-auto text-center flex flex-col items-center">
        {/* Hackathon Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold mb-8 animate-fadeIn">
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
          <span>Built for Razorpay Buildathon 2026</span>
        </div>

        {/* Hero Heading */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.1] mb-6">
          Smart Collaboration for <span className="bg-gradient-to-r from-violet-400 via-purple-300 to-indigo-300 bg-clip-text text-transparent">Student Teams</span>
        </h1>

        {/* Hero Subheading */}
        <p className="text-base sm:text-xl text-zinc-400 max-w-2xl leading-relaxed mb-10">
          DevPulse assigns tasks based on skill level, tracks learning in real-time, and uses AI to unblock developers instantly.
        </p>

        {/* Hero CTA Button */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="group relative flex items-center justify-center gap-3 rounded-2xl bg-[#7F77DD] hover:bg-[#6D65CB] px-8 py-4 text-base font-bold text-white shadow-[0_0_35px_rgba(127,119,221,0.4)] transition-all active:scale-98 cursor-pointer w-full sm:w-auto"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                <span>Sign in with GitHub</span>
                <span className="text-violet-200">→</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 rounded-xl max-w-md">
            {error}
          </div>
        )}

        {/* Live Interface Preview Mockup */}
        <div className="mt-14 w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 sm:p-6 shadow-2xl backdrop-blur-xl text-left">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-rose-500/80" />
              <div className="h-3 w-3 rounded-full bg-amber-500/80" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
              <span className="text-xs text-zinc-500 font-mono ml-2">devpulse-workspace • live sync</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ● Webhook Active
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1 */}
            <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">OAuth2 Authentication</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold uppercase">SAFE</span>
              </div>
              <p className="text-[11px] text-zinc-400">Implement secure GitHub callback handler</p>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60">
                <span>Driver: Alex</span>
                <span className="text-emerald-400 font-semibold">Done ✓</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="p-3.5 rounded-xl bg-rose-950/10 border border-rose-500/30 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">PostgreSQL Vector Index</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">⚠️ Blocked</span>
              </div>
              <p className="text-[11px] text-zinc-400">Index lock contention during migration</p>
              <div className="p-2 rounded-lg bg-zinc-950 border border-violet-500/30 text-[10px] text-emerald-300 font-mono">
                ✨ AI: Use CONCURRENTLY parameter
              </div>
            </div>

            {/* Card 3 */}
            <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">Team Chat & Presence</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-semibold uppercase">STRETCH</span>
              </div>
              <p className="text-[11px] text-zinc-400">Real-time WebSocket message broker</p>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60">
                <span>Driver: Maya</span>
                <span className="text-blue-400 font-semibold">In Progress</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section (3 Cards) */}
      <section className="relative z-10 py-20 px-6 max-w-6xl mx-auto w-full">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Engineered for Modern Hackathon Teams
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base mt-2">
            Every feature is calibrated to maximize team learning without sacrificing delivery speed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 hover:border-violet-500/40 p-6 rounded-2xl backdrop-blur-sm transition-all flex flex-col gap-3 group">
            <div className="h-12 w-12 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-2xl mb-1 shadow-[0_0_15px_rgba(124,58,237,0.2)]">
              ⚡
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-violet-300 transition-colors">
              Smart Task Assignment
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Our explore/exploit algorithm matches tasks to members based on skill level — ensuring everyone learns while the project moves forward.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 hover:border-indigo-500/40 p-6 rounded-2xl backdrop-blur-sm transition-all flex flex-col gap-3 group">
            <div className="h-12 w-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-2xl mb-1 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              🔗
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
              Git-Powered Board
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Push a commit with a task ID and your Kanban card moves automatically. Merge a PR and your skill map updates. Zero manual work.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 hover:border-purple-500/40 p-6 rounded-2xl backdrop-blur-sm transition-all flex flex-col gap-3 group">
            <div className="h-12 w-12 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-2xl mb-1 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
              🤖
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
              AI Blocker Diagnosis
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Stuck on a bug? Raise a blocker and AI diagnoses the top 3 causes with a concrete fix in under 2 seconds.
            </p>
          </div>
        </div>
      </section>

      {/* How it works section (4 steps) */}
      <section className="relative z-10 py-20 px-6 max-w-5xl mx-auto w-full border-t border-zinc-800/60">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            How DevPulse Works
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base mt-2">
            A frictionless flow from ideation to calibrated production code.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              step: '1',
              title: 'Create & Tag',
              desc: 'Create project + tag tech stack',
            },
            {
              step: '2',
              title: 'Team Calibration',
              desc: 'Team joins + declares skills',
            },
            {
              step: '3',
              title: 'Smart Matching',
              desc: 'AI assigns tasks by skill match',
            },
            {
              step: '4',
              title: 'Automated Git Sync',
              desc: 'Code → board updates automatically',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-zinc-950/60 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3 relative overflow-hidden"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 text-violet-300 font-mono font-bold text-sm border border-violet-500/30">
                {item.step}
              </div>
              <h4 className="text-sm font-bold text-white">{item.title}</h4>
              <p className="text-xs text-zinc-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-800/80 bg-zinc-950/60 py-8 px-6 text-center text-xs text-zinc-500">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-medium text-zinc-400">
            Built for <span className="text-violet-400 font-semibold">Razorpay Buildathon 2026</span>
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/Krishna4907/DevPulse"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub Repository
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
