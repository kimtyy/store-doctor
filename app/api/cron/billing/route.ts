import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { BILLING_PLANS, PlanKey, decryptBillingKey } from '@/lib/billing';
import { notifyAdmin } from '@/lib/notify';

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

      // 1. 주문번호(orderId) 결정론적 생성 규칙:
      // rc_${subscription.id}_${next_billing_date YYYYMMDD}_${retry_count}
      // 토스 orderId 허용 규격: 영문 대소문자, 숫자, 특수문자 -, _ (6자 이상 64자 이하)
      // 길이: rc_(3) + UUID(36) + _(1) + YYYYMMDD(8) + _(1) + retryCount(1~2) ≈ 49~50자 (규격 완벽 부합)
      const billingDateObj = sub.next_billing_date ? new Date(sub.next_billing_date) : now;
      const ymd = billingDateObj.toISOString().slice(0, 10).replace(/-/g, '');
      const orderId = `rc_${sub.id}_${ymd}_${retryCount}`;

      // 다음 결제 예정일 계산 (+1개월)
      const currentNext = sub.next_billing_date ? new Date(sub.next_billing_date) : new Date(now);
      currentNext.setMonth(currentNext.getMonth() + 1);

      let isPaymentDone = false;
      let isDuplicateResolved = false;
      let paymentErrorMessage = '';

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

        const tossData = await tossRes.json().catch(() => ({}));

        if (tossRes.ok) {
          isPaymentDone = true;
        } else {
          paymentErrorMessage = tossData?.message || `HTTP ${tossRes.status}`;

          // 토스 중복 주문번호/이미 처리됨 에러 처리:
          // 토스 공식 에러 코드: ALREADY_PROCESSED_PAYMENT, DUPLICATED_ORDER_ID
          // 토스 주문 조회 API: GET https://api.tosspayments.com/v1/payments/orders/{orderId}
          const isDuplicateError =
            tossData?.code === 'ALREADY_PROCESSED_PAYMENT' ||
            tossData?.code === 'DUPLICATED_ORDER_ID' ||
            String(tossData?.message || '').includes('이미') ||
            String(tossData?.message || '').includes('중복');

          if (isDuplicateError) {
            console.warn(`[Billing Cron] Toss duplicate order detected for sub ${sub.id}, orderId ${orderId}. Checking payment status...`);
            try {
              const lookupRes = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, {
                method: 'GET',
                headers: {
                  Authorization: `Basic ${encodedCredential}`,
                },
              });
              if (lookupRes.ok) {
                const lookupData = await lookupRes.json();
                if (lookupData.status === 'DONE') {
                  // 이미 결제 완료된 건이므로 재청구 없이 DB 갱신만 수행
                  isPaymentDone = true;
                  isDuplicateResolved = true;
                  console.log(`[Billing Cron] OrderId ${orderId} confirmed DONE via order lookup. Proceeding to DB update without re-charge.`);
                }
              } else {
                console.error(`[Billing Cron] Order lookup failed with status ${lookupRes.status} for orderId ${orderId}`);
              }
            } catch (lookupErr) {
              console.error(`[Billing Cron] Order lookup network exception for orderId ${orderId}:`, lookupErr);
            }
          }
        }
      } catch (chargeErr: any) {
        console.error(`Toss recurring charge network exception for sub ${sub.id}:`, chargeErr);
        paymentErrorMessage = chargeErr?.message || '네트워크 예외';

        // 네트워크 예외 발생 시에도 토스에 이미 승인되었는지 확인 시도
        try {
          const lookupRes = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, {
            method: 'GET',
            headers: {
              Authorization: `Basic ${encodedCredential}`,
            },
          });
          if (lookupRes.ok) {
            const lookupData = await lookupRes.json();
            if (lookupData.status === 'DONE') {
              isPaymentDone = true;
              isDuplicateResolved = true;
              console.log(`[Billing Cron] OrderId ${orderId} confirmed DONE after network exception. Proceeding to DB update.`);
            }
          }
        } catch (lookupErr) {
          console.error(`[Billing Cron] Order lookup after network exception failed for ${orderId}:`, lookupErr);
        }
      }

      // 2. 결제 완료 건: DB 갱신 (최대 3회 재시도)
      if (isPaymentDone) {
        let updateSuccess = false;
        let lastDbError: any = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          const { error: updateError } = await adminSupabase
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

          if (!updateError) {
            updateSuccess = true;
            break;
          }
          lastDbError = updateError;
          console.error(`[Billing Cron] DB update attempt ${attempt}/3 failed for sub ${sub.id}:`, updateError.message);
          if (attempt < 3) {
            await new Promise((res) => setTimeout(res, 500));
          }
        }

        if (!updateSuccess) {
          // Vercel 로그 폴백: 알림 모듈 실패 여부와 무관하게 필수 정보 기록 (카드/키 제외)
          console.error(`[Billing Cron] CRITICAL: DB update failed 3 times for charged sub ${sub.id}. OrderId: ${orderId}, User: ${sub.user_id}, Error: ${lastDbError?.message}`);
          try {
            const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
            const subjectPrefix = isTestMode ? '[테스트] ' : '';
            await notifyAdmin({
              subject: `${subjectPrefix}[긴급] 정기결제 갱신 승인 후 DB 저장 실패 - ${sub.user_id}`,
              text: `[매장닥터 정기결제 갱신 DB 오류 알림]

정기결제 갱신 청구(토스 결제)는 성공하였으나, Supabase subscriptions 테이블 3회 재시도 갱신에 모두 실패하였습니다.
다음 크론 실행 시 중복 결제가 발생하지 않도록 즉시 확인 및 수동 갱신이 필요합니다.

■ 상세 정보
- 구독 ID: ${sub.id}
- 사용자 식별자: ${sub.user_id}
- 토스 주문번호: ${orderId}
- 결제 금액: ${planDetail.price.toLocaleString()}원
- DB 에러 내용: ${lastDbError?.message}
- 다음 결제 예정일(갱신 대상): ${currentNext.toISOString()}

■ 조치 방법
토스 상점관리자(https://dashboard.tosspayments.com) 접속 → 결제조회 메뉴에서 주문번호(${orderId}) 결제 승인 내역을 확인하시고,
Supabase subscriptions 테이블의 next_billing_date와 expires_at을 ${currentNext.toISOString()}으로 수동 업데이트해 주세요.`,
            });
          } catch (notifyErr) {
            console.error('[Billing Cron] Fallback: notifyAdmin failed for DB update error:', notifyErr);
          }

          results.push({
            id: sub.id,
            user_id: sub.user_id,
            status: 'charged_but_db_update_failed',
            error: lastDbError?.message,
            orderId,
          });
        } else {
          results.push({
            id: sub.id,
            user_id: sub.user_id,
            status: isDuplicateResolved ? 'already_charged_db_synced' : 'charged_successfully',
            nextBillingDate: currentNext,
            orderId,
          });
        }
      } else {
        // 결제 실패 처리: retry_count + 1, last_retry_at 갱신, 상태 연체(또는 최종 실패 시 expired)
        // 결제 실패 시에만 retry_count가 증가하여 다음 시도 때 새 orderId가 생성됨
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
          error: paymentErrorMessage,
          orderId,
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
