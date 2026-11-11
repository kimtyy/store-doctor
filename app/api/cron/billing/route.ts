import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { BILLING_PLANS, PlanKey, decryptBillingKey } from '@/lib/billing';
import { notifyAdmin } from '@/lib/notify';
import {
  determineBillingOutcome,
  resolveBillingOutcome,
  type ChargeResponseInput,
} from '@/lib/billingOutcome';

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
      const unconfirmedCount = sub.unconfirmed_count || 0;

      // 3일 연속 불확실인 경우 자동 재시도를 멈추고 대기 (알림은 이미 1회 발송되었거나 여기서 1회 발송)
      // 관리자 확인 전까지 expires_at을 "정지 시점 + 7일"까지 유지하여 이용 차단을 방지함 (기존 값이 더 길면 줄이지 않음)
      if (unconfirmedCount >= 3) {
        const pauseGraceDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const finalExpiresAt = sub.expires_at && new Date(sub.expires_at) > pauseGraceDate
          ? sub.expires_at
          : pauseGraceDate.toISOString();

        if (!sub.unconfirmed_notified_at) {
          try {
            const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
            const subjectPrefix = isTestMode ? '[테스트] ' : '';
            const sent = await notifyAdmin({
              subject: `${subjectPrefix}[긴급/수동 확인 필요] 정기결제 3일 연속 결과 불확실 - ${sub.user_id}`,
              text: `[매장닥터 정기결제 수동 확인 필요 알림]

정기결제 갱신 처리가 3일 연속 불확실(네트워크 오류/타임아웃/조회 불가 등) 상태로 지속되어 자동 재시도를 일시 중단하였습니다.
관리자 확인 전까지 고객의 서비스 이용 유예(expires_at: 정지 시점 + 7일)가 유지되며, 중복 결제 방지를 위해 관리자의 수동 확인이 필요합니다.

■ 상세 정보
- 구독 ID: ${sub.id}
- 사용자 식별자: ${sub.user_id}
- 연속 불확실 일수: ${unconfirmedCount}일
- 마지막 불확실 시각: ${sub.last_unconfirmed_at || '기록 없음'}

■ 재개 및 조치 방법
토스 상점관리자에서 orderId로 결제 여부 확인 → 결제됨: next_billing_date·expires_at·last_paid_at 갱신 후 unconfirmed_count=0, unconfirmed_notified_at=null / 결제 안 됨: unconfirmed_count=0, unconfirmed_notified_at=null 만 변경(다음 cron이 같은 orderId로 재청구)`,
            });
            const updatePayload: Record<string, any> = {
              expires_at: finalExpiresAt,
            };
            if (sent) {
              updatePayload.unconfirmed_notified_at = now.toISOString();
            }
            await adminSupabase
              .from('subscriptions')
              .update(updatePayload)
              .eq('id', sub.id);
          } catch (notifyErr: any) {
            console.error(`[Billing Cron] Failed to send 3-day unconfirmed notification: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
          }
        }
        results.push({ id: sub.id, user_id: sub.user_id, status: 'unconfirmed_retry_paused', unconfirmedCount });
        continue;
      }

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

      // 원래 예정된 결제일을 기준으로 한 달 뒤 계산 (결제가 늦게 확인되어도 결제일이 밀리지 않음)
      const baseBillingDate = sub.next_billing_date ? new Date(sub.next_billing_date) : new Date(now);
      const currentNext = new Date(baseBillingDate);
      currentNext.setMonth(currentNext.getMonth() + 1);

      // 청구 결과를 3가지로 명확히 구분:
      // 1. CONFIRMED_SUCCESS: 응답 성공 또는 주문 조회 DONE 확인
      // 2. CONFIRMED_FAILURE: 토스가 카드 거절 등 명확한 실패 코드를 돌려준 경우
      // 3. UNCONFIRMED: 네트워크 오류, 타임아웃, 응답 파싱 실패, 5xx 에러, 또는 중복 오류 후 주문 조회 실패
      let billingResult: 'CONFIRMED_SUCCESS' | 'CONFIRMED_FAILURE' | 'UNCONFIRMED' = 'UNCONFIRMED';
      let isDuplicateResolved = false;
      let lookupApprovedAt: string | null = null;
      let paymentErrorMessage = '';
      let unconfirmedReason = '';

      try {
        let chargeInput: ChargeResponseInput;
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

          let tossData: any = null;
          let parseError = false;
          try {
            tossData = await tossRes.json();
          } catch (parseErr: any) {
            parseError = true;
            console.error(`[Billing Cron] Toss response parse error for sub ${sub.id}: ${parseErr?.name || 'Error'}: ${parseErr?.message || String(parseErr)}`);
          }

          chargeInput = {
            ok: tossRes.ok,
            status: tossRes.status,
            data: tossData,
            parseError,
          };
        } catch (networkErr: any) {
          console.error(`[Billing Cron] Toss recurring charge network exception for sub ${sub.id}: ${networkErr?.name || 'Error'}: ${networkErr?.message || String(networkErr)}`);
          chargeInput = {
            ok: false,
            status: (networkErr?.name === 'AbortError' || networkErr?.code === 'ETIMEDOUT') ? 408 : 0,
            error: networkErr,
          };
        }

        // 공통 판정 함수 호출
        const outcomeResult = await resolveBillingOutcome({
          charge: chargeInput,
          fetchLookup: async () => {
            const lookupRes = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, {
              method: 'GET',
              headers: {
                Authorization: `Basic ${encodedCredential}`,
              },
            });
            const lookupData = await lookupRes.json().catch(() => null);
            return {
              ok: lookupRes.ok,
              status: lookupRes.status,
              data: lookupData,
              error: lookupRes.ok ? undefined : (lookupData?.message || `HTTP ${lookupRes.status}`),
            };
          },
        });

        billingResult = outcomeResult.outcome === 'SUCCESS'
          ? 'CONFIRMED_SUCCESS'
          : outcomeResult.outcome === 'FAILURE'
          ? 'CONFIRMED_FAILURE'
          : 'UNCONFIRMED';

        lookupApprovedAt = outcomeResult.approvedAt;
        isDuplicateResolved = outcomeResult.chargeCategory === 'DUPLICATE' && outcomeResult.outcome === 'SUCCESS';
        paymentErrorMessage = outcomeResult.errorMessage || '결제 거절';
        unconfirmedReason = outcomeResult.unconfirmedReason || '결제 결과 불확실';
      } catch (chargeErr: any) {
        billingResult = 'UNCONFIRMED';
        unconfirmedReason = `청구 처리 중 예외: ${chargeErr?.name || 'Error'}: ${chargeErr?.message || String(chargeErr)}`;
      }

      // ── 결과 처리 ───────────────────────────────────────────────────────────
      if (billingResult === 'CONFIRMED_SUCCESS') {
        // 확정 성공: DB 갱신 (최대 3회 재시도)
        // 승인 시각(approvedAt)이 있으면 last_paid_at으로 반영, 없으면 현재 시각 사용 및 콘솔 기록
        let paidAtIso = now.toISOString();
        if (isDuplicateResolved) {
          if (lookupApprovedAt) {
            paidAtIso = lookupApprovedAt;
          } else {
            console.warn(`[Billing Cron] Order lookup for ${orderId} missing approvedAt. Using current time.`);
          }
        }

        let updateSuccess = false;
        let lastDbError: any = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          const updatePayload: Record<string, any> = {
            status: 'active',
            next_billing_date: currentNext.toISOString(),
            expires_at: currentNext.toISOString(),
            retry_count: 0,
            last_retry_at: null,
            last_paid_at: paidAtIso,
            last_order_id: orderId,
            unconfirmed_count: 0,
            last_unconfirmed_at: null,
            unconfirmed_notified_at: null,
          };

          const { error: updateError } = await adminSupabase
            .from('subscriptions')
            .update(updatePayload)
            .eq('id', sub.id);

          if (!updateError) {
            updateSuccess = true;
            break;
          }

          // unconfirmed_* 컬럼이 아직 DB에 없는 경우 기존 컬럼으로 폴백
          if (updateError.message && updateError.message.includes('column')) {
            const fallbackPayload = {
              status: 'active',
              next_billing_date: currentNext.toISOString(),
              expires_at: currentNext.toISOString(),
              retry_count: 0,
              last_retry_at: null,
              last_paid_at: paidAtIso,
              last_order_id: orderId,
            };
            const { error: fallbackError } = await adminSupabase
              .from('subscriptions')
              .update(fallbackPayload)
              .eq('id', sub.id);
            if (!fallbackError) {
              updateSuccess = true;
              break;
            }
            lastDbError = fallbackError;
          } else {
            lastDbError = updateError;
          }

          console.error(`[Billing Cron] DB update attempt ${attempt}/3 failed for sub ${sub.id}: ${lastDbError?.message}`);
          if (attempt < 3) {
            await new Promise((res) => setTimeout(res, 500));
          }
        }

        if (!updateSuccess) {
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
          } catch (notifyErr: any) {
            console.error(`[Billing Cron] Fallback: notifyAdmin failed for DB update error: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
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
      } else if (billingResult === 'CONFIRMED_FAILURE') {
        // 확정 실패: 카드 거절 등 명확한 실패인 경우에만 retry_count 증가, past_due/expired 처리
        const newRetryCount = retryCount + 1;
        const nextStatus = newRetryCount >= 3 ? 'expired' : 'past_due';

        await adminSupabase
          .from('subscriptions')
          .update({
            status: nextStatus,
            retry_count: newRetryCount,
            last_retry_at: now.toISOString(),
            unconfirmed_count: 0,
            unconfirmed_notified_at: null,
            last_unconfirmed_at: null,
          })
          .eq('id', sub.id)
          .then(async ({ error }) => {
            if (error && error.message.includes('column')) {
              await adminSupabase
                .from('subscriptions')
                .update({
                  status: nextStatus,
                  retry_count: newRetryCount,
                  last_retry_at: now.toISOString(),
                })
                .eq('id', sub.id);
            }
          });

        results.push({
          id: sub.id,
          user_id: sub.user_id,
          status: 'charge_failed',
          newRetryCount,
          nextStatus,
          error: paymentErrorMessage,
          orderId,
        });
      } else {
        // billingResult === 'UNCONFIRMED'
        // 결과 불확실: retry_count와 status를 변경하지 않음 (같은 orderId 유지, 연체/만료 처리 금지)
        const newUnconfirmedCount = unconfirmedCount + 1;
        const isNewUnconfirmedStreak = unconfirmedCount === 0;

        console.error(`[Billing Cron] UNCONFIRMED payment result for sub ${sub.id}, orderId ${orderId}. Reason: ${unconfirmedReason}`);

        if (newUnconfirmedCount >= 3) {
          // 3일 정지 상태: expires_at = max(현재 expires_at, 정지 시점 + 7일)
          const pauseGraceDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const finalExpiresAt = sub.expires_at && new Date(sub.expires_at) > pauseGraceDate
            ? sub.expires_at
            : pauseGraceDate.toISOString();

          let notifiedAt = sub.unconfirmed_notified_at;

          if (!sub.unconfirmed_notified_at) {
            try {
              const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
              const subjectPrefix = isTestMode ? '[테스트] ' : '';
              const sent = await notifyAdmin({
                subject: `${subjectPrefix}[긴급/수동 확인 필요] 정기결제 3일 연속 결과 불확실 - ${sub.user_id}`,
                text: `[매장닥터 정기결제 수동 확인 필요 알림]

정기결제 갱신 처리가 3일 연속 불확실(네트워크 오류/타임아웃/조회 불가 등) 상태로 지속되어 자동 재시도를 일시 중단하였습니다.
관리자 확인 전까지 고객의 서비스 이용 유예(expires_at: 정지 시점 + 7일)가 유지되며, 중복 결제 방지를 위해 관리자의 수동 확인이 필요합니다.

■ 상세 정보
- 구독 ID: ${sub.id}
- 사용자 식별자: ${sub.user_id}
- 주문번호: ${orderId}
- 결제 금액: ${planDetail.price.toLocaleString()}원
- 불확실 사유: ${unconfirmedReason}
- 연속 불확실 일수: ${newUnconfirmedCount}일

■ 재개 및 조치 방법
토스 상점관리자에서 orderId로 결제 여부 확인 → 결제됨: next_billing_date·expires_at·last_paid_at 갱신 후 unconfirmed_count=0, unconfirmed_notified_at=null / 결제 안 됨: unconfirmed_count=0, unconfirmed_notified_at=null 만 변경(다음 cron이 같은 orderId로 재청구)`,
              });
              if (sent) {
                notifiedAt = now.toISOString();
              }
            } catch (notifyErr: any) {
              console.error(`[Billing Cron] Failed to send 3-day unconfirmed admin notification: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
            }
          }

          const unconfirmedPayload: Record<string, any> = {
            unconfirmed_count: newUnconfirmedCount,
            last_unconfirmed_at: now.toISOString(),
            expires_at: finalExpiresAt,
            unconfirmed_notified_at: notifiedAt,
          };

          await adminSupabase
            .from('subscriptions')
            .update(unconfirmedPayload)
            .eq('id', sub.id)
            .then(async ({ error }) => {
              if (error && error.message.includes('column')) {
                console.warn(`[Billing Cron] unconfirmed_* columns missing in DB`);
              }
            });
        } else if (newUnconfirmedCount === 1) {
          // 1일차 불확실 건: [긴급/결제 결과 미확인] 1회 발송
          const baseGraceDate = new Date(baseBillingDate.getTime() + 3 * 24 * 60 * 60 * 1000);
          const isRetryPeriod = (sub.retry_count || 0) > 0;
          const isGraceInPast = baseGraceDate <= now;

          let finalExpiresAt = sub.expires_at;
          let graceNoticeText = '';

          if (isRetryPeriod && isGraceInPast) {
            graceNoticeText = '재시도 구간이라 이용 유예 없음';
            finalExpiresAt = sub.expires_at;
          } else {
            graceNoticeText = '고객 이용 유예(expires_at: 원래 예정 결제일 + 3일)가 적용되었으며,';
            finalExpiresAt = sub.expires_at && new Date(sub.expires_at) > baseGraceDate
              ? sub.expires_at
              : baseGraceDate.toISOString();
          }

          try {
            const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
            const subjectPrefix = isTestMode ? '[테스트] ' : '';
            await notifyAdmin({
              subject: `${subjectPrefix}[긴급/결제 결과 미확인] 정기결제 결과 미확인 - ${sub.user_id}`,
              text: `[매장닥터 정기결제 결과 미확인 알림]

정기결제 갱신 요청 중 결과가 불확실(네트워크 오류/타임아웃/조회 불가 등)하여 재청구 및 연체 처리를 보류하였습니다.
${graceNoticeText} 동일 주문번호(${orderId})로 다음 크론에서 재확인 또는 정상 청구가 진행됩니다.

■ 상세 정보
- 구독 ID: ${sub.id}
- 사용자 식별자: ${sub.user_id}
- 토스 주문번호: ${orderId}
- 결제 금액: ${planDetail.price.toLocaleString()}원
- 불확실 사유: ${unconfirmedReason}
- 연속 불확실 일수: ${newUnconfirmedCount}일`,
            });
          } catch (notifyErr: any) {
            console.error(`[Billing Cron] Failed to send unconfirmed admin notification: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
          }

          const unconfirmedPayload: Record<string, any> = {
            unconfirmed_count: newUnconfirmedCount,
            last_unconfirmed_at: now.toISOString(),
            expires_at: finalExpiresAt,
            unconfirmed_notified_at: null,
          };

          await adminSupabase
            .from('subscriptions')
            .update(unconfirmedPayload)
            .eq('id', sub.id)
            .then(async ({ error }) => {
              if (error && error.message.includes('column')) {
                console.warn(`[Billing Cron] unconfirmed_* columns missing in DB`);
              }
            });
        } else {
          // 2일차 불확실 건: 콘솔 기록만 남기고 이메일 발송 스킵 (한 불확실 구간 최대 2통 제한)
          console.warn(`[Billing Cron] UNCONFIRMED day 2 for sub ${sub.id}, orderId ${orderId}. Skipping email notification (console only).`);

          const baseGraceDate = new Date(baseBillingDate.getTime() + 3 * 24 * 60 * 60 * 1000);
          const isRetryPeriod = (sub.retry_count || 0) > 0;
          const isGraceInPast = baseGraceDate <= now;
          const finalExpiresAt = isRetryPeriod && isGraceInPast
            ? sub.expires_at
            : (sub.expires_at && new Date(sub.expires_at) > baseGraceDate ? sub.expires_at : baseGraceDate.toISOString());

          const unconfirmedPayload: Record<string, any> = {
            unconfirmed_count: newUnconfirmedCount,
            last_unconfirmed_at: now.toISOString(),
            expires_at: finalExpiresAt,
            unconfirmed_notified_at: null,
          };

          await adminSupabase
            .from('subscriptions')
            .update(unconfirmedPayload)
            .eq('id', sub.id)
            .then(async ({ error }) => {
              if (error && error.message.includes('column')) {
                console.warn(`[Billing Cron] unconfirmed_* columns missing in DB`);
              }
            });
        }

        results.push({
          id: sub.id,
          user_id: sub.user_id,
          status: 'unconfirmed_payment_result',
          orderId,
          reason: unconfirmedReason,
          unconfirmedCount: newUnconfirmedCount,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: subscriptions.length,
      results,
    });
  } catch (err: any) {
    console.error(`Recurring billing cron handler exception: ${err?.name || 'Error'}: ${err?.message || String(err)}`);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
