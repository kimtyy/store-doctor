"use client";

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { loadPaymentWidget, ANONYMOUS, PaymentWidgetInstance } from '@tosspayments/payment-widget-sdk';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || 'test_ck_D53w41Gb827ZaPz5o5q3oEqZJaWx';

const PLAN_DETAILS = {
  basic: { name: 'Basic', price: 9900, description: '1인 매장 및 기초 장부 자동화' },
  pro: { name: 'Pro', price: 19900, description: '복수 매장 통합 및 정밀 손익 보고서' },
  premium: { name: 'Premium', price: 29900, description: 'AI 심화 컨설팅 및 1:1 세무사 검증 연동' }
};

type PlanKey = 'basic' | 'pro' | 'premium';

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPlan = (searchParams.get('plan') || 'basic') as PlanKey;

  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(initialPlan);
  const [loading, setLoading] = useState(true);
  const [paymentWidget, setPaymentWidget] = useState<PaymentWidgetInstance | null>(null);
  const [paymentMethodsWidget, setPaymentMethodsWidget] = useState<any>(null);

  const errorParam = searchParams.get('error');
  const errorMessage = searchParams.get('message');

  // 1. 사용자 세션 체크 (비로그인 상태도 허용)
  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
      }
      setLoading(false);
    }
    checkUser();
  }, [supabase]);

  // 2. 토스 결제위젯 초기화 (비로그인의 경우 ANONYMOUS 키 사용)
  useEffect(() => {
    if (loading) return;

    async function initWidget() {
      try {
        const customerKey = user ? user.id : ANONYMOUS;
        const widget = await loadPaymentWidget(TOSS_CLIENT_KEY, customerKey);
        
        setPaymentWidget(widget);
      } catch (err) {
        console.error('Toss Payments widget load failed:', err);
      }
    }
    initWidget();
  }, [user, loading]);

  // 3. 결제수단 및 이용약관 렌더링 (플랜 선택 가격 변화 시 반영)
  useEffect(() => {
    if (!paymentWidget) return;

    const amount = PLAN_DETAILS[selectedPlan].price;

    // 결제 수단 렌더링
    const methodsWidget = paymentWidget.renderPaymentMethods(
      '#payment-method',
      { value: amount },
      { variantKey: 'DEFAULT' }
    );

    // 이용약관 렌더링
    paymentWidget.renderAgreement('#agreement', { variantKey: 'DEFAULT' });

    setPaymentMethodsWidget(methodsWidget);
  }, [paymentWidget, selectedPlan]);

  // 결제 요청
  const handlePaymentRequest = async () => {
    // 비로그인 사용자라면 로그인 페이지로 이동 (리다이렉트 지점을 현재 플랜 정보와 함께 주입)
    if (!user) {
      const redirectPath = encodeURIComponent(`/payment?plan=${selectedPlan}`);
      router.push(`/login?redirect=${redirectPath}`);
      return;
    }

    if (!paymentWidget) return;

    try {
      const planDetail = PLAN_DETAILS[selectedPlan];
      const orderId = `order_${user.id.slice(0, 8)}_${Date.now()}`;

      await paymentWidget.requestPayment({
        orderId,
        orderName: `매장닥터 ${planDetail.name} 플랜 구독`,
        customerEmail: user.email,
        customerName: user.user_metadata?.name || '매장 대표님',
        successUrl: `${window.location.origin}/api/payment/confirm?plan=${selectedPlan}`,
        failUrl: `${window.location.origin}/payment?plan=${selectedPlan}&error=true&message=결제가+취소되었거나+실패했습니다.`,
      });
    } catch (err) {
      console.error('Payment request failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#010103] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-medium">결제 환경을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#010103] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-[#0a0a0f] border border-[#1a1a24] rounded-2xl p-6 sm:p-10 shadow-2xl">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            매장닥터 구독 플랜 결제
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            필요한 비즈니스 규모에 맞게 최적의 플랜을 활성화하세요.
          </p>
        </div>

        {errorParam && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <i className="bi bi-exclamation-triangle-fill text-red-400 text-lg mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-400">결제 실패</h4>
              <p className="text-xs text-red-400/80 mt-1">{errorMessage || '알 수 없는 오류가 발생했습니다. 다시 시도해 주세요.'}</p>
            </div>
          </div>
        )}

        {/* ── 요금제 선택기 ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {(Object.keys(PLAN_DETAILS) as PlanKey[]).map((key) => {
            const plan = PLAN_DETAILS[key];
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
                    <i className="bi bi-check-lg text-black text-xs font-bold" />
                  </div>
                )}
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">{plan.name}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{plan.description}</p>
                <div className="mt-4">
                  <span className="text-lg font-extrabold text-white">₩{plan.price.toLocaleString()}</span>
                  <span className="text-xs text-gray-500"> / 월</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── 토스 결제위젯 영역 ── */}
        <div className="bg-[#0c0c12] rounded-xl border border-[#1a1a24] p-4 sm:p-6 mb-8">
          <div id="payment-method" className="w-full min-h-[250px]" />
          <div className="border-t border-[#1a1a24] my-6" />
          <div id="agreement" className="w-full" />
        </div>

        {/* ── 결제하기 버튼 ── */}
        <button
          onClick={handlePaymentRequest}
          disabled={!paymentWidget}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold rounded-xl transition-all shadow-[0_4px_20px_rgba(16,185,129,0.2)] disabled:opacity-50 disabled:cursor-not-allowed text-base"
        >
          {PLAN_DETAILS[selectedPlan].price.toLocaleString()}원 결제하기
        </button>

        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/')}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
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
    <Suspense fallback={
      <div className="min-h-screen bg-[#010103] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-medium">로딩 중...</p>
        </div>
      </div>
    }>
      <PaymentContent />
    </Suspense>
  );
}
