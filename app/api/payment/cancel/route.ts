import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { getUserRole } from '@/utils/supabase/getUserRole';
import { notifyAdmin } from '@/lib/notify';
import { BILLING_PLANS, PlanKey } from '@/lib/billing';

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

    // 7일 이내 해지 시 관리자 알림 발송 (약관 제8조 전액 환불 검토용)
    try {
      const lastPaidDate = subscription.last_paid_at
        ? new Date(subscription.last_paid_at)
        : (subscription.started_at ? new Date(subscription.started_at) : null);

      if (lastPaidDate) {
        const cancelDate = new Date(now);
        const diffMs = cancelDate.getTime() - lastPaidDate.getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

        if (diffMs <= sevenDaysMs && diffMs >= 0) {
          const usedDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          const planKey = (subscription.plan || 'basic') as PlanKey;
          const planInfo = BILLING_PLANS[planKey];
          const planName = planInfo ? `${planInfo.name} 플랜` : subscription.plan;
          const amountStr = planInfo ? `${planInfo.price.toLocaleString()}원` : '정보 없음';
          const lastPaidStr = lastPaidDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
          const cancelDateStr = cancelDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
          const orderId = subscription.last_order_id || '주문번호 정보 없음';

          const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
          const subjectPrefix = isTestMode ? '[테스트] ' : '';
          const subject = `${subjectPrefix}[매장닥터] 7일 이내 구독 해지 접수 (환불 검토 필요) - ${user.email}`;
          const testNotice = isTestMode
            ? '\n(테스트 결제는 토스 개발자센터 → 테스트 결제내역에서 확인하실 수 있습니다.)'
            : '';

          const text = `[매장닥터 7일 이내 구독 해지 알림]

고객이 마지막 결제일로부터 7일 이내에 정기구독을 해지하였습니다.
이용약관 제8조(7일 이내 전액 환불)에 따라 환불 대상 여부를 검토해 주시기 바랍니다.
(환불 처리는 자동 진행되지 않으므로 토스 상점관리자에서 관리자 검토 후 직접 취소하셔야 합니다.)

■ 해지 및 결제 정보
- 고객 이메일: ${user.email}
- 구독 플랜: ${planName}
- 결제 금액: ${amountStr}
- 결제일시: ${lastPaidStr}
- 해지일시: ${cancelDateStr}
- 이용 일수: ${usedDays}일
- 토스 주문번호: ${orderId}

■ 후속 조치 안내
토스 상점관리자(https://dashboard.tosspayments.com) 접속 → 결제조회 메뉴에서 위 주문번호로 검색 후 결제취소 검토를 진행해 주세요.${testNotice}`;

          await notifyAdmin({ subject, text });
        }
      }
    } catch (notifyErr) {
      console.error('[Cancel] Failed to trigger admin notification on cancellation:', notifyErr);
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
