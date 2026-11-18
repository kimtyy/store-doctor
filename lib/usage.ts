// 서버 전용 모듈: service role 키를 사용하여 usage_counters 및 increment_usage RPC 호출
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPlanForStore } from './getPlan';
import { PLANS, type PlanId } from './plans';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Asia/Seoul 기준 현재 연-월 ('YYYY-MM') 문자열 반환
 */
export function getCurrentYearMonth(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? date.getFullYear().toString();
  const m = parts.find((p) => p.type === 'month')?.value ?? String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export interface StoreUsageSummary {
  yearMonth: string;
  ocr: { used: number; limit: number };
  ai: { used: number; limit: number };
  plan: PlanId;
  limitExempt: boolean;
}

/**
 * 매장의 현재 월 사용량(OCR 스캔, AI 크레딧) 및 플랜 한도 조회
 */
export async function getStoreUsage(
  storeId: string,
  yearMonth: string = getCurrentYearMonth()
): Promise<StoreUsageSummary> {
  const resolved = await getPlanForStore(storeId);
  const planDef = PLANS[resolved.plan];

  const admin = getAdminClient();
  let ocrUsed = 0;
  let aiUsed = 0;

  if (admin && storeId) {
    const { data: rows } = await admin
      .from('usage_counters')
      .select('kind, count')
      .eq('store_id', storeId)
      .eq('year_month', yearMonth);

    if (rows) {
      for (const r of rows) {
        if (r.kind === 'ocr') ocrUsed = r.count;
        if (r.kind === 'ai') aiUsed = r.count;
      }
    }
  }

  return {
    yearMonth,
    ocr: { used: ocrUsed, limit: resolved.limitExempt ? Infinity : planDef.ocrMonthlyLimit },
    ai: { used: aiUsed, limit: resolved.limitExempt ? Infinity : planDef.aiMonthlyCredits },
    plan: resolved.plan,
    limitExempt: resolved.limitExempt,
  };
}

export type CheckLimitResult =
  | {
      allowed: true;
      ok: true;
      plan: PlanId;
      limit: number;
      used: number;
      current: number;
      limitExempt: boolean;
      reason?: string;
      message?: string;
    }
  | {
      allowed: false;
      ok: false;
      error: 'limit_reached';
      kind: 'ocr' | 'ai';
      limit: number;
      used: number;
      current: number;
      message: string;
      reason: string;
      plan: PlanId;
      limitExempt?: boolean;
    };

/**
 * 사용량 한도 사전 검사 (호출 전 count + amount <= limit 검사)
 * 초과 시 Claude 호출을 사전에 차단하고 429 응답을 생성하기 위함
 */
export async function checkUsageLimit(
  storeId: string,
  kind: 'ocr' | 'ai',
  amount: number = 1
): Promise<CheckLimitResult> {
  const resolved = await getPlanForStore(storeId);
  if (resolved.limitExempt) {
    return {
      allowed: true,
      ok: true,
      plan: resolved.plan,
      limit: Infinity,
      used: 0,
      current: 0,
      limitExempt: true,
    };
  }

  const planDef = PLANS[resolved.plan];
  const limit = kind === 'ocr' ? planDef.ocrMonthlyLimit : planDef.aiMonthlyCredits;
  const ym = getCurrentYearMonth();

  const admin = getAdminClient();
  let used = 0;
  if (admin && storeId) {
    const { data } = await admin
      .from('usage_counters')
      .select('count')
      .eq('store_id', storeId)
      .eq('year_month', ym)
      .eq('kind', kind)
      .maybeSingle();
    if (data?.count) used = data.count;
  }

  if (used + amount > limit) {
    let message = '';
    if (kind === 'ocr') {
      message = `이번 달 스캔 한도(${limit}회)를 모두 사용했습니다. 다음 달 1일에 초기화됩니다. 직접 입력은 계속 할 수 있습니다.`;
      if (resolved.plan === 'free') {
        message += ' 더 많이 쓰려면 유료 플랜을 확인해 보세요.';
      }
    } else {
      message = `이번 달 AI 사용 한도(${limit}회)를 모두 사용했습니다. 다음 달 1일에 초기화됩니다.`;
    }

    return {
      allowed: false,
      ok: false,
      error: 'limit_reached',
      kind,
      limit,
      used,
      current: used,
      message,
      reason: message,
      plan: resolved.plan,
      limitExempt: false,
    };
  }

  return {
    allowed: true,
    ok: true,
    plan: resolved.plan,
    limit,
    used,
    current: used,
    limitExempt: false,
  };
}

/**
 * 성공한 작업에 대해 사용량 원자적 증가 기록 (성공 응답 직전 호출)
 * - limitExempt(관리자)는 증가 생략
 */
export async function recordUsage(
  storeId: string,
  kind: 'ocr' | 'ai',
  amount: number = 1
): Promise<number> {
  if (amount <= 0 || !storeId) return 0;

  const resolved = await getPlanForStore(storeId);
  if (resolved.limitExempt) return 0;

  const admin = getAdminClient();
  if (!admin) return 0;

  const ym = getCurrentYearMonth();
  try {
    const { data, error } = await admin.rpc('increment_usage', {
      p_store_id: storeId,
      p_year_month: ym,
      p_kind: kind,
      p_amount: amount,
    });

    if (error) {
      console.error('[usage] increment_usage RPC error:', error.message);
      return 0;
    }
    return typeof data === 'number' ? data : 0;
  } catch (err) {
    console.error('[usage] recordUsage exception:', err);
    return 0;
  }
}
