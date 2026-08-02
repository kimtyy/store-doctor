'use client';

import { useRouter } from 'next/navigation';
import GuideSlides from '@/components/GuideSlides';
import BottomTabNav from '@/components/BottomTabNav';

export default function GuidePage() {
  const router = useRouter();

  async function handleComplete() {
    try {
      await fetch('/api/stores/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_guide_seen: true }),
      });
    } catch {}
    router.push('/dashboard');
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-slate-400 hover:text-slate-100 text-sm font-medium"
            >
              ← 뒤로
            </button>
            <h1 className="text-xl font-bold text-slate-100">📘 사용 가이드</h1>
          </div>
        </div>
      </header>

      <main className="min-h-screen bg-slate-950 px-4 py-6 pb-32">
        <div className="mx-auto max-w-2xl min-h-[500px]">
          <GuideSlides onComplete={handleComplete} completeText="홈으로 이동" />
        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
