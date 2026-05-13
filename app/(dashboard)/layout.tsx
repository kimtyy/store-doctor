import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import BottomTabNav from '@/components/BottomTabNav';

export const metadata: Metadata = {
  title: '대시보드 - 매장닥터',
  description: '매장 진단 및 분석 대시보드',
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-sky-400">
            📊 매장닥터
          </Link>
          <p className="text-xs text-slate-400">마감 진단 시스템</p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl">{children}</main>
      <BottomTabNav />
    </>
  );
}
