'use server';

import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

async function checkAdmin() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    throw new Error('Unauthorized');
  }
}

export async function deleteStore(storeId: string, ownerId: string | null) {
  await checkAdmin();
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (ownerId) {
    // 유저 계정을 삭제하면 ON DELETE CASCADE 에 의해 stores 테이블의 레코드도 함께 삭제됨
    const { error } = await adminClient.auth.admin.deleteUser(ownerId);
    if (error) {
      console.error('Delete user error:', error);
      throw new Error('유저 삭제 중 오류가 발생했습니다.');
    }
  } else {
    // owner_id가 없는 더미 데이터의 경우 매장만 삭제
    const { error } = await adminClient.from('stores').delete().eq('id', storeId);
    if (error) {
      console.error('Delete store error:', error);
      throw new Error('매장 삭제 중 오류가 발생했습니다.');
    }
  }

  revalidatePath('/admin');
  return { success: true };
}

export async function extendSubscription(userId: string, months: number) {
  await checkAdmin();
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. 현재 구독 정보 조회
  const { data: sub, error: fetchError } = await adminClient
    .from('subscriptions')
    .select('expires_at, status')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('Fetch subscription error:', fetchError);
    throw new Error('구독 정보를 불러오는 중 오류가 발생했습니다.');
  }

  // 2. 연장 기준일 계산
  let baseDate = new Date();
  if (sub?.expires_at) {
    const currentExpiresAt = new Date(sub.expires_at);
    // 만료 예정일이 미래 시점이면 그 날짜 기준으로 연장, 이미 과거(만료)면 오늘 날짜 기준으로 연장
    if (currentExpiresAt.getTime() > Date.now()) {
      baseDate = currentExpiresAt;
    }
  }

  // months 개월 더하기
  baseDate.setMonth(baseDate.getMonth() + months);
  const newExpiresAt = baseDate.toISOString();

  // 3. 구독 업데이트 (비활성 상태였던 경우 active로 복구)
  const { error: updateError } = await adminClient
    .from('subscriptions')
    .update({
      expires_at: newExpiresAt,
      status: 'active'
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Extend subscription error:', updateError);
    throw new Error('구독 연장 업데이트 중 오류가 발생했습니다.');
  }

  revalidatePath('/admin');
  return { success: true };
}
