"use client";

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';
import { BILLING_PLANS, PlanKey } from '@/lib/billing';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPlan = (searchParams.get('plan') || 'basic') as PlanKey;

  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(
    BILLING_PLANS[initialPlan] ? initialPlan : 'basic'
  );
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToRecurring, setAgreedToRecurring] = useState(false);
  const [errorMessageState, setErrorMessageState] = useState<string | null>(null);

  // role 체크: owner만 결제 페이지 접근 가능
  const [role, setRole] = useState<string | null | 'loading'>('loading');
  const [hasServerPending, setHasServerPending] = useState(false);

  useEffect(() => {
    fetch('/api/me/role')
      .then((r) => r.json())
      .then((d) => setRole(d.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const noticeParam = searchParams.get('notice');
  const isPaymentPending = noticeParam === 'payment_pending' || hasServerPending;
  const errorParam = searchParams.get('error');
  const tossCode = searchParams.get('code');
  const tossMessage = searchParams.get('message');

  // 토스 또는 URL 쿼리의 message/code는 화면에 직접 출력하지 않고 console에만 기록 (문구 변조 방지)
  useEffect(() => {
    if (tossCode || tossMessage) {
      console.warn(`[Payment] URL query parameters received: code=${tossCode || 'none'}, message=${tossMessage || 'none'}`);
    }
  }, [tossCode, tossMessage]);

  const ERROR_MESSAGES: Record<string, string> = {
    card_auth_failed: '카드 등록 및 인증에 실패했습니다. 다시 시도해 주세요.',
    payment_failed: '결제가 완료되지 않았습니다. 다시 시도해 주세요.',
    payment_cancelled: '결제가 취소되었습니다. 다시 시도해 주세요.',
    missing_params: '카드 등록 및 결제 필수 정보가 누락되었습니다.',
    server_error: '결제 처리 중 서버 오류가 발생했습니다. 관리자에게 문의해 주세요.',
  };

  const DEFAULT_ERROR_MESSAGE = '결제가 완료되지 않았습니다. 다시 시도해 주세요.';

  const resolvedErrorMessage = errorParam
    ? ERROR_MESSAGES[errorParam] || DEFAULT_ERROR_MESSAGE
    : null;

  // 1. 사용자 세션 체크 (비로그인 시 로그인 페이지로 리디렉션) 및 서버 결제 대기 상태 확인
  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setLoading(false);

        // 서버 payment_attempts 테이블에서 현재 사용자의 pending 또는 processing 행 확인 (RLS: 본인 행만 조회)
        try {
          const { data: activeAttempt, error: attemptErr } = await supabase
            .from('payment_attempts')
            .select('id, status')
            .eq('user_id', user.id)
            .in('status', ['pending', 'processing'])
            .limit(1)
            .maybeSingle();

          if (!attemptErr && activeAttempt) {
            setHasServerPending(true);
          }
        } catch (attemptCheckErr: any) {
          // 테이블 미생성(마이그레이션 전) 또는 조회 오류 시 URL notice 파라미터로만 폴백
          console.warn('[Payment] Failed to check payment_attempts on server:', attemptCheckErr?.name || 'Error', attemptCheckErr?.message || String(attemptCheckErr));
        }
      } else {
        const redirectPath = encodeURIComponent(`/payment?plan=${selectedPlan}`);
        router.replace(`/login?redirect=${redirectPath}`);
      }
    }
    checkUser();
  }, [supabase, selectedPlan, router]);

  // 2. 카드 등록 및 빌링 인증창 호출
  const handleStartBilling = async () => {
    if (isPaymentPending) {
      return;
    }

    if (!user) {
      const redirectPath = encodeURIComponent(`/payment?plan=${selectedPlan}`);
      router.push(`/login?redirect=${redirectPath}`);
      return;
    }

    if (!agreedToRecurring) {
      setErrorMessageState('정기결제 유의사항 및 매월 자동결제 동의가 필요합니다.');
      return;
    }

    if (!TOSS_CLIENT_KEY) {
      console.error('NEXT_PUBLIC_TOSS_CLIENT_KEY 환경변수가 설정되지 않았습니다.');
      setErrorMessageState('결제 환경변수(NEXT_PUBLIC_TOSS_CLIENT_KEY)가 설정되지 않았습니다. 관리자에게 문의해 주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessageState(null);

      // 사용자 전용 customerKey 조회 (Supabase user.id 기반 고유·난수화 키)
      const res = await fetch('/api/payment/customer-key');
      const data = await res.json();
      if (!res.ok || !data.customerKey) {
        throw new Error(data.error || '고객 식별 키 생성에 실패했습니다.');
      }
      const customerKey = data.customerKey;

      // 토스페이먼츠 SDK v2 초기화 및 결제창 인스턴스 생성
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey });

      const successUrl = `${window.location.origin}/api/payment/confirm?plan=${selectedPlan}`;
      const failUrl = `${window.location.origin}/payment?plan=${selectedPlan}&error=card_auth_failed`;

      // 토스 빌링 인증창 호출
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl,
        failUrl,
      });
    } catch (err: any) {
      console.error('Billing auth error:', err?.name || 'Error', err?.message || String(err));
      if (err?.code !== 'USER_CANCEL') {
        setErrorMessageState(err?.message || '카드 등록 요청 중 오류가 발생했습니다. 다시 시도해 주세요.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || role === 'loading') {
    return (
      <div className="min-h-screen bg-[#010103] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-medium">결제 환경을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 비로그인 사용자
  if (!user) {
    return (
      <div className="min-h-screen bg-[#010103] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-medium">로그인 페이지로 이동 중...</p>
        </div>
      </div>
    );
  }

  // 매장 미등록 신규 가입자
  if (!role) {
    return (
      <div className="min-h-screen bg-[#010103] flex items-center justify-center text-white px-4">
        <div className="max-w-sm w-full bg-[#0a0a0f] border border-[#1a1a24] rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">🏪</div>
          <h2 className="text-lg font-bold text-white">매장 등록 필요</h2>
          <p className="text-sm text-gray-400">
            결제를 진행하려면 먼저 매장 정보를 등록해야 합니다.
          </p>
          <button
            onClick={() => router.push(`/onboarding?plan=${selectedPlan}`)}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold rounded-xl transition hover:opacity-90 cursor-pointer"
          >
            매장 등록하러 가기
          </button>
        </div>
      </div>
    );
  }

  // manager 또는 staff 계정 접근 제한
  if (role !== 'owner') {
    return (
      <div className="min-h-screen bg-[#010103] flex items-center justify-center text-white px-4">
        <div className="max-w-sm w-full bg-[#0a0a0f] border border-[#1a1a24] rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h2 className="text-lg font-bold text-white">접근 제한</h2>
          <p className="text-sm text-gray-400">
            결제 및 구독 관리는{' '}
            <span className="text-emerald-400 font-semibold">대표 계정</span>만
            접근 가능합니다.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold rounded-xl transition hover:opacity-90 cursor-pointer"
          >
            대시보드로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const currentPlan = BILLING_PLANS[selectedPlan];

  return (
    <div className="min-h-screen bg-[#010103] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-[#0a0a0f] border border-[#1a1a24] rounded-2xl p-6 sm:p-10 shadow-2xl">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            매장닥터 정기구독 플랜 선택
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            원하시는 플랜을 선택하고 카드를 등록하여 매장닥터의 전문 경영 분석을 시작하세요.
          </p>
        </div>

        {/* 결제 확인 중 노란색/중립 안내 배너 */}
        {isPaymentPending && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-amber-400 font-bold text-lg">⏳</span>
            <div>
              <h4 className="text-sm font-semibold text-amber-400">결제 확인 중</h4>
              <p className="text-xs text-amber-300/90 mt-1 leading-relaxed">
                결제 확인이 지연되고 있습니다. 확인 후 결제가 완료된 경우 구독을 반영하거나 취소해 드립니다. 다시 결제하지 마시고 잠시 후 확인해 주세요. 문의: 031-5175-8887
              </p>
            </div>
          </div>
        )}

        {/* 결제 및 카드 등록 실패 빨간색 배너 */}
        {!isPaymentPending && resolvedErrorMessage && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-red-400 font-bold text-lg">⚠️</span>
            <div>
              <h4 className="text-sm font-semibold text-red-400">결제 및 카드 등록 실패</h4>
              <p className="text-xs text-red-400/80 mt-1">{resolvedErrorMessage}</p>
            </div>
          </div>
        )}

        {errorMessageState && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-red-400 font-bold text-lg">⚠️</span>
            <div>
              <h4 className="text-sm font-semibold text-red-400">알림</h4>
              <p className="text-xs text-red-400/80 mt-1">{errorMessageState}</p>
            </div>
          </div>
        )}

        {!TOSS_CLIENT_KEY && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-amber-400 font-bold text-lg">⚠️</span>
            <div>
              <h4 className="text-sm font-semibold text-amber-400">결제 설정 오류</h4>
              <p className="text-xs text-amber-300/80 mt-1">NEXT_PUBLIC_TOSS_CLIENT_KEY 환경변수가 설정되지 않아 결제를 진행할 수 없습니다.</p>
            </div>
          </div>
        )}

        {/* ── 요금제 선택기 ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {(Object.keys(BILLING_PLANS) as PlanKey[]).map((key) => {
            const plan = BILLING_PLANS[key];
            const isSelected = selectedPlan === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedPlan(key)}
                className={`relative text-left p-5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-[#101b17] border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'bg-[#0f0f15] border-[#1d1d28] hover:border-gray-700'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <span className="text-black text-xs font-bold">✓</span>
                  </div>
                )}
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">{plan.name}</h3>
                <p className="text-xs text-gray-400 mt-2 line-clamp-3 leading-relaxed">{plan.description}</p>
                <div className="mt-5 pt-3 border-t border-white/5">
                  <span className="text-lg font-extrabold text-white">₩{plan.price.toLocaleString()}</span>
                  <span className="text-xs text-gray-500"> / 월</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── 정기결제 안내 박스 ── */}
        <div className="bg-[#0c0c12] rounded-xl border border-[#1a1a24] p-5 sm:p-6 mb-8 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-emerald-400 text-lg mt-0.5">ℹ️</span>
            <div>
              <h4 className="text-sm font-bold text-white">정기구독 및 자동결제 안내</h4>
              <p className="text-xs text-emerald-400 font-medium mt-1">
                매월 {currentPlan.price.toLocaleString()}원이 자동 결제되며, 마이페이지에서 언제든 해지할 수 있습니다.
              </p>
              <ul className="text-xs text-gray-400 mt-2 space-y-1 list-disc pl-4">
                <li>첫 결제는 카드 등록 직후 진행되며, 이후 매월 결제일에 자동으로 갱신됩니다.</li>
                <li>언제든지 마이페이지(설정)에서 해지하실 수 있으며, 해지 시 다음 결제일부터 청구되지 않고 남은 이용 기간까지 정상 이용이 가능합니다.</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-[#1a1a24] pt-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreedToRecurring}
                onChange={(e) => setAgreedToRecurring(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-xs sm:text-sm text-gray-200 font-medium">
                매월 자동 결제 및 정기결제 유의사항을 확인하였으며 이에 동의합니다. <span className="text-emerald-400">(필수)</span>
              </span>
            </label>
          </div>
        </div>

        {/* ── 카드 등록하고 구독 시작 버튼 ── */}
        <button
          onClick={handleStartBilling}
          disabled={!TOSS_CLIENT_KEY || !agreedToRecurring || isSubmitting || isPaymentPending}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold rounded-xl transition-all shadow-[0_4px_20px_rgba(16,185,129,0.2)] disabled:opacity-40 disabled:cursor-not-allowed text-base cursor-pointer"
        >
          {isPaymentPending
            ? '결제 확인 진행 중'
            : isSubmitting
            ? '카드 등록창 준비 중...'
            : '카드 등록하고 구독 시작'}
        </button>

        {isPaymentPending && (
          <p className="text-center text-xs text-amber-400/90 mt-2 font-medium">
            확인이 끝날 때까지 결제를 진행할 수 없습니다.
          </p>
        )}

        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/')}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
          >
            결제 취소하고 홈으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#010103] flex items-center justify-center text-white">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 font-medium">로딩 중...</p>
          </div>
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
