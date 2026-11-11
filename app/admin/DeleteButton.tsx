'use client';

import { useState } from 'react';
import { deleteStore, extendSubscription, resolvePaymentAttempt } from './actions';

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
  status,
  createdAt,
}: {
  attemptId: string;
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

    if (!window.confirm('이 결제 대기 상태를 해제하시겠습니까?\n\n해제하면 사용자가 다시 결제할 수 있습니다.')) return;

    try {
      setLoading(true);
      await resolvePaymentAttempt(attemptId);
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
