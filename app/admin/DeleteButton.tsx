'use client';

import { useState } from 'react';
import { deleteStore, extendSubscription, resolvePaymentAttempt, setPlanOverride, resetUsageCounters } from './actions';

export function DeleteStoreButton({ storeId, ownerId }: { storeId: string, ownerId: string | null }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!window.confirm('정말 삭제하시겠습니까?\n\n이 유저의 로그인 계정, 매장 정보, 모든 매출/매입 데이터가 영구 삭제되며 복구할 수 없습니다.')) return;
    
    try {
      setLoading(true);
      await deleteStore(storeId, ownerId);
    } catch (e: any) {
      alert(e.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="px-2 py-1 bg-rose-900/50 hover:bg-rose-600/80 text-rose-300 hover:text-white rounded text-xs transition border border-rose-800/50 whitespace-nowrap"
    >
      {loading ? '삭제중...' : '삭제'}
    </button>
  );
}

export function ExtendSubscriptionButton({ 
  userId, 
  userEmail, 
  months, 
  reason,
  onExtendSuccess
}: { 
  userId: string, 
  userEmail: string, 
  months: number,
  reason: string,
  onExtendSuccess?: () => void
}) {
  const [loading, setLoading] = useState(false);

  async function handleExtend() {
    // UI Level Validation
    if (!Number.isInteger(months) || months < 1 || months > 12) {
      alert('연장 기간은 1개월에서 12개월 사이의 정수만 가능합니다.');
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      alert('연장 사유를 입력해 주세요.');
      return;
    }

    if (!window.confirm(`${userEmail}님 구독을 ${months}개월 연장합니다.\n사유: ${trimmedReason}\n진행하시겠습니까?`)) return;
    
    try {
      setLoading(true);
      const res = await extendSubscription(userId, months, trimmedReason);
      if (res.success) {
        alert('성공적으로 연장되었습니다.');
        if (onExtendSuccess) {
          onExtendSuccess();
        }
      }
    } catch (e: any) {
      alert(e.message || '연장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExtend}
      disabled={loading}
      className="px-2 py-1 bg-emerald-950/50 hover:bg-emerald-600/80 text-emerald-300 hover:text-white rounded text-xs transition border border-emerald-800/50 whitespace-nowrap cursor-pointer disabled:opacity-50"
    >
      {loading ? '연장중...' : '연장'}
    </button>
  );
}

export function ExtendSubscriptionSection({ userId, userEmail }: { userId: string, userEmail: string }) {
  const [months, setMonths] = useState<number>(1);
  const [customInput, setCustomInput] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'custom') {
      setMonths(0); // 0 means custom input is active
    } else {
      setMonths(Number(val));
      setCustomInput('');
    }
  };

  const finalMonths = months === 0 ? (Number(customInput) || 0) : months;

  return (
    <div className="flex items-center gap-1.5 justify-center">
      <select
        value={months === 0 ? 'custom' : months}
        onChange={handleSelectChange}
        className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
      >
        <option value={1}>1개월</option>
        <option value={2}>2개월</option>
        <option value={3}>3개월</option>
        <option value={6}>6개월</option>
        <option value="custom">직접 입력</option>
      </select>

      {months === 0 && (
        <input
          type="number"
          min="1"
          max="12"
          placeholder="개월"
          value={customInput}
          onChange={(e) => {
            const val = e.target.value;
            // UI level check: block negative, float or values outside 1-12
            if (val === '') {
              setCustomInput('');
            } else {
              const numVal = Number(val);
              if (numVal >= 1 && numVal <= 12 && Number.isInteger(numVal)) {
                setCustomInput(val);
              }
            }
          }}
          className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-1.5 py-0.5 text-xs w-14 focus:outline-none focus:ring-1 focus:ring-sky-500 text-center"
        />
      )}

      <input
        type="text"
        placeholder="연장 사유"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />

      <ExtendSubscriptionButton 
        userId={userId} 
        userEmail={userEmail} 
        months={finalMonths} 
        reason={reason}
        onExtendSuccess={() => setReason('')}
      />
    </div>
  );
}

