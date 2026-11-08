import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { BILLING_PLANS, PlanKey, decryptBillingKey } from '@/lib/billing';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminSupabase(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET or POST /api/cron/billing
// Vercel Cron 또는 정기 스케줄러가 매일 1회 실행하는 정기결제 처리 작업
export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }

    const tossSecretKey = process.env.TOSS_SECRET_KEY;
    if (!tossSecretKey) {
      console.error('TOSS_SECRET_KEY is missing in cron billing');
      return NextResponse.json({ error: 'TOSS_SECRET_KEY not set' }, { status: 500 });
    }
    const encodedCredential = Buffer.from(`${tossSecretKey}:`).toString('base64');

    const adminSupabase = getAdminClient();
    if (!adminSupabase) {
      return NextResponse.json({ error: 'Database client initialization failed' }, { status: 500 });
    }

    const now = new Date();

    // 1. 결제일이 도래한 구독 조회 (취소되지 않았고, 빌링키와 다음 결제일이 모두 존재하며, 상태가 active 또는 past_due/연체)
    const { data: candidates, error: fetchError } = await adminSupabase
      .from('subscriptions')
      .select('*')
      .in('status', ['active', 'past_due', '연체'])
      .is('cancelled_at', null)
      .not('billing_key', 'is', null)
      .not('next_billing_date', 'is', null)
      .lte('next_billing_date', now.toISOString());

    if (fetchError) {
      // 만약 컬럼 미비 등으로 조회가 실패한 경우
      console.error('Failed to query subscriptions for billing:', fetchError.message);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const subscriptions = candidates || [];
    const results = [];

    for (const sub of subscriptions) {
      // 과거 단건 결제 방식 등 billing_key 또는 next_billing_date가 비어 있는 행 안전하게 건너뛰기
      if (
        !sub.billing_key ||
        typeof sub.billing_key !== 'string' ||
        !sub.billing_key.trim() ||
        !sub.next_billing_date
      ) {
        results.push({
          id: sub.id,
          user_id: sub.user_id,
          status: 'skipped_missing_billing_info',
        });
        continue;
      }

      const retryCount = sub.retry_count || 0;

      // 3회 초과 최종 실패 시 이용 제한 처리
      if (retryCount >= 3) {
        await adminSupabase
          .from('subscriptions')
          .update({ status: 'expired' })
          .eq('id', sub.id);
        results.push({ id: sub.id, user_id: sub.user_id, status: 'restricted_due_to_max_retries' });
        continue;
      }

      // 3일 간격 재시도 체크 (재시도 횟수가 있는 경우, 마지막 재시도로부터 3일이 경과했는지 검사)
      if (retryCount > 0 && sub.last_retry_at) {
        const lastRetry = new Date(sub.last_retry_at);
        const diffDays = (now.getTime() - lastRetry.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 3) {
          results.push({ id: sub.id, user_id: sub.user_id, status: 'retry_cooldown_active', daysPassed: diffDays });
          continue;
        }
      }

      // 빌링키 복호화
      let plainBillingKey = '';
      try {
        plainBillingKey = decryptBillingKey(sub.billing_key);
      } catch (err) {
        console.error(`Failed to decrypt billingKey for sub ${sub.id}`);
        results.push({ id: sub.id, user_id: sub.user_id, status: 'decrypt_failed' });
        continue;
      }

      if (!plainBillingKey) {
        results.push({ id: sub.id, user_id: sub.user_id, status: 'missing_billing_key' });
        continue;
      }

      const planDetail = BILLING_PLANS[(sub.plan as PlanKey)] || BILLING_PLANS.basic;
      const orderId = `recur_${sub.user_id.slice(0, 8)}_${Date.now()}`;

      try {
        const tossRes = await fetch(`https://api.tosspayments.com/v1/billing/${plainBillingKey}`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${encodedCredential}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerKey: sub.customer_key,
            amount: planDetail.price,
            orderId,
            orderName: `매장닥터 ${planDetail.name} 정기구독 자동결제`,
          }),
        });

        const tossData = await tossRes.json();

        if (tossRes.ok) {
          // 결제 성공: 다음 결제일 +1개월, status: active, retry_count: 0
          const currentNext = sub.next_billing_date ? new Date(sub.next_billing_date) : new Date(now);
          currentNext.setMonth(currentNext.getMonth() + 1);

          await adminSupabase
            .from('subscriptions')
            .update({
              status: 'active',
              next_billing_date: currentNext.toISOString(),
              expires_at: currentNext.toISOString(),
              retry_count: 0,
              last_retry_at: null,
              last_paid_at: now.toISOString(),
              last_order_id: orderId,
            })
            .eq('id', sub.id);

          results.push({ id: sub.id, user_id: sub.user_id, status: 'charged_successfully', nextBillingDate: currentNext });
        } else {
          // 결제 실패: retry_count + 1, last_retry_at 갱신, 상태 연체(또는 최종 실패 시 expired)
          const newRetryCount = retryCount + 1;
          const nextStatus = newRetryCount >= 3 ? 'expired' : 'past_due';

          await adminSupabase
            .from('subscriptions')
            .update({
              status: nextStatus,
              retry_count: newRetryCount,
              last_retry_at: now.toISOString(),
            })
            .eq('id', sub.id);

          results.push({
            id: sub.id,
            user_id: sub.user_id,
            status: 'charge_failed',
            newRetryCount,
            nextStatus,
            error: tossData.message,
          });
        }
      } catch (chargeErr: any) {
        console.error(`Toss recurring charge network exception for sub ${sub.id}:`, chargeErr);
        const newRetryCount = retryCount + 1;
        const nextStatus = newRetryCount >= 3 ? 'expired' : 'past_due';

        await adminSupabase
          .from('subscriptions')
          .update({
            status: nextStatus,
            retry_count: newRetryCount,
            last_retry_at: now.toISOString(),
          })
          .eq('id', sub.id);

        results.push({
          id: sub.id,
          user_id: sub.user_id,
          status: 'charge_network_error',
          newRetryCount,
          nextStatus,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: subscriptions.length,
      results,
    });
  } catch (err: any) {
    console.error('Recurring billing cron handler exception:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
