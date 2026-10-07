import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { getUserRole } from '@/utils/supabase/getUserRole';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminSupabase(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST() {
  try {
    const userSupabase = createServerSupabase();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const role = await getUserRole();
    if (role !== 'owner') {
      return NextResponse.json({ error: '대표 계정만 구독을 해지할 수 있습니다.' }, { status: 403 });
    }

    const adminSupabase = getAdminClient();
    if (!adminSupabase) {
      return NextResponse.json({ error: '서버 설정 오류입니다.' }, { status: 500 });
    }

    // 현재 활성 구독 조회
    const { data: subscription, error: fetchError } = await adminSupabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !subscription) {
      return NextResponse.json({ error: '해지할 구독 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (subscription.cancelled_at) {
      return NextResponse.json({
        success: true,
        message: '이미 해지 신청된 구독입니다.',
        expiresAt: subscription.expires_at,
      });
    }

    // cancelled_at 기록 (다음 정기결제 중단, 이미 결제된 expires_at까지는 이용 가능)
    const now = new Date().toISOString();
    let { error: updateError } = await adminSupabase
      .from('subscriptions')
      .update({
        cancelled_at: now,
      })
      .eq('user_id', user.id);

    // cancelled_at 컬럼 미비 시 status='cancelled'로 업데이트 (이용기간은 expires_at 유지)
    if (updateError && updateError.message && updateError.message.includes('column')) {
      console.warn('cancelled_at update failed, falling back to status cancelled:', updateError.message);
      const { error: fallbackError } = await adminSupabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
        })
        .eq('user_id', user.id);
      updateError = fallbackError;
    }

    if (updateError) {
      return NextResponse.json({ error: `구독 해지 처리에 실패했습니다: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '구독이 정상적으로 해지되었습니다. 이미 결제하신 기간 종료일까지 이용하실 수 있습니다.',
      expiresAt: subscription.expires_at,
    });
  } catch (err: any) {
    console.error('Cancel subscription error:', err);
    return NextResponse.json({ error: err?.message || '구독 해지 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
