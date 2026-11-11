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

    // 0. 결제 시도 중 30분 이상 경과한 'processing' 행을 'pending'으로 전환 및 알림 1회
    try {
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
      const { data: staleProcessingAttempts, error: staleQueryError } = await adminSupabase
        .from('payment_attempts')
        .select('*')
        .eq('status', 'processing')
        .lte('created_at', thirtyMinutesAgo);

      if (staleQueryError) {
        console.warn('[Billing Cron] Failed to query stale processing attempts (table might not exist yet):', staleQueryError.message);
      } else if (staleProcessingAttempts && staleProcessingAttempts.length > 0) {
        console.warn(`[Billing Cron] Found ${staleProcessingAttempts.length} stale processing payment attempt(s). Converting to pending.`);
        const staleIds = staleProcessingAttempts.map((a) => a.id);

        const { data: updatedStaleRows, error: updateStaleErr } = await adminSupabase
          .from('payment_attempts')
          .update({
            status: 'pending',
            reason: '30분 이상 processing 상태 지속으로 인한 자동 pending 전환',
          })
          .in('id', staleIds)
          .eq('status', 'processing')
          .select('id');

        if (updateStaleErr) {
          console.error('[Billing Cron] Failed to update stale processing attempts:', updateStaleErr.message);
        } else if (!updatedStaleRows || updatedStaleRows.length === 0) {
          console.warn('[Billing Cron] Stale processing -> pending update matched 0 rows (already updated elsewhere).');
        } else {
          const updatedIdSet = new Set(updatedStaleRows.map((r: any) => r.id));
          const transitionedAttempts = staleProcessingAttempts.filter((a) => updatedIdSet.has(a.id));
          try {
            const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
            const subjectPrefix = isTestMode ? '[테스트] ' : '';
            await notifyAdmin({
              subject: `${subjectPrefix}[긴급/수동 확인 필요] 30분 초과 미완료 결제 시도 ${transitionedAttempts.length}건 pending 전환`,
              text: `[매장닥터 결제 대기 자동 전환 알림 - 수동 확인 필요]

결제 시도 후 30분 이상 'processing' 상태로 남아 있던 결제 건 ${transitionedAttempts.length}건을 안전을 위해 'pending' 상태로 자동 전환하였습니다.
고객이 결제를 마쳤는지 토스 상점관리자에서 주문번호를 조회해 주시기 바랍니다.

■ 전환된 결제 시도 목록 (${transitionedAttempts.length}건)
${transitionedAttempts.map((a, idx) => `${idx + 1}. attempt_id: ${a.id} / user_id: ${a.user_id} / order_id: ${a.order_id} / 생성시각: ${a.created_at}`).join('\n')}

■ 조치 방법:
토스 상점관리자(https://dashboard.tosspayments.com)에서 해당 주문번호로 결제 승인 여부 확인 후,
관리자 대시보드(/admin)의 '결제 대기 관리'에서 [대기 해제]를 처리하거나 수동 구독을 반영해 주세요.`,
            });
          } catch (staleNotifyErr: any) {
            console.error(`[Billing Cron] Failed to send stale processing admin notification: ${staleNotifyErr?.name || 'Error'}: ${staleNotifyErr?.message || String(staleNotifyErr)}`);
          }
        }
      }
    } catch (staleErr: any) {
      console.warn('[Billing Cron] Exception while checking stale processing attempts:', staleErr?.message);
    }

    // 1. 결제일이 도래한 구독 조회 (취소되지 않았고, 빌링키와 다음 결제일이 모두 존재하며, 상태가 active 또는 past_due/연체)
    // 후보 조회 정렬 추가: next_billing_date 오름차순, id 오름차순
    const { data: candidates, error: fetchError } = await adminSupabase
      .from('subscriptions')
      .select('*')
      .in('status', ['active', 'past_due', '연체'])
      .is('cancelled_at', null)
      .not('billing_key', 'is', null)
      .not('next_billing_date', 'is', null)
      .lte('next_billing_date', now.toISOString())
      .order('next_billing_date', { ascending: true })
      .order('id', { ascending: true });

    if (fetchError) {
      // 만약 컬럼 미비 등으로 조회가 실패한 경우
      console.error('Failed to query subscriptions for billing:', fetchError.message);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const subscriptions = candidates || [];
    const results = [];
    const failedSubscriptionIds: string[] = [];
    const processedSubIds = new Set<string>();

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
      // 정지에 처음 들어갈 때(3일차) 한 번만 expires_at을 설정했으므로, 이후 알림 재발송 시에는 expires_at을 늘리지 않는다.
      if (unconfirmedCount >= 3) {
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
            if (sent) {
              await adminSupabase
                .from('subscriptions')
                .update({ unconfirmed_notified_at: now.toISOString() })
                .eq('id', sub.id);
            }
          } catch (notifyErr: any) {
            console.error(`[Billing Cron] Failed to send 3-day unconfirmed notification: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
          }
        }
        processedSubIds.add(sub.id);
        results.push({ id: sub.id, user_id: sub.user_id, status: 'unconfirmed_retry_paused', unconfirmedCount });
        continue;
      }

      // 3회 초과 최종 실패 시 이용 제한 처리
      if (retryCount >= 3) {
        processedSubIds.add(sub.id);
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

      // 청구 결과를 명확히 구분:
      // 1. CONFIRMED_SUCCESS: 응답 성공 또는 주문 조회 DONE 확인
      // 2. CONFIRMED_FAILURE: 토스가 카드 거절 등 명확한 실패 코드를 돌려준 경우
      // 3. UNCONFIRMED: 네트워크 오류, 타임아웃, 응답 파싱 실패, 5xx 에러, 또는 중복 오류 후 주문 조회 실패
      // 4. SYSTEM_ERROR: 토스 인증/상점 설정 오류 (HTTP 401, 403, 키/권한 오류 코드)
      let billingResult: 'CONFIRMED_SUCCESS' | 'CONFIRMED_FAILURE' | 'UNCONFIRMED' | 'SYSTEM_ERROR' = 'UNCONFIRMED';
      let isDuplicateResolved = false;
      let lookupApprovedAt: string | null = null;
      let paymentErrorMessage = '';
      let unconfirmedReason = '';
      let chargeInput: ChargeResponseInput = {};

      try {
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
            : outcomeResult.outcome === 'SYSTEM_ERROR'
              ? 'SYSTEM_ERROR'
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
      if (billingResult === 'SYSTEM_ERROR') {
        console.error(`[Billing Cron] CRITICAL: System error on sub ${sub.id}. Status: ${chargeInput?.status}, Code: ${chargeInput?.data?.code}. Halting batch.`);

        results.push({
          id: sub.id,
          user_id: sub.user_id,
          status: 'system_error_halted',
          orderId,
          error: paymentErrorMessage,
        });

        // 이번 실행에서 이미 처리된(SUCCESS/FAILURE/UNCONFIRMED) 구독을 제외하고,
        // status = 'active' 인 미처리/실패 구독에 대해 DB 값 기준(expires_at < grace) 조건부 UPDATE 수행
        const systemGraceDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        const graceIso = systemGraceDate.toISOString();
        let graceTargetCount = 0;
        let graceFailCount = 0;

        for (const candidateSub of subscriptions) {
          if (processedSubIds.has(candidateSub.id)) continue;
          if (candidateSub.status !== 'active') continue;
          graceTargetCount++;
          try {
            const { error: graceError } = await adminSupabase
              .from('subscriptions')
              .update({ expires_at: graceIso })
              .eq('id', candidateSub.id)
              .eq('status', 'active')
              .or(`expires_at.lt.${graceIso},expires_at.is.null`);

            if (graceError) {
              graceFailCount++;
              console.error(`[Billing Cron] Failed to extend expires_at for sub ${candidateSub.id}:`, graceError.message);
            }
          } catch (extErr: any) {
            graceFailCount++;
            console.error(`[Billing Cron] Exception extending expires_at for sub ${candidateSub.id}:`, extErr?.message);
          }
        }

        // 긴급 알림 1회 발송 (키 값 절대 금지, HTTP 상태와 오류 코드만)
        try {
          const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
          const subjectPrefix = isTestMode ? '[테스트] ' : '';
          await notifyAdmin({
            subject: `${subjectPrefix}[긴급/결제 시스템 오류] 키·상점 설정 오류로 오늘 청구 중단, 대상 ${graceTargetCount}건 이용 2일 유예`,
            text: `[매장닥터 정기결제 시스템 오류 알림]

정기결제 갱신 배치 처리 중 토스페이먼츠 인증 또는 상점 설정 오류(SYSTEM_ERROR)가 발생하여 키·상점 설정 오류로 오늘 청구 중단, 대상 ${graceTargetCount}건 이용 2일 유예 처리를 진행하였습니다.
구독의 next_billing_date, retry_count, orderId는 변경되지 않았습니다.

■ 오류 내용 (보안을 위해 키 값은 제외됨)
- HTTP 상태 코드: ${chargeInput?.status || 'N/A'}
- 토스 에러 코드: ${chargeInput?.data?.code || 'N/A'}
- 에러 메시지: ${paymentErrorMessage || 'N/A'}
- 발생 구독 ID: ${sub.id}
- 유예 적용 대상: 총 ${graceTargetCount}건 (갱신 실패 ${graceFailCount}건 / 2일 유예 만료시점: ${graceIso})

■ 조치 방법
1. Vercel 환경변수 TOSS_SECRET_KEY 설정 상태 확인 (공백, 앞뒤 특수문자, live/test 키 일치 여부)
2. 토스 상점관리자 개발자센터에서 API 키 및 상점 상태 확인${graceFailCount > 0 ? `\n3. 유예 갱신 실패 ${graceFailCount}건에 대해 DB expires_at 수동 확인 필요` : ''}`,
          });
        } catch (notifyErr: any) {
          console.error(`[Billing Cron] Failed to send system error admin notification: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
        }

        // 해당 실행의 나머지 청구를 즉시 중단
        break;
      }

      if (billingResult === 'CONFIRMED_SUCCESS') {
        processedSubIds.add(sub.id);
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
        processedSubIds.add(sub.id);
        failedSubscriptionIds.push(sub.id);
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
        processedSubIds.add(sub.id);
        // 결과 불확실: retry_count와 status를 변경하지 않음 (같은 orderId 유지, 연체/만료 처리 금지)
        const newUnconfirmedCount = unconfirmedCount + 1;
        const isNewUnconfirmedStreak = unconfirmedCount === 0;

        console.error(`[Billing Cron] UNCONFIRMED payment result for sub ${sub.id}, orderId ${orderId}. Reason: ${unconfirmedReason}`);

        if (newUnconfirmedCount >= 3) {
          // 3일 정지 상태: expires_at 은 정지에 처음 들어갈 때(newUnconfirmedCount === 3) 한 번만 "정지 시점 + 7일"로 정한다.
          // 이후 알림 재발송을 시도하는 날에는 expires_at 을 늘리지 않는다.
          let finalExpiresAt = sub.expires_at;
          if (newUnconfirmedCount === 3) {
            const pauseGraceDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            finalExpiresAt = sub.expires_at && new Date(sub.expires_at) > pauseGraceDate
              ? sub.expires_at
              : pauseGraceDate.toISOString();
          }

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
          // 유예 문구: 재시도 여부와 관계없이 계산한 유예 값이 이미 지난 날짜이면 "이용 유예 없음"으로 안내한다.
          const baseGraceDate = new Date(baseBillingDate.getTime() + 3 * 24 * 60 * 60 * 1000);
          const isGraceInPast = baseGraceDate <= now;

          let finalExpiresAt = sub.expires_at;
          let graceNoticeText = '';

          if (isGraceInPast) {
            graceNoticeText = '이용 유예 없음';
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
          const isGraceInPast = baseGraceDate <= now;
          const finalExpiresAt = isGraceInPast
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

    // cron 실행 끝에 FAILURE 가 1건 이상이면 요약 알림 1회 (건수와 구독 id 목록만, 개인정보·카드정보 금지)
    if (failedSubscriptionIds.length > 0) {
      try {
        const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
        const subjectPrefix = isTestMode ? '[테스트] ' : '';
        await notifyAdmin({
          subject: `${subjectPrefix}[정기결제 실패 요약] 총 ${failedSubscriptionIds.length}건 결제 실패`,
          text: `[매장닥터 정기결제 갱신 실패 요약 보고]

오늘 정기결제 배치 실행 중 총 ${failedSubscriptionIds.length}건의 구독 갱신 결제가 확정 실패(카드 한도초과/잔액부족/카드사 거절 등)하였습니다.
해당 구독들은 retry_count가 증가되었으며, 3회 이상 실패 시 만료 처리됩니다.

■ 실패 구독 ID 목록 (${failedSubscriptionIds.length}건)
${failedSubscriptionIds.map((id, idx) => `${idx + 1}. ${id}`).join('\n')}

(개인정보 및 카드 정보는 보안 정책상 포함되지 않습니다.)`,
        });
      } catch (notifyErr: any) {
        console.error(`[Billing Cron] Failed to send failure summary admin notification: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
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