export function ResolvePaymentAttemptButton({
  attemptId,
  orderId,
  status,
  createdAt,
}: {
  attemptId: string;
  orderId?: string;
  status?: string;
  createdAt?: string;
}) {
  const [loading, setLoading] = useState(false);

  const isRecentProcessing =
    status === 'processing' &&
    Boolean(createdAt) &&
    Date.now() - new Date(createdAt!).getTime() < 30 * 60 * 1000;

  async function handleResolve() {
    if (isRecentProcessing) {
      alert('결제 진행 중일 수 있어 30분 후 해제 가능');
      return;
    }

    const orderHint = orderId ? ` (${orderId})` : '';
    if (
      !window.confirm(
        `토스 상점관리자에서 이 orderId 의 결제 여부를 먼저 확인하셨나요?${orderHint}\n\n이 결제 대기 상태를 해제하시겠습니까?\n해제하면 사용자가 다시 결제할 수 있습니다.`
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      const result = await resolvePaymentAttempt(attemptId);
      if (result && result.success === false) {
        alert(result.message || '이미 해제되었거나 상태가 바뀌었습니다. 새로고침 해 주세요.');
        return;
      }
      alert('결제 대기 상태가 정상적으로 해제되었습니다.');
    } catch (e: any) {
      alert(e.message || '해제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleResolve}
      disabled={loading}
      title={isRecentProcessing ? '결제 진행 중일 수 있어 30분 후 해제 가능' : undefined}
      className={`px-2.5 py-1 rounded text-xs transition border whitespace-nowrap cursor-pointer disabled:opacity-50 ${
        isRecentProcessing
          ? 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800'
          : 'bg-amber-600/30 hover:bg-amber-600 text-amber-300 hover:text-white border-amber-500/50'
      }`}
    >
      {loading ? '해제중...' : '대기 해제'}
    </button>
  );
}

export function PlanOverrideSection({
  userId,
  storeName,
  currentOverride,
}: {
  userId: string;
  storeName: string;
  currentOverride: string | null;
}) {
  const [selectedPlan, setSelectedPlan] = useState<string>(currentOverride || '');
  const [loading, setLoading] = useState(false);

  async function handleApply() {
    if (selectedPlan === (currentOverride || '')) {
      alert('현재 설정과 동일합니다.');
      return;
    }

    const planLabel = selectedPlan ? selectedPlan.toUpperCase() : '해제 (구독 기준)';
    if (!window.confirm(`[${storeName}] 플랜 오버라이드를 "${planLabel}"(으)로 적용하시겠습니까?`)) {
      return;
    }

    try {
      setLoading(true);
      await setPlanOverride(userId, selectedPlan || null, '관리자 QA UI 설정');
      alert(`[${storeName}] 플랜 오버라이드가 적용되었습니다.`);
    } catch (e: any) {
      alert(e.message || '오버라이드 적용 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selectedPlan}
        onChange={(e) => setSelectedPlan(e.target.value)}
        disabled={loading}
        className="bg-slate-800 text-slate-200 border border-slate-700 text-xs rounded px-2 py-1 focus:outline-none focus:border-sky-500"
      >
        <option value="">(기본/구독연동)</option>
        <option value="free">Free</option>
        <option value="basic">Basic</option>
        <option value="pro">Pro</option>
        <option value="premium">Premium</option>
      </select>
      <button
        onClick={handleApply}
        disabled={loading || selectedPlan === (currentOverride || '')}
        className="px-2 py-1 bg-sky-700/60 hover:bg-sky-600 text-sky-200 hover:text-white rounded text-xs transition border border-sky-600/50 disabled:opacity-40 whitespace-nowrap cursor-pointer"
      >
        {loading ? '...' : '적용'}
      </button>
    </div>
  );
}

export function UsageResetButton({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (!window.confirm(`[${storeName}] 당월 사용량(OCR/AI)을 0으로 리셋하시겠습니까?`)) {
      return;
    }

    try {
      setLoading(true);
      await resetUsageCounters(storeId);
      alert(`[${storeName}] 당월 사용량이 0으로 초기화되었습니다.`);
    } catch (e: any) {
      alert(e.message || '사용량 리셋 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleReset}
      disabled={loading}
      className="px-2 py-1 bg-amber-950/50 hover:bg-amber-600/80 text-amber-300 hover:text-white rounded text-xs transition border border-amber-800/50 whitespace-nowrap cursor-pointer disabled:opacity-50"
    >
      {loading ? '...' : '리셋'}
    </button>
  );
}
