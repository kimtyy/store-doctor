import { createClient } from './server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPlanForStore } from '@/lib/getPlan';
import { PLANS } from '@/lib/plans';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type MemberAccessResult =
  | { access: 'active'; role: 'owner' | 'manager' | 'staff'; storeId: string }
  | {
      access: 'suspended';
      role: 'suspended';
      reason: 'plan_member_limit_exceeded';
      message: string;
      storeId: string;
    }
  | { access: 'none'; role: null; storeId: null };

/**
 * 사용자의 매장 접근 권한 및 정지 상태 판정.
 * - 소유자는 절대 정지되지 않음 (active)
 * - 관리자 이메일(ADMIN_EMAIL)은 무조건 active
 * - 소유자 제외 구성원 수 > memberLimit - 1 이면,
 *   store_members 가입이 늦은 순서(created_at DESC)로 초과 인원만 suspended (memberLimit 1이면 비소유자 전원 정지)
 */
export async function getMemberAccess(userId: string): Promise<MemberAccessResult> {
  if (!userId) return { access: 'none', role: null, storeId: null };

  const adminSupabase = getAdminClient();
  if (!adminSupabase) return { access: 'none', role: null, storeId: null };

  // 0. ADMIN_EMAIL 체크
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    try {
      const { data } = await adminSupabase.auth.admin.getUserById(userId);
      if (data?.user?.email && data.user.email === adminEmail) {
        // 관리자가 소유한 스토어 우선, 없으면 멤버 스토어
        const { data: st } = await adminSupabase.from('stores').select('id').eq('owner_id', userId).maybeSingle();
        if (st) return { access: 'active', role: 'owner', storeId: st.id };
        const { data: mem } = await adminSupabase.from('store_members').select('store_id, role').eq('user_id', userId).maybeSingle();
        if (mem) return { access: 'active', role: (mem.role as any) || 'owner', storeId: mem.store_id };
      }
    } catch (e) {
      console.error('[getMemberAccess] admin lookup error:', e);
    }
  }

  // 1. 본인이 스토어 소유자인지 확인
  const { data: ownedStore } = await adminSupabase
    .from('stores')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle();

  if (ownedStore) {
    return { access: 'active', role: 'owner', storeId: ownedStore.id };
  }

  // 2. store_members에서 사용자 확인
  const { data: member } = await adminSupabase
    .from('store_members')
    .select('id, store_id, role, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || !member.store_id) {
    return { access: 'none', role: null, storeId: null };
  }

  // 3. 해당 매장의 플랜 및 구성원 한도 조회
  const resolved = await getPlanForStore(member.store_id);
  const planDef = PLANS[resolved.plan];
  const nonOwnerLimit = planDef.features.memberLimit - 1; // 사장 제외 허용 직원 수

  if (nonOwnerLimit <= 0) {
    return {
      access: 'suspended',
      role: 'suspended',
      reason: 'plan_member_limit_exceeded',
      message: '매장 플랜이 변경되어 직원 계정 접근이 일시 중지되었습니다. 대표에게 문의해 주세요.',
      storeId: member.store_id,
    };
  }

  // 4. 소유자 제외 구성원들을 created_at ASC(먼저 등록된 순)으로 정렬하여 초과 여부 확인
  const { data: storeInfo } = await adminSupabase
    .from('stores')
    .select('owner_id')
    .eq('id', member.store_id)
    .maybeSingle();

  const ownerId = storeInfo?.owner_id;

  const { data: nonOwnerMembers } = await adminSupabase
    .from('store_members')
    .select('user_id, created_at')
    .eq('store_id', member.store_id)
    .neq('user_id', ownerId || '')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  const activeNonOwners = (nonOwnerMembers || []).slice(0, nonOwnerLimit);
  const isIncluded = activeNonOwners.some((m) => m.user_id === userId);

  if (isIncluded) {
    return { access: 'active', role: (member.role as any) || 'staff', storeId: member.store_id };
  }

  return {
    access: 'suspended',
    role: 'suspended',
    reason: 'plan_member_limit_exceeded',
    message: '매장 플랜이 변경되어 직원 계정 접근이 일시 중지되었습니다. 대표에게 문의해 주세요.',
    storeId: member.store_id,
  };
}

export async function getStoreId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 1. 소유주 매장 확인 (소유자는 RLS 및 DB 조회 속도 우선)
  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (store) return store.id;

  // 2. 멤버 매장 확인 및 정지 방어
  const memberAccess = await getMemberAccess(user.id);
  if (memberAccess.access === 'active') {
    return memberAccess.storeId;
  }
  return null;
}

export async function getStoreInfo() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 1. 소유주 매장 확인
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, category, region')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (store) return store;

  // 2. 멤버 매장 확인 및 정지 방어
  const memberAccess = await getMemberAccess(user.id);
  if (memberAccess.access === 'active' && memberAccess.storeId) {
    const adminSupabase = getAdminClient();
    if (!adminSupabase) return null;

    const { data: storeData } = await adminSupabase
      .from('stores')
      .select('id, name, category, region')
      .eq('id', memberAccess.storeId)
      .maybeSingle();
    return storeData || null;
  }

  return null;
}
