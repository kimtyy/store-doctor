// 서버 전용 모듈: service role 키를 사용하므로 클라이언트 컴포넌트에서 import 금지
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { ACTIVE_SUBSCRIPTION_STATUSES, PAID_PLAN_KEYS, type PlanId } from '@/lib/plans';

export type ResolvedPlan = {
  plan: PlanId;
  /** ADMIN_EMAIL 계정: premium 수준으로 취급하되 사용 한도는 면제 */
  limitExempt: boolean;
};

const FREE: ResolvedPlan = { plan: 'free', limitExempt: false };

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * 유저 본인의 구독 기준 플랜 판정. (서버 전용)
 * - 유효한 유료 구독(status in active/cancelled/past_due, expires_at > now)이면 그 plan
 * - 없거나 만료되면 'free' (free 는 DB 행을 만들지 않음)
 */
export async function getPlanForUser(userId: string): Promise<ResolvedPlan> {
  if (!userId) return FREE;
  const admin = getAdminClient();
  if (!admin) return FREE;

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data?.user?.email && data.user.email === adminEmail) {
        return { plan: 'premium', limitExempt: true };
      }
    } catch (err) {
      console.error('[getPlan] admin lookup failed:', err);
    }
  }

  const { data: sub, error } = await admin
    .from('subscriptions')
    .select('plan')
    .eq('user_id', userId)
    .in('status', [...ACTIVE_SUBSCRIPTION_STATUSES])
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    // 조회 실패 시 유료 혜택을 주지 않는 쪽(free)으로 안전하게 처리
    console.error('[getPlan] subscriptions 조회 실패:', error.message);
    return FREE;
  }

  if (sub && (PAID_PLAN_KEYS as readonly string[]).includes(sub.plan)) {
    return { plan: sub.plan as PlanId, limitExempt: false };
  }
  return FREE;
}

/**
 * 매장 기준 플랜 판정. 매장 소유자(stores.owner_id)의 구독을 따른다.
 * 직원(store_members)이 사용하더라도 소유자의 플랜이 적용된다.
 */
export async function getPlanForStore(storeId: string): Promise<ResolvedPlan> {
  if (!storeId) return FREE;
  const admin = getAdminClient();
  if (!admin) return FREE;

  const { data: store, error } = await admin
    .from('stores')
    .select('owner_id')
    .eq('id', storeId)
    .maybeSingle();

  if (error || !store?.owner_id) return FREE;
  return getPlanForUser(store.owner_id);
}
