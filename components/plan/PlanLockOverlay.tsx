'use client';

import React from 'react';
import Link from 'next/link';
import { PlanId, PLANS } from '@/lib/plans';

function LockIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

interface PlanLockOverlayProps {
  requiredPlan: 'basic' | 'pro' | 'premium';
  title?: string;
  description?: string;
  userRole?: string | null;
  currentPlan?: PlanId;
  compact?: boolean;
}

export function PlanLockOverlay({
  requiredPlan,
  title,
  description,
  userRole = 'owner',
  currentPlan = 'free',
  compact = false,
}: PlanLockOverlayProps) {
  const planName = PLANS[requiredPlan].name;
  const planPrice = PLANS[requiredPlan].price.toLocaleString();
  const defaultTitle = `${planName} 플랜 전용 분석`;
  const defaultDescription = `월 ${planPrice}원으로 매장의 숨은 이익과 상세 분석을 확인해 보세요.`;

  const isOwner = userRole === 'owner';

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/70 backdrop-blur-[3px] p-4 text-center rounded-xl dark:bg-zinc-950/70 border border-amber-200/50 dark:border-amber-800/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 mb-2 shadow-sm">
        <LockIcon className="h-5 w-5" />
      </div>
      <h3 className={`font-semibold text-zinc-900 dark:text-zinc-100 ${compact ? 'text-sm' : 'text-base'}`}>
        {title || defaultTitle}
      </h3>
      <p className={`mt-1 text-zinc-600 dark:text-zinc-400 max-w-sm ${compact ? 'text-xs' : 'text-sm'}`}>
        {description || defaultDescription}
      </p>

      <div className="mt-3">
        {isOwner ? (
          <Link
            href="/payment"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-indigo-700 transition"
          >
            {planName} 플랜으로 시작하기
          </Link>
        ) : (
          <span className="inline-flex items-center rounded-lg bg-zinc-200 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            대표 계정에 플랜 변경을 요청해 주세요
          </span>
        )}
      </div>
    </div>
  );
}
