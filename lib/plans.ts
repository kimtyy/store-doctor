/**
 * 플랜 정의의 단일 원천(Single Source of Truth).
 * 한도·금액·문구는 이 파일의 상수만 고치면 전부 바뀐다.
 * (순수 상수 파일: 서버/클라이언트/미들웨어(Edge) 어디서든 import 가능)
 */

export type PlanFeatures = {
  /** 분석 맛보기 (당월 총매출·총비용·남은 돈 요약, 전 플랜 제공) */
  analysisPreview: boolean;
  /** 상세 손익·원가율·FL, 전월/전년 비교, 메뉴/주류 분석 (Basic 이상) */
  basicAnalytics: boolean;
  /** 이동평균 추세 차트 및 원가율 경고 카드 (Pro 이상) */
  trendChart: boolean;
  /** 3일 띠 기온 급락 알림 및 한파 배지 (Pro 이상) */
  tempDropAlert: boolean;
  /** 월간 보고서 AI 4대 심층 진단 (Pro 이상) */
  aiReport: boolean;
  /** AI 경영 상담 챗봇 (Pro 이상) */
  aiChat: boolean;
  /** 매장당 허용 멤버 수 (사장 포함) */
  memberLimit: number;
};

export type PlanDefinition = {
  name: string;
  price: number;
  ocrMonthlyLimit: number;
  aiMonthlyCredits: number;
  features: PlanFeatures;
  description: string;
};

/**
 * 모든 플랜(무료 포함)에 열려 있는 기본 기능 목록 (문서용 주석):
 * - 매입·매출 기록·목록·수정, 직접 입력
 * - 고정비 관리 (/settings/fixed-costs)
 * - 매장 사정 기록 (/settings/events, api/store-events)
 * - 메뉴 마스터 관리 (/settings/menu, api/menu-master, api/menu-master/sync)
 * - 메뉴 수정 및 분류 변경 (PATCH /api/analytics/menu)
 * - 매입처 관리 (/settings/vendors, api/vendor-master)
 * - POS 엑셀 가져오기 (/settings/import, api/import/okpos) - 소유자
 * - 과거 날씨 다시 채우기 (/api/weather/backfill) - 소유자
 * - 매장 위치 설정 - 소유자
 * - 오늘 날씨 기본 조회 (현재 기온/저녁 기온/내일 기온 예보)
 */
export const OPEN_TO_ALL_PLANS = [
  '매입·매출 기록·목록·수정',
  '직접 입력',
  '고정비 관리',
  '매장 사정 기록',
  '메뉴 관리',
  '매입처 관리',
  'POS 엑셀 가져오기',
  '과거 날씨 다시 채우기',
  '매장 위치 설정',
  '오늘 날씨 기본 조회',
] as const;

export const PLANS = {
  free: {
    name: '무료',
    price: 0,
    ocrMonthlyLimit: 30,
    aiMonthlyCredits: 0,
    features: {
      analysisPreview: true,
      basicAnalytics: false,
      trendChart: false,
      tempDropAlert: false,
      aiReport: false,
      aiChat: false,
      memberLimit: 1,
    },
    description: '월 스캔 30회, 매입·매출 기록, 이번 달 매출·비용·남은 돈 분석 맛보기',
  },
  basic: {
    name: 'Basic',
    price: 9900,
    ocrMonthlyLimit: 100,
    aiMonthlyCredits: 0,
    features: {
      analysisPreview: true,
      basicAnalytics: true,
      trendChart: false,
      tempDropAlert: false,
      aiReport: false,
      aiChat: false,
      memberLimit: 1,
    },
    description: '월 스캔 100회, 손익 상세·재료비 원가율·FL, 전월·전년 비교, 메뉴·주류 분석, 월간 정산서',
  },
  pro: {
    name: 'Pro',
    price: 19900,
    ocrMonthlyLimit: 150,
    aiMonthlyCredits: 60,
    features: {
      analysisPreview: true,
      basicAnalytics: true,
      trendChart: true,
      tempDropAlert: true,
      aiReport: true,
      aiChat: true,
      memberLimit: 1,
    },
    description:
      '월 스캔 150회, Basic의 모든 기능, 실시간 재료비 원가율·FL 및 순이익 추적(이동평균 차트), AI 진단·예측·원가율 경고, 기온 급락 알림, AI 사용 월 60회(채팅·보고서)',
  },
  premium: {
    name: 'Premium',
    price: 29900,
    ocrMonthlyLimit: 400,
    aiMonthlyCredits: 120,
    features: {
      analysisPreview: true,
      basicAnalytics: true,
      trendChart: true,
      tempDropAlert: true,
      aiReport: true,
      aiChat: true,
      memberLimit: 2,
    },
    description: '월 스캔 400회, Pro의 모든 기능, AI 사용 월 120회, 사장 + 직원 1명',
  },
} as const satisfies Record<string, PlanDefinition>;

export type PlanId = keyof typeof PLANS;

/** 결제 대상(유료) 플랜 키. subscriptions.plan 에 저장 가능한 값과 같다. */
export const PAID_PLAN_KEYS = ['basic', 'pro', 'premium'] as const;
export type PaidPlanKey = (typeof PAID_PLAN_KEYS)[number];

/** 이용 권한이 유효한 것으로 보는 구독 상태 (expires_at > now 와 함께 판정) */
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'cancelled', 'past_due'] as const;

/** AI 기능별 소모 크레딧 가중치 */
export const AI_CREDIT_WEIGHTS = {
  chat: 1,
  report: 1,
} as const;

/** 1회 요청당 사진 수 상한 (초과 시 400) */
export const OCR_MAX_FILES_PER_REQUEST = 5;
export const MAX_OCR_PER_REQUEST = OCR_MAX_FILES_PER_REQUEST;

/** AI 채팅 보호 규칙 상수 */
export const CHAT_MAX_USER_MESSAGE_LENGTH = 500;
export const MAX_CHAT_INPUT_CHARS = CHAT_MAX_USER_MESSAGE_LENGTH;
export const CHAT_MAX_ASSISTANT_MESSAGE_LENGTH = 4000;
export const MAX_CHAT_ASSISTANT_CHARS = CHAT_MAX_ASSISTANT_MESSAGE_LENGTH;
export const CHAT_MAX_HISTORY_MESSAGES = 12; // 최근 6턴
export const MAX_CHAT_HISTORY_MESSAGES = CHAT_MAX_HISTORY_MESSAGES;
export const CHAT_RATE_LIMIT_PER_MINUTE = 5; // 매장당 분당 5회

/** 플랜의 특정 기능 접근 가능 여부 판정 */
export function canAccessFeature(planOrResolved: PlanId | { plan: PlanId }, feature: keyof PlanFeatures): boolean {
  const planId = typeof planOrResolved === 'string' ? planOrResolved : planOrResolved.plan;
  const planDef = PLANS[planId];
  if (!planDef) return false;
  const val = planDef.features[feature];
  return typeof val === 'boolean' ? val : Boolean(val);
}
