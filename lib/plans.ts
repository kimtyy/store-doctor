/**
 * 플랜 정의의 단일 원천(Single Source of Truth).
 * 한도·금액·문구는 이 파일의 상수만 고치면 전부 바뀐다.
 * (순수 상수 파일: 서버/클라이언트/미들웨어(Edge) 어디서든 import 가능)
 */

export type PlanFeatures = {
  basicAnalytics: boolean;
  trendChart: boolean;
  aiReport: boolean;
  aiChat: boolean;
  /** 매장당 허용 멤버 수 (사장 포함) */
  memberLimit: number;
};

export type PlanDefinition = {
  name: string;
  price: number;
  ocrMonthlyLimit: number;
  features: PlanFeatures;
  description: string;
};

export const PLANS = {
  free: {
    name: '무료',
    price: 0,
    ocrMonthlyLimit: 30,
    features: { basicAnalytics: false, trendChart: false, aiReport: false, aiChat: false, memberLimit: 1 },
    description: '맛보기: 월 30건 스캔, 매입·매출 기록, 월 합계',
  },
  basic: {
    name: 'Basic',
    price: 9900,
    ocrMonthlyLimit: 100,
    features: { basicAnalytics: true, trendChart: false, aiReport: false, aiChat: false, memberLimit: 1 },
    description: '월 100건 스캔, 손익·원가율, 월간 정산서',
  },
  pro: {
    name: 'Pro',
    price: 19900,
    ocrMonthlyLimit: 150,
    features: { basicAnalytics: true, trendChart: true, aiReport: true, aiChat: true, memberLimit: 1 },
    description: '월 150건 스캔, Basic의 모든 기능, 이동평균 추세 차트, AI 진단·예측·원가율 경고, AI 채팅',
  },
  premium: {
    name: 'Premium',
    price: 29900,
    ocrMonthlyLimit: 400,
    features: { basicAnalytics: true, trendChart: true, aiReport: true, aiChat: true, memberLimit: 2 },
    description: '월 400건 스캔, Pro의 모든 기능, 직원 1명 추가(사장+직원 1명)',
  },
} as const satisfies Record<string, PlanDefinition>;

export type PlanId = keyof typeof PLANS;

/** 결제 대상(유료) 플랜 키. subscriptions.plan 에 저장 가능한 값과 같다. */
export const PAID_PLAN_KEYS = ['basic', 'pro', 'premium'] as const;
export type PaidPlanKey = (typeof PAID_PLAN_KEYS)[number];

/** 이용 권한이 유효한 것으로 보는 구독 상태 (expires_at > now 와 함께 판정) */
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'cancelled', 'past_due'] as const;
