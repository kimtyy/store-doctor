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

export async function extendSubscription(userId: string, months: number, reason: string) {
  await checkAdmin();

  // 1. 입력값 검증 (1~12 사이의 정수만 허용)
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new Error('연장 기간은 1개월에서 12개월 사이의 정수여야 합니다.');
  }

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    throw new Error('연장 사유를 입력해 주세요.');
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2. 현재 구독 정보 조회
  const { data: sub, error: fetchError } = await adminClient
    .from('subscriptions')
    .select('plan, expires_at, status')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('Fetch subscription error:', fetchError);
    throw new Error('구독 정보를 불러오는 중 오류가 발생했습니다.');
  }

  // 3. 연장 기준일 및 플랜 결정
  let baseDate = new Date();
  let existingPlan = 'basic';

  if (sub) {
    existingPlan = sub.plan || 'basic';
    if (sub.expires_at) {
      const currentExpiresAt = new Date(sub.expires_at);
      // 만료 예정일이 미래 시점이면 그 날짜 기준으로 연장, 이미 과거(만료)면 오늘 날짜 기준으로 연장
      if (currentExpiresAt.getTime() > Date.now()) {
        baseDate = currentExpiresAt;
      }
    }
  }

  // months 개월 더하기
  baseDate.setMonth(baseDate.getMonth() + months);
  const newExpiresAt = baseDate.toISOString();

  // 4. 구독 정보 저장 (upsert 구조로 변경)
  const { error: updateError } = await adminClient
    .from('subscriptions')
    .upsert({
      user_id: userId,
      plan: existingPlan,
      status: 'active',
      expires_at: newExpiresAt
    }, {
      onConflict: 'user_id'
    });

  if (updateError) {
    console.error('Extend subscription error:', updateError);
    throw new Error('구독 연장 업데이트 중 오류가 발생했습니다.');
  }

  // 5. 연장 이력 저장 (subscription_extensions)
  const { error: historyError } = await adminClient
    .from('subscription_extensions')
    .insert({
      user_id: userId,
      months: months,
      reason: trimmedReason
    });

  if (historyError) {
    console.error('Record extension history error:', historyError);
    // 연장 자체는 성공했으므로 이력 저장 실패 시 에러를 던지기보단 로그를 출력합니다.
  }

  revalidatePath('/admin');
  return { success: true };
}

export async function resolvePaymentAttempt(attemptId: string) {
  await checkAdmin();

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 현재 행 상태 및 생성 시각 확인 (processing 상태이면서 30분 미만이면 해제 차단)
  const { data: attempt, error: fetchErr } = await adminClient
    .from('payment_attempts')
    .select('id, status, created_at')
    .eq('id', attemptId)
    .maybeSingle();

  if (fetchErr) {
    console.error('Fetch payment attempt error:', fetchErr);
    throw new Error('결제 대기 내역 조회 중 오류가 발생했습니다.');
  }

  if (!attempt) {
    throw new Error('해당 결제 대기 내역을 찾을 수 없습니다.');
  }

  if (attempt.status === 'processing') {
    const elapsedMs = Date.now() - new Date(attempt.created_at).getTime();
    if (elapsedMs < 30 * 60 * 1000) {
      throw new Error('결제 진행 중일 수 있어 30분 후 해제 가능');
    }
  }

  const { data: updatedRows, error } = await adminClient
    .from('payment_attempts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', attemptId)
    .in('status', ['pending', 'processing'])
    .select('id');

  if (error) {
    console.error('Resolve payment attempt error:', error);
    throw new Error('결제 대기 해제 중 오류가 발생했습니다: ' + error.message);
  }

  if (!updatedRows || updatedRows.length === 0) {
    console.warn(`[Admin] resolvePaymentAttempt(${attemptId}) matched 0 rows.`);
    revalidatePath('/admin');
    return {
      success: false,
      message: '이미 해제되었거나 상태가 바뀌었습니다. 새로고침 해 주세요.',
    };
  }

  revalidatePath('/admin');
  revalidatePath('/payment');
  return { success: true };
}
