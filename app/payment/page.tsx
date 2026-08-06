"use client";

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { loadPaymentWidget, ANONYMOUS, PaymentWidgetInstance } from '@tosspayments/payment-widget-sdk';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

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
  // customerKey가 바뀔 때마다(비로그인 → 로그인) 증가시켜, 위젯 컨테이너 DOM을
  // 완전히 새로 마운트하기 위한 key로 사용한다. (같은 DOM 노드를 여러 위젯
  // 인스턴스가 재사용하면 토스 SDK 내부 상태가 꼬여 결제 버튼이 무반응이 됨)
  const [widgetInstanceKey, setWidgetInstanceKey] = useState(0);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  // role 체크: owner만 결제 페이지 접근 가능
  const [role, setRole] = useState<string | null | 'loading'>('loading');

  useEffect(() => {
    fetch('/api/me/role')
      .then((r) => r.json())
      .then((d) => setRole(d.role ?? null))
      .catch(() => setRole(null));
  }, []);

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
        // 기존 위젯 인스턴스와 렌더 상태를 초기화하여 재마운트 시 캐시 충돌 방지.
        // customerKey가 바뀌는 시점(비로그인 → 로그인)마다 컨테이너 DOM 자체를
        // 새로 만들도록 key를 증가시켜, 이전 위젯 인스턴스가 점유했던 DOM 노드를
        // 새 위젯이 재사용하지 않게 한다.
        setPaymentWidget(null);
        setPaymentMethodsWidget(null);
        setWidgetError(null);

        if (!TOSS_CLIENT_KEY) {
          console.error('NEXT_PUBLIC_TOSS_CLIENT_KEY 환경변수가 설정되지 않았습니다.');
          setWidgetError('결제 위젯 설정 오류가 발생했습니다. 관리자에게 문의해 주세요.');
          return;
        }

        const customerKey = user ? user.id : ANONYMOUS;
        const widget = await loadPaymentWidget(TOSS_CLIENT_KEY, customerKey);

        setWidgetInstanceKey((k) => k + 1);
        setPaymentWidget(widget);
      } catch (err) {
        console.error('Toss Payments widget load failed:', err);
        setWidgetError('결제 위젯을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      }
    }
    initWidget();
  }, [user, loading]);

  // 3. 결제수단 및 이용약관 렌더링 (플랜 선택 가격 변화 및 widget 재생성 시 반영)
  useEffect(() => {
    if (!paymentWidget) return;

    const amount = PLAN_DETAILS[selectedPlan].price;

    // SDK 중복 렌더링 에러 방지를 위해 기존 결제 위젯 DOM 컨테이너를 강제로 비움
    const methodContainer = document.getElementById('payment-method');
    if (methodContainer) methodContainer.innerHTML = '';
    const agreementContainer = document.getElementById('agreement');
    if (agreementContainer) agreementContainer.innerHTML = '';

    try {
      // 결제 수단 렌더링
      const methodsWidget = paymentWidget.renderPaymentMethods(
        '#payment-method',
        { value: amount },
        { variantKey: 'DEFAULT' }
      );

      // 이용약관 렌더링
      paymentWidget.renderAgreement('#agreement', { variantKey: 'DEFAULT' });

      setPaymentMethodsWidget(methodsWidget);
      setWidgetError(null);
    } catch (err) {
      console.error('Toss widget render methods failed:', err);
      setPaymentMethodsWidget(null);
      setWidgetError('결제 수단을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    }
  }, [paymentWidget, selectedPlan]);

  // 결제 요청
  const handlePaymentRequest = async () => {
    // 비로그인 사용자라면 로그인 페이지로 이동 (리다이렉트 지점을 현재 플랜 정보와 함께 주입)
    if (!user) {
      const redirectPath = encodeURIComponent(`/payment?plan=${selectedPlan}`);
      router.push(`/login?redirect=${redirectPath}`);
      return;
    }

    if (!paymentWidget || !paymentMethodsWidget) return;

    try {
      setWidgetError(null);
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
      setWidgetError('결제 요청 중 오류가 발생했습니다. 다시 시도해 주세요.');
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

  // owner가 아닌 경우 접근 차단
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
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold rounded-xl transition hover:opacity-90"
          >
            대시보드로 돌아가기
          </button>
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

        {widgetError && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <i className="bi bi-exclamation-triangle-fill text-red-400 text-lg mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-400">결제 위젯 오류</h4>
              <p className="text-xs text-red-400/80 mt-1">{widgetError}</p>
            </div>
          </div>
        )}

        {/* ── 토스 결제위젯 영역 ──
            key={widgetInstanceKey}: customerKey가 바뀌어(비로그인 → 로그인)
            새 위젯 인스턴스가 생성될 때마다 컨테이너 DOM을 통째로 새로 마운트한다.
            이전 위젯이 렌더링했던 DOM 노드를 재사용하면 토스 SDK 내부 상태가
            꼬여 결제 수단이 렌더링되지 않고, "결제하기" 클릭이 조용히 실패한다. */}
        <div key={widgetInstanceKey} className="bg-[#0c0c12] rounded-xl border border-[#1a1a24] p-4 sm:p-6 mb-8">
          <div id="payment-method" className="w-full min-h-[250px]" />
          <div className="border-t border-[#1a1a24] my-6" />
          <div id="agreement" className="w-full" />
        </div>

        {/* ── 결제하기 버튼 ── */}
        <button
          onClick={handlePaymentRequest}
          disabled={!paymentWidget || !paymentMethodsWidget}
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
