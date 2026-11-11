import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { getUserRole } from '@/utils/supabase/getUserRole';
import { BILLING_PLANS, PlanKey, encryptBillingKey } from '@/lib/billing';
import { notifyAdmin } from '@/lib/notify';
import {
  determineBillingOutcome,
  resolveBillingOutcome,
  type ChargeResponseInput,
  type LookupResponseInput,
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPlan = searchParams.get('plan');
  const allowedPlans: PlanKey[] = ['basic', 'pro', 'premium'];

  if (!rawPlan || !allowedPlans.includes(rawPlan as PlanKey)) {
    return NextResponse.json({ error: '유효하지 않은 플랜입니다.' }, { status: 400 });
  }

  const plan = rawPlan as PlanKey;
  const customerKey = searchParams.get('customerKey');
  const authKey = searchParams.get('authKey');

  // 1. 필수 파라미터 체크 (빌링 인증키 및 고객 식별키)
  if (!customerKey || !authKey) {
    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', 'missing_params');
    return NextResponse.redirect(failUrl);
  }

  // 2. 현재 로그인 사용자 체크
  const userSupabase = createServerSupabase();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  if (!user) {
    const failUrl = new URL('/login', request.url);
    failUrl.searchParams.set('redirect', `/payment?plan=${plan}`);
    return NextResponse.redirect(failUrl);
  }

  // 2-A. 역할 체크: owner만 결제 및 구독 승인 가능
  const role = await getUserRole();
  if (role !== 'owner') {
    const redirectUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // 2-B. 이미 활성 구독 중인 사용자의 중복 결제 진입 차단 (토스 API 호출 전 검증)
  // 조건: status IN ('active', 'cancelled', 'past_due') AND expires_at > now()
  const adminSupabase = getAdminClient();
  if (!adminSupabase) {
    console.error('Database client initialization failed in confirm route');
    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', 'server_error');
    return NextResponse.redirect(failUrl);
  }

  const nowIso = new Date().toISOString();
  const { data: existingSub, error: existingSubError } = await adminSupabase
    .from('subscriptions')
    .select('id, status, expires_at')
    .eq('user_id', user.id)
    .in('status', ['active', 'cancelled', 'past_due'])
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (existingSubError) {
    console.error('Failed to check existing subscription:', existingSubError.message);
  }

  if (existingSub) {
    // 이미 이용 중인 구독이 있는 경우 JSON 409 대신 대시보드로 이동시키고 안내 표시
    const dashboardUrl = new URL('/dashboard', request.url);
    dashboardUrl.searchParams.set('notice', 'already_subscribed');
    return NextResponse.redirect(dashboardUrl);
  }

  // 3. 토스페이먼츠 시크릿 키 체크 (폴백 없이 환경변수 미설정 시 즉시 에러)
  const tossSecretKey = process.env.TOSS_SECRET_KEY;
  if (!tossSecretKey) {
    console.error('TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.');
    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', 'server_error');
    return NextResponse.redirect(failUrl);
  }

  const encodedCredential = Buffer.from(`${tossSecretKey}:`).toString('base64');

  let paymentKey: string | null = null;
  const orderId = `sub_${user.id.slice(0, 8)}_${Date.now()}`;
  let planDetail: (typeof BILLING_PLANS)[PlanKey] | null = null;
  let hasAttemptedCancel = false;
  let cancelResultCache: { success: boolean; error?: string } | null = null;
  let attemptId: string | null = null;

  // 2-C. 결제 대기 차단을 "먼저 잠그고 결제"로 변경 (fail-closed)
  // 1) 409(기존 구독) 검사 후, 빌링키 발급 전에 status='processing' 행을 insert 한다.
  const { data: attemptInsertData, error: attemptInsertError } = await adminSupabase
    .from('payment_attempts')
    .insert({
      user_id: user.id,
      order_id: orderId,
      status: 'processing',
      reason: '결제 진행 중',
    })
    .select('id')
    .single();

  if (attemptInsertError) {
    // 2) insert 가 unique 위반이면 결제하지 않고 /payment?notice=payment_pending
    const isUniqueViolation =
      attemptInsertError.code === '23505' ||
      attemptInsertError.message?.toLowerCase().includes('unique') ||
      attemptInsertError.message?.toLowerCase().includes('duplicate key') ||
      attemptInsertError.message?.includes('uq_payment_attempts_user_active');

    if (isUniqueViolation) {
      console.warn(`[Confirm] User ${user.id} has an active payment attempt (unique lock). Redirecting to payment_pending.`);
      const pendingUrl = new URL('/payment', request.url);
      pendingUrl.searchParams.set('plan', plan);
      pendingUrl.searchParams.set('notice', 'payment_pending');
      return NextResponse.redirect(pendingUrl);
    }

    // 3) insert 가 다른 이유로 실패하면(테이블 없음 포함) 결제하지 않고 error=server_error + 긴급 알림. 잠금 없이 결제를 진행하지 않는다.
    console.error(`[Confirm] Fail-closed: Failed to acquire processing lock for user ${user.id}: ${attemptInsertError.code} - ${attemptInsertError.message}`);
    try {
      const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
      const subjectPrefix = isTestMode ? '[테스트] ' : '';
      await notifyAdmin({
        subject: `${subjectPrefix}[긴급/결제 차단] 결제 선점 잠금(processing) 실패 - ${user.email}`,
        text: `[매장닥터 결제 안전 차단 알림]

사용자 ${user.id} (${user.email})의 결제 처리 중 payment_attempts 테이블 선점 잠금(status='processing') 생성에 실패하여 결제를 안전하게 차단(fail-closed)하였습니다.
잠금 없이 결제가 진행되지 않도록 토스 API 호출을 일절 수행하지 않았습니다.

■ 오류 내용
- DB 에러 코드: ${attemptInsertError.code || 'N/A'}
- 에러 메시지: ${attemptInsertError.message || 'N/A'}

■ 조치 방법
payment_attempts 테이블 및 유니크 인덱스 생성 마이그레이션(20261111_create_payment_attempts.sql, 20261111_payment_attempts_processing.sql)이 Supabase에 적용되었는지 확인해 주세요.`,
      });
    } catch (notifyErr: any) {
      console.error(`[Confirm] Failed to send lock failure admin notification: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
    }

    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', 'server_error');
    return NextResponse.redirect(failUrl);
  }

  attemptId = attemptInsertData.id;

  // 4) attempt 상태 업데이트 헬퍼 (실패 시 processing 유지로 차단 유지, confirm 경로는 expectedStatus='processing' 조건 강제)
  async function updateAttemptStatus(
    newStatus: 'resolved' | 'pending',
    reason: string,
    expectedStatus: 'processing' | 'pending' | null = 'processing'
  ) {
    if (!attemptId || !adminSupabase) return;
    try {
      const payload: Record<string, any> = {
        status: newStatus,
        reason,
      };
      if (newStatus === 'resolved') {
        payload.resolved_at = new Date().toISOString();
      }
      let query = adminSupabase
        .from('payment_attempts')
        .update(payload)
        .eq('id', attemptId);
      if (expectedStatus) {
        query = query.eq('status', expectedStatus);
      }
      const { data: updatedRows, error: updErr } = await query.select('id');
      if (updErr) {
        console.error(`[Confirm] Failed to update payment_attempt ${attemptId} to ${newStatus}:`, updErr.message);
      } else if (!updatedRows || updatedRows.length === 0) {
        console.warn(`[Confirm] payment_attempt ${attemptId} update to '${newStatus}' matched 0 rows (expectedStatus='${expectedStatus}'). Keeping current state.`);
      }
    } catch (err: any) {
      console.error(`[Confirm] Exception updating payment_attempt ${attemptId}:`, err?.message);
    }
  }

  // 알림 본문용 paymentKey 마스킹 (마지막 6자리만 노출)
  function maskPaymentKey(key: string | null | undefined): string {
    if (!key) return '(없음)';
    if (key.length <= 6) return key;
    return `${'*'.repeat(key.length - 6)}${key.slice(-6)}`;
  }

  // 토스 주문번호로 결제 조회 API: GET https://api.tosspayments.com/v1/payments/orders/{orderId}
  async function lookupPaymentByOrderId(targetOrderId: string): Promise<LookupResponseInput> {
    try {
      const res = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(targetOrderId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${encodedCredential}`,
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          data,
          error: data?.message || `HTTP ${res.status}`,
        };
      }
      return { ok: true, status: res.status, data };
    } catch (err: any) {
      return { ok: false, status: 0, error: err?.message || '네트워크 조회 실패' };
    }
  }

  async function cancelChargedPayment(reason: string) {
    if (hasAttemptedCancel && cancelResultCache) {
      return cancelResultCache;
    }
    if (!paymentKey) {
      return { success: false, error: 'paymentKey 누락' };
    }
    hasAttemptedCancel = true;
    try {
      // 토스 결제 취소 API (Idempotency-Key로 네트워크 재시도로 인한 중복 취소 부작용 방지)
      const cancelResponse = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${encodedCredential}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `cancel_${paymentKey}`,
        },
        body: JSON.stringify({
          cancelReason: reason,
        }),
      });
      const cancelData = await cancelResponse.json().catch(() => null);
      if (cancelResponse.ok) {
        cancelResultCache = { success: true };
        return cancelResultCache;
      }
      cancelResultCache = { success: false, error: cancelData?.message || `HTTP ${cancelResponse.status}` };
      return cancelResultCache;
    } catch (err: any) {
      cancelResultCache = { success: false, error: err?.message || '네트워크 예외' };
      return cancelResultCache;
    }
  }

  try {
    // 4. 빌링키 발급 요청 (POST /v1/billing/authorizations/issue)
    const issueResponse = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encodedCredential}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerKey,
        authKey,
      }),
    });

    const issueData = await issueResponse.json();

    if (!issueResponse.ok || !issueData.billingKey) {
      console.error(`Toss billing authorizations issue failed: ${issueData?.code || 'UNKNOWN'}: ${issueData?.message || '발급 실패'}`);
      await updateAttemptStatus('resolved', issueData?.message || '카드 등록 및 빌링키 발급 실패');
      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'card_auth_failed');
      return NextResponse.redirect(failUrl);
    }

    const billingKey = issueData.billingKey;

    // 5. 첫 결제 실행 (POST /v1/billing/{billingKey})
    planDetail = BILLING_PLANS[plan];

    let chargeInput: ChargeResponseInput;
    try {
      const chargeResponse = await fetch(`https://api.tosspayments.com/v1/billing/${billingKey}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${encodedCredential}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerKey,
          amount: planDetail.price,
          orderId,
          orderName: `매장닥터 ${planDetail.name} 정기구독`,
          customerEmail: user.email,
          customerName: user.user_metadata?.name || '매장 대표님',
        }),
      });

      let chargeData: any = null;
      let parseError = false;
      try {
        chargeData = await chargeResponse.json();
      } catch {
        parseError = true;
      }

      chargeInput = {
        ok: chargeResponse.ok,
        status: chargeResponse.status,
        data: chargeData,
        parseError,
      };

      if (!chargeResponse.ok) {
        console.error(`Toss first billing charge failed: ${chargeData?.code || 'UNKNOWN'}: ${chargeData?.message || '승인 실패'}`);
      }
    } catch (chargeErr: any) {
      chargeInput = {
        ok: false,
        status: (chargeErr?.name === 'AbortError' || chargeErr?.code === 'ETIMEDOUT') ? 408 : 0,
        error: chargeErr,
      };
      console.error(`Toss first billing charge network exception: ${chargeErr?.name || 'Error'}: ${chargeErr?.message || String(chargeErr)}`);
    }

    // 공통 판정 함수 호출
    const outcomeResult = await resolveBillingOutcome({
      charge: chargeInput,
      fetchLookup: () => lookupPaymentByOrderId(orderId!),
    });

    if (outcomeResult.outcome === 'SYSTEM_ERROR') {
      console.error(`[Confirm] SYSTEM_ERROR during charge for user ${user.id}, orderId ${orderId}. Status: ${chargeInput.status}, Code: ${chargeInput.data?.code}`);
      await updateAttemptStatus('resolved', outcomeResult.errorMessage || '결제 시스템 인증/설정 오류');

      try {
        const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
        const subjectPrefix = isTestMode ? '[테스트] ' : '';
        await notifyAdmin({
          subject: `${subjectPrefix}[긴급/결제 시스템 오류] 첫 결제 승인 시스템 오류 - ${user.email}`,
          text: `[매장닥터 결제 시스템 오류 알림]

신규 결제(첫 결제) 승인 처리 중 토스페이먼츠 인증 또는 상점 설정 오류(SYSTEM_ERROR)가 발생하였습니다.

■ 오류 내용 (보안을 위해 키 값은 제외됨)
- 사용자 식별자: ${user.id} (${user.email})
- 토스 주문번호: ${orderId}
- HTTP 상태 코드: ${chargeInput.status || 'N/A'}
- 토스 에러 코드: ${chargeInput.data?.code || 'N/A'}
- 에러 메시지: ${chargeInput.data?.message || 'N/A'}

■ 조치 방법
1. Vercel 환경변수 TOSS_SECRET_KEY 설정 상태 확인
2. 토스 상점관리자 개발자센터에서 API 키 및 계약/상점 상태 확인`,
        });
      } catch (notifyErr: any) {
        console.error(`[Confirm] Failed to send system error admin notification: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
      }

      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'server_error');
      return NextResponse.redirect(failUrl);
    }

    if (outcomeResult.outcome === 'UNCONFIRMED') {
      // 4) UNCONFIRMED -> payment_attempts 행을 'pending'으로 업데이트
      await updateAttemptStatus('pending', outcomeResult.unconfirmedReason || outcomeResult.errorMessage || '첫 결제 결과 미확인');

      // UNCONFIRMED 이면 구독은 저장하지 않고 [수동 확인 필요] 긴급 알림 전송 (attemptId 및 수동 해제 방법 포함)
      const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
      const subjectPrefix = isTestMode ? '[테스트] ' : '';
      try {
        await notifyAdmin({
          subject: `${subjectPrefix}[긴급/수동 확인 필요] 결제 상태 미확인 건 - ${user.email}`,
          text: `[매장닥터 결제 상태 미확인 알림 - 수동 확인 필요]

첫 정기구독 결제 승인 요청의 결과가 불확실(네트워크 오류/타임아웃/조회 불가 등)하여 구독 저장을 보류하였습니다.
고객 카드가 결제되었을 가능성이 있으므로 토스 상점관리자에서 즉시 해당 주문번호를 확인해 주시기 바랍니다.

■ 결제 및 사용자 정보
- 구독 사용자 ID: ${user.id} (${user.email})
- 주문번호: ${orderId}
- 결제 시도 대기 ID (payment_attempts.id): ${attemptId || '기록 실패'}
- 결제키(paymentKey 끝 6자리): ${maskPaymentKey(outcomeResult.paymentKey)}
- 플랜: ${planDetail.name} (${planDetail.price.toLocaleString()}원)
- 불확실 사유: ${outcomeResult.unconfirmedReason || outcomeResult.errorMessage || '상태 미확인'}

■ 조치 방법 (결제 확인 및 대기 해제)
1. 토스 상점관리자(https://dashboard.tosspayments.com) 접속 → 결제조회 메뉴에서 주문번호(${orderId})로 검색하여 결제 완료 여부를 확인합니다.
2. 대기 해제는 관리자 대시보드(/admin)의 '결제 대기 관리'에서 [대기 해제]를 클릭하거나, Supabase SQL 편집기에서 다음 쿼리를 실행합니다:
   UPDATE payment_attempts SET status = 'resolved', resolved_at = now() WHERE user_id = '${user.id}' AND status IN ('pending', 'processing');`,
        });
      } catch (notifyErr: any) {
        console.error(`[Confirm] Failed to send admin notification for unconfirmed outcome: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
      }

      const pendingUrl = new URL('/payment', request.url);
      pendingUrl.searchParams.set('plan', plan);
      pendingUrl.searchParams.set('notice', 'payment_pending');
      return NextResponse.redirect(pendingUrl);
    }

    if (outcomeResult.outcome === 'FAILURE') {
      await updateAttemptStatus('resolved', outcomeResult.errorMessage || '결제 승인 실패');
      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'payment_failed');
      return NextResponse.redirect(failUrl);
    }

    // outcome === 'SUCCESS'
    paymentKey = outcomeResult.paymentKey || chargeInput.data?.paymentKey;

    // 만약 첫 청구 요청이 실패/네트워크 단절이었으나 조회로 DONE이 확인된 경우:
    // 응답 유실 건이므로 즉시 자동 취소하고 사용자에게 재시도 안내
    if (!chargeInput.ok) {
      const cancelResult = await cancelChargedPayment('응답 유실 확인 후 자동 취소');
      await updateAttemptStatus('resolved', '응답 유실 확인 후 자동 취소');
      const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
      const subjectPrefix = isTestMode ? '[테스트] ' : '';
      try {
        await notifyAdmin({
          subject: `${subjectPrefix}[긴급${cancelResult.success ? '' : '/수동취소필요'}] 결제 응답 유실 건 자동 복구 (${cancelResult.success ? '자동취소완료' : '자동취소실패'}) - ${user.email}`,
          text: `[매장닥터 결제 응답 유실 자동 복구 알림]

첫 정기구독 결제 승인 요청 중 실패/오류 응답을 받았으나, 주문번호(${orderId}) 조회 결과 토스 결제가 완료(DONE)된 것으로 확인되었습니다.
${cancelResult.success ? '해당 결제는 즉시 전액 자동 취소되었습니다.' : `자동 결제 취소에 실패하여 토스 상점관리자에서 수동 취소가 필요합니다.\n취소 실패 사유: ${cancelResult.error}`}

■ 결제 및 사용자 정보
- 주문번호: ${orderId}
- 사용자 식별자: ${user.email} (ID: ${user.id})
- 결제키(paymentKey): ${maskPaymentKey(paymentKey)}
- 플랜: ${planDetail.name} (${planDetail.price.toLocaleString()}원)`,
        });
      } catch (notifyErr: any) {
        console.error(`[Confirm] Failed to send admin notification for loss recovery: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
      }

      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'payment_cancelled');
      return NextResponse.redirect(failUrl);
    }

    // 6. Supabase에 구독 정보 저장 (billingKey는 암호화하여 저장)
    let dbError: { message: string } | null = null;

    const startedAt = new Date();
    const nextBillingDate = new Date(startedAt);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    const expiresAt = nextBillingDate;

    const encryptedBillingKey = encryptBillingKey(billingKey);

    const subscriptionPayload: Record<string, any> = {
      user_id: user.id,
      plan: plan,
      status: 'active',
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      next_billing_date: nextBillingDate.toISOString(),
      customer_key: customerKey,
      billing_key: encryptedBillingKey,
      retry_count: 0,
      cancelled_at: null,
      last_paid_at: startedAt.toISOString(),
      last_order_id: orderId,
    };

    const { error: upsertError } = await adminSupabase
      .from('subscriptions')
      .upsert(subscriptionPayload, {
        onConflict: 'user_id',
      });

    dbError = upsertError;

    // DB에 빌링 확장 컬럼이 아직 반영되지 않은 경우 기본 컬럼으로 폴백 저장
    if (dbError && dbError.message && dbError.message.includes('column')) {
      console.warn('Subscription upsert failed with extended columns, attempting core columns:', dbError.message);
      const fallbackPayload = {
        user_id: user.id,
        plan: plan,
        status: 'active',
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
      const { error: fallbackError } = await adminSupabase
        .from('subscriptions')
        .upsert(fallbackPayload, {
          onConflict: 'user_id',
        });
      dbError = fallbackError;
    }

    // 첫 결제 성공 후 subscriptions 저장이 실패한 경우 안전장치 실행
    if (dbError) {
      console.error('Database subscription saving failed after charge:', dbError.message);

      const cancelResult = await cancelChargedPayment('구독 저장 실패로 인한 자동 취소');
      await updateAttemptStatus('resolved', '구독 저장 실패로 인한 자동 취소');
      const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
      const subjectPrefix = isTestMode ? '[테스트] ' : '';

      if (cancelResult.success) {
        try {
          await notifyAdmin({
            subject: `${subjectPrefix}[긴급] 구독 저장 실패로 인한 결제 자동 취소 완료 - ${user.email}`,
            text: `[매장닥터 결제 자동 취소 알림]

첫 정기구독 결제가 승인되었으나, 데이터베이스(subscriptions) 저장에 실패하여 승인된 결제를 즉시 전액 자동 취소하였습니다.

■ 결제 및 사용자 정보
- 주문번호: ${orderId}
- 사용자 식별자: ${user.email} (ID: ${user.id})
- 플랜: ${planDetail.name} (${planDetail.price.toLocaleString()}원)
- DB 실패 사유: ${dbError.message}
- 처리 상태: 토스 결제 취소 API를 통해 전액 자동 취소 완료 (cancelReason: 구독 저장 실패로 인한 자동 취소)`,
          });
        } catch (notifyErr: any) {
          console.error(`[Confirm] Failed to send admin notification for auto-cancel: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
        }
      } else {
        // 자동 취소 실패 시 -> 관리자 수동 취소 필요 긴급 알림
        try {
          await notifyAdmin({
            subject: `${subjectPrefix}[긴급/수동취소필요] 구독 저장 실패 후 자동 취소 실패 - ${user.email}`,
            text: `[매장닥터 결제 자동 취소 실패 - 관리자 수동 취소 필요]

첫 정기구독 결제가 승인된 후 데이터베이스(subscriptions) 저장에 실패하였으나, 자동 결제 취소 API 호출마저 실패하였습니다.
고객에게 미구독 상태의 결제가 유지될 수 있으니 토스 상점관리자에서 즉시 수동 취소(환불)해 주시기 바랍니다.

■ 결제 및 사용자 정보
- 주문번호: ${orderId}
- 사용자 식별자: ${user.email} (ID: ${user.id})
- 플랜: ${planDetail.name} (${planDetail.price.toLocaleString()}원)
- DB 실패 사유: ${dbError.message}
- 취소 실패 사유: ${cancelResult.error}

■ 조치 방법
토스 상점관리자(https://dashboard.tosspayments.com) 접속 → 결제조회 메뉴에서 주문번호(${orderId})로 검색 후 즉시 수동 결제 취소를 진행해 주세요.`,
          });
        } catch (notifyErr: any) {
          console.error(`[Confirm] Failed to send admin notification for cancel failure: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
        }
      }

      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'payment_cancelled');
      return NextResponse.redirect(failUrl);
    }

    // 7. 결제 및 정기구독 활성화 완료 -> 대시보드로 이동
    await updateAttemptStatus('resolved', 'success');
    const successUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(successUrl);
  } catch (error: any) {
    console.error(`Billing confirm exception occurred: ${error?.name || 'Error'}: ${error?.message || String(error)}`);

    // 결제 승인 요청 후 응답 유실(네트워크 단절/타임아웃 등)로 paymentKey가 없는 경우
    if (!paymentKey && orderId && user) {
      console.warn(`[Confirm] paymentKey missing after exception for orderId ${orderId}. Querying Toss order lookup...`);
      const outcomeResult = await resolveBillingOutcome({
        charge: { ok: false, error },
        fetchLookup: () => lookupPaymentByOrderId(orderId!),
      });

      if (outcomeResult.outcome === 'SUCCESS') {
        paymentKey = outcomeResult.paymentKey;
        await updateAttemptStatus('resolved', '예외 후 주문 조회 DONE 확인');
        console.log(`[Confirm] OrderId ${orderId} verified DONE via order lookup. Proceeding to auto-cancel.`);
      } else if (outcomeResult.outcome === 'UNCONFIRMED') {
        await updateAttemptStatus('pending', outcomeResult.unconfirmedReason || '결제 결과 미확인');
        console.error(`[Confirm] CRITICAL: Payment status unconfirmed for orderId ${orderId}, user ${user.email}. Reason: ${outcomeResult.unconfirmedReason}`);
        const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
        const subjectPrefix = isTestMode ? '[테스트] ' : '';
        try {
          await notifyAdmin({
            subject: `${subjectPrefix}[긴급/수동 확인 필요] 결제 상태 미확인 건 - ${user.email}`,
            text: `[매장닥터 결제 상태 미확인 알림 - 수동 확인 필요]

첫 정기구독 결제 승인 요청 중 네트워크 단절/예외가 발생하였고, 토스 주문번호 조회도 실패하거나 일시 미확인되어 결제 성패 여부를 확정할 수 없습니다.
고객 카드가 결제되었을 가능성이 있으므로 토스 상점관리자에서 즉시 해당 주문번호를 확인해 주시기 바랍니다.

■ 결제 및 사용자 정보
- 구독 사용자 ID: ${user.id} (${user.email})
- 주문번호: ${orderId}
- 플랜: ${planDetail?.name || plan} (${planDetail?.price ? planDetail.price.toLocaleString() + '원' : ''})
- 예외 내용: ${error?.message || String(error)}
- 불확실 사유: ${outcomeResult.unconfirmedReason || '상태 미확인'}

■ 조치 방법
토스 상점관리자(https://dashboard.tosspayments.com) 접속 → 결제조회 메뉴에서 주문번호(${orderId})로 검색하여 결제 완료 여부를 확인하시고, 승인되어 있다면 즉시 취소 처리해 주세요.`,
          });
        } catch (notifyErr: any) {
          console.error(`[Confirm] Fallback: notifyAdmin failed for unconfirmed payment: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
        }
      }
    }

    // paymentKey가 확보된 경우(정상 승인 후 예외 또는 주문 조회로 승인 확인된 건) 자동 취소 및 관리자 알림 실행
    if (paymentKey && user && orderId) {
      try {
        const cancelResult = await cancelChargedPayment('구독 처리 예외로 인한 자동 취소');
        const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
        const subjectPrefix = isTestMode ? '[테스트] ' : '';
        await notifyAdmin({
          subject: `${subjectPrefix}[긴급${cancelResult.success ? '' : '/수동취소필요'}] 결제 후 서버 예외 발생 (${cancelResult.success ? '자동취소완료' : '자동취소실패'}) - ${user.email}`,
          text: `[매장닥터 결제 후 예외 발생 알림]

첫 정기구독 결제가 승인된 후 서버 처리 중 예외가 발생하였습니다.
${cancelResult.success ? '결제는 즉시 전액 자동 취소되었습니다.' : `자동 결제 취소에 실패하여 토스 상점관리자에서 수동 취소가 필요합니다.\n취소 실패 사유: ${cancelResult.error}`}

■ 결제 및 사용자 정보
- 주문번호: ${orderId}
- 사용자 식별자: ${user.email} (ID: ${user.id})
- 플랜: ${planDetail?.name || plan} (${planDetail?.price ? planDetail.price.toLocaleString() + '원' : ''})
- 예외 내용: ${error?.message || String(error)}`,
        });
      } catch (notifyErr: any) {
        console.error(`[Confirm] Exception handler notifyAdmin failed: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
      }
    }

    if (paymentKey) {
      await updateAttemptStatus('resolved', '서버 예외 발생 후 자동 취소');
    } else {
      await updateAttemptStatus('resolved', `서버 예외 발생: ${error?.message || 'UNKNOWN'}`);
    }

    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', paymentKey ? 'payment_cancelled' : 'payment_failed');
    return NextResponse.redirect(failUrl);
  }
}
