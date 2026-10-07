'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../utils/supabase/client';
import BottomTabNav from '../../components/BottomTabNav';

export default function SettingsPage() {
  const router = useRouter();
  const [deleteDate, setDeleteDate] = useState('');
  const [deletingDay, setDeletingDay] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [ownerSalary, setOwnerSalary] = useState<number | ''>('');
  const [loanRepayment, setLoanRepayment] = useState<number | ''>('');
  const [savingSettings, setSavingSettings] = useState(false);

  // 구독 관리 상태
  const [subscription, setSubscription] = useState<any>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    fetch('/api/stores/settings')
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          setOwnerSalary(data.data.owner_salary || '');
          setLoanRepayment(data.data.loan_repayment || '');
        }
      })
      .catch(() => {});

    fetch('/api/me/subscription')
      .then(res => res.json())
      .then(data => {
        setSubscription(data.subscription || null);
      })
      .catch(() => {})
      .finally(() => setLoadingSubscription(false));
  }, []);

  async function handleCancelSubscription() {
    setCancellingSubscription(true);
    setShowCancelModal(false);
    setMessage(null);
    try {
      const res = await fetch('/api/payment/cancel', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '해지 처리 실패');
      setMessage({ type: 'success', text: data.message || '구독이 정상적으로 해지되었습니다.' });
      const subRes = await fetch('/api/me/subscription');
      const subData = await subRes.json();
      setSubscription(subData.subscription || null);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '구독 해지 중 오류가 발생했습니다.' });
    } finally {
      setCancellingSubscription(false);
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setMessage(null);
    try {
      const res = await fetch('/api/stores/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_salary: Number(ownerSalary) || 0,
          loan_repayment: Number(loanRepayment) || 0
        })
      });
      if (!res.ok) throw new Error('저장 실패');
      setMessage({ type: 'success', text: '영업외 지출 설정이 저장되었습니다.' });
    } catch (err) {
      setMessage({ type: 'error', text: '설정 저장 중 오류가 발생했습니다.' });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleNormalize() {
    setNormalizing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/normalize', { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `서버 오류 (${res.status})`);
      setMessage({ type: 'success', text: body.message ?? '정규화 완료' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '정규화 실패' });
    } finally {
      setNormalizing(false);
    }
  }

  async function handleDeleteDay() {
    if (!deleteDate) return;
    setDeletingDay(true);
    setMessage(null);
    try {
      const res = await fetch('/api/data/delete-day', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: deleteDate }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `서버 오류 (${res.status})`);
      setMessage({ type: 'success', text: body.message ?? `${deleteDate} 삭제 완료` });
      setDeleteDate('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '삭제 실패' });
    } finally {
      setDeletingDay(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setMessage(null);
    setConfirmReset(false);
    try {
      const res = await fetch('/api/data/reset', { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `서버 오류 (${res.status})`);
      setMessage({ type: 'success', text: body.message ?? '전체 초기화 완료' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '초기화 실패' });
    } finally {
      setResetting(false);
    }
  }

  async function handleSignOut() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert('로그아웃 실패: ' + error.message);
    } else {
      router.push('/login');
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <h1 className="text-2xl font-bold text-slate-100">설정</h1>
        </div>
      </header>

      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
        <div className="mx-auto max-w-2xl space-y-6">

          {message ? (
            <div
              className={`rounded-2xl border p-4 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {/* 구독 및 정기결제 관리 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">💳 구독 및 정기결제 관리</h2>
                <p className="mt-1 text-xs text-slate-400">현재 이용 중인 플랜 및 자동결제·해지 관리</p>
              </div>
              {subscription && (
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    subscription.cancelled_at
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : subscription.status === 'past_due' || subscription.status === '연체'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {subscription.cancelled_at
                    ? '해지 예약'
                    : subscription.status === 'past_due' || subscription.status === '연체'
                    ? '연체 (재시도 중)'
                    : '구독 중'}
                </span>
              )}
            </div>

            {loadingSubscription ? (
              <p className="text-xs text-slate-500">구독 정보를 불러오는 중...</p>
            ) : subscription ? (
              <div className="space-y-3 pt-2 text-sm border-t border-slate-800/80">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">이용 중인 플랜</span>
                  <span className="font-bold text-white uppercase">{subscription.plan} 플랜</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">
                    {subscription.cancelled_at ? '이용 종료 예정일' : '다음 자동 결제일'}
                  </span>
                  <span className="text-slate-200">
                    {subscription.cancelled_at
                      ? new Date(subscription.expires_at).toLocaleDateString('ko-KR')
                      : subscription.next_billing_date
                      ? new Date(subscription.next_billing_date).toLocaleDateString('ko-KR')
                      : new Date(subscription.expires_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>

                {subscription.cancelled_at ? (
                  <div className="mt-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-2">
                    <p className="leading-relaxed">
                      자동 결제가 중단되었습니다. {new Date(subscription.expires_at).toLocaleDateString('ko-KR')}까지는 모든 프리미엄 기능을 정상적으로 이용하실 수 있습니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push('/payment')}
                      className="w-full py-2.5 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition cursor-pointer mt-1"
                    >
                      구독 다시 시작하기
                    </button>
                  </div>
                ) : (
                  <div className="pt-2">
                    {!showCancelModal ? (
                      <button
                        type="button"
                        onClick={() => setShowCancelModal(true)}
                        disabled={cancellingSubscription}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 py-3 text-xs font-semibold text-slate-400 hover:text-rose-400 hover:border-rose-900/50 transition cursor-pointer"
                      >
                        {cancellingSubscription ? '처리 중...' : '구독 해지하기'}
                      </button>
                    ) : (
                      <div className="p-4 rounded-2xl border border-rose-900/40 bg-rose-950/20 space-y-3">
                        <p className="text-xs text-rose-200 font-medium leading-relaxed">
                          정말 정기구독을 해지하시겠습니까? 해지 시 다음 결제일부터 자동 결제가 중단되며, 이미 결제하신 기간 종료일({new Date(subscription.expires_at).toLocaleDateString('ko-KR')})까지는 정상적으로 이용하실 수 있습니다.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowCancelModal(false)}
                            className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelSubscription}
                            disabled={cancellingSubscription}
                            className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 transition cursor-pointer"
                          >
                            {cancellingSubscription ? '해지 처리 중...' : '해지 확인'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="pt-2 text-xs text-slate-400 space-y-2 border-t border-slate-800/80">
                <p>활성화된 구독이 없습니다.</p>
                <button
                  type="button"
                  onClick={() => router.push('/payment')}
                  className="w-full py-3 bg-emerald-500 text-black font-bold rounded-2xl hover:bg-emerald-400 transition cursor-pointer"
                >
                  플랜 구독하러 가기
                </button>
              </div>
            )}
          </div>

          {/* 사용 가이드 */}
          <a
            href="/guide"
            className="block rounded-3xl border border-sky-800/40 bg-sky-950/20 p-6 hover:border-sky-700/60 transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-sky-200">📘 사용 가이드</h2>
                <p className="mt-1 text-xs text-sky-400/80">앱 주요 기능 및 영수증 촬영·스캔 꿀팁 다시보기</p>
              </div>
              <span className="text-sky-400 text-lg">→</span>
            </div>
          </a>

          {/* 고정비 관리 */}
          <a
            href="/settings/fixed-costs"
            className="block rounded-3xl border border-slate-800 bg-slate-900/90 p-6 hover:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">고정비 관리</h2>
                <p className="mt-1 text-xs text-slate-400">임대료·공과금 등 매월 자동 등록 고정비</p>
              </div>
              <span className="text-slate-500 text-lg">→</span>
            </div>
          </a>

          {/* 메뉴 관리 */}
          <a
            href="/settings/menu"
            className="block rounded-3xl border border-slate-800 bg-slate-900/90 p-6 hover:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">메뉴 관리</h2>
                <p className="mt-1 text-xs text-slate-400">메뉴 카테고리 등록 및 OCR 별칭 관리</p>
              </div>
              <span className="text-slate-500 text-lg">→</span>
            </div>
          </a>

          {/* 매입처 관리 */}
          <a
            href="/settings/vendors"
            className="block rounded-3xl border border-slate-800 bg-slate-900/90 p-6 hover:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">매입처 관리</h2>
                <p className="mt-1 text-xs text-slate-400">매입처 정식명 및 OCR 오인식 별칭 등록</p>
              </div>
              <span className="text-slate-500 text-lg">→</span>
            </div>
          </a>

          {/* 멤버 관리 */}
          <a
            href="/members"
            className="block rounded-3xl border border-slate-800 bg-slate-900/90 p-6 hover:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">👥 멤버 관리</h2>
                <p className="mt-1 text-xs text-slate-400">매장 직원 초대 및 권한 설정</p>
              </div>
              <span className="text-slate-500 text-lg">→</span>
            </div>
          </a>

          {/* 영업외 지출 설정 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">영업외 지출 설정</h2>
              <p className="mt-1 text-xs text-slate-400">월별 영업보고서의 순이익 계산에 반영됩니다.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">사장님 월 인건비</label>
                <div className="relative">
                  <input
                    type="number"
                    value={ownerSalary}
                    onChange={(e) => setOwnerSalary(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="예: 2000000"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 pr-8 text-base text-slate-100"
                  />
                  <span className="absolute right-3 top-3 text-slate-500">원</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">월 대출상환금</label>
                <div className="relative">
                  <input
                    type="number"
                    value={loanRepayment}
                    onChange={(e) => setLoanRepayment(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="예: 500000"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 pr-8 text-base text-slate-100"
                  />
                  <span className="absolute right-3 top-3 text-slate-500">원</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="w-full rounded-2xl bg-sky-700 px-6 py-4 text-base font-semibold text-white transition hover:bg-sky-600 disabled:opacity-40"
            >
              {savingSettings ? '저장 중...' : '저장하기'}
            </button>
          </div>

          {/* 데이터 정규화 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">데이터 정규화</h2>
              <p className="mt-1 text-xs text-slate-400">메뉴명·매입처명의 불필요한 공백을 제거하고 중복을 병합합니다.</p>
            </div>
            <button
              type="button"
              onClick={handleNormalize}
              disabled={normalizing}
              className="w-full rounded-2xl bg-sky-700 px-6 py-4 text-base font-semibold text-white transition hover:bg-sky-600 disabled:opacity-40"
            >
              {normalizing ? '정규화 중...' : '지금 실행'}
            </button>
          </div>

          {/* 특정 날짜 삭제 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">특정일 데이터 삭제</h2>
              <p className="mt-1 text-xs text-slate-400">선택한 날짜의 매출·매입 데이터를 삭제합니다</p>
            </div>

            <input
              type="date"
              value={deleteDate}
              onChange={(e) => setDeleteDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100"
            />

            <button
              type="button"
              onClick={handleDeleteDay}
              disabled={deletingDay || !deleteDate}
              className="w-full rounded-2xl bg-rose-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deletingDay ? '삭제 중...' : `${deleteDate || '--'} 삭제`}
            </button>
          </div>

          {/* 전체 초기화 */}
          <div className="rounded-3xl border border-rose-900/40 bg-slate-900/90 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-rose-400">전체 데이터 초기화</h2>
              <p className="mt-1 text-xs text-slate-400">모든 매출·매입 데이터를 영구 삭제합니다. 복구할 수 없습니다.</p>
            </div>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="w-full rounded-2xl border border-rose-700 bg-transparent px-6 py-4 text-base font-semibold text-rose-400 transition hover:bg-rose-950/60"
              >
                전체 초기화
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-rose-300 font-medium">정말 모든 데이터를 삭제할까요?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="flex-1 rounded-2xl border border-slate-700 bg-transparent py-3 text-sm font-semibold text-slate-400 transition hover:bg-slate-800"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex-1 rounded-2xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40"
                  >
                    {resetting ? '초기화 중...' : '삭제 확인'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 로그아웃 */}
          <div className="rounded-3xl border border-rose-500/30 bg-rose-500/5 p-6 hover:bg-rose-950/20 transition">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full text-center text-base font-semibold text-rose-400 hover:text-rose-300 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
