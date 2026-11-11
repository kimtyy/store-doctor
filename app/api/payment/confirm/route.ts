import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { getUserRole } from '@/utils/supabase/getUserRole';
import { BILLING_PLANS, PlanKey, encryptBillingKey } from '@/lib/billing';
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
    failUrl.searchParams.set('error', 'true');
    failUrl.searchParams.set('message', '카드 등록 및 빌링 필수 정보가 누락되었습니다.');
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
    failUrl.searchParams.set('error', 'true');
    failUrl.searchParams.set('message', '결제 서버 데이터베이스 초기화 오류가 발생했습니다.');
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
    failUrl.searchParams.set('error', 'true');
    failUrl.searchParams.set('message', '결제 서버 환경변수 설정 오류가 발생했습니다. 관리자에게 문의해 주세요.');
    return NextResponse.redirect(failUrl);
  }

  const encodedCredential = Buffer.from(`${tossSecretKey}:`).toString('base64');

  let paymentKey: string | null = null;
  let orderId: string | null = null;
  let planDetail: (typeof BILLING_PLANS)[PlanKey] | null = null;
  let hasAttemptedCancel = false;
  let cancelResultCache: { success: boolean; error?: string } | null = null;
  let chargeNetworkError: any = null;

  // 알림 본문용 paymentKey 마스킹 (마지막 6자리만 노출)
  function maskPaymentKey(key: string | null | undefined): string {
    if (!key) return '(없음)';
    if (key.length <= 6) return key;
    return `${'*'.repeat(key.length - 6)}${key.slice(-6)}`;
  }

  // 토스 주문번호로 결제 조회 API: GET https://api.tosspayments.com/v1/payments/orders/{orderId}
  async function lookupPaymentByOrderId(targetOrderId: string) {
    try {
      const res = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(targetOrderId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${encodedCredential}`,
        },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        return {
          success: false,
          status: res.status,
          data: errorData,
          error: errorData?.message || `HTTP ${res.status}`,
        };
      }
      const data = await res.json();
      return { success: true, data, status: res.status };
    } catch (err: any) {
      return { success: false, error: err?.message || '네트워크 조회 실패' };
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
      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'true');
      failUrl.searchParams.set('message', issueData.message || '카드 등록 및 빌링키 발급에 실패했습니다.');
      return NextResponse.redirect(failUrl);
    }

    const billingKey = issueData.billingKey;

    // 5. 첫 결제 실행 (POST /v1/billing/{billingKey})
    planDetail = BILLING_PLANS[plan];
    orderId = `sub_${user.id.slice(0, 8)}_${Date.now()}`;

    let chargeResponse: Response;
    try {
      chargeResponse = await fetch(`https://api.tosspayments.com/v1/billing/${billingKey}`, {
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
    } catch (chargeErr: any) {
      chargeNetworkError = chargeErr;
      throw chargeErr;
    }

    const chargeData = await chargeResponse.json().catch(() => ({}));

    if (!chargeResponse.ok) {
      console.error(`Toss first billing charge failed: ${chargeData?.code || 'UNKNOWN'}: ${chargeData?.message || '승인 실패'}`);

      // 토스 오류/실패 응답 시에도 혹시 승인되었는지 주문번호로 결제 조회 확인
      const lookup = await lookupPaymentByOrderId(orderId);
      if (lookup.success && lookup.data?.status === 'DONE') {
        paymentKey = lookup.data.paymentKey;
        const cancelResult = await cancelChargedPayment('응답 유실 확인 후 자동 취소');
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
        } catch (notifyErr) {
          console.error('[Confirm] Failed to send admin notification for loss recovery:', notifyErr);
        }

        const failUrl = new URL('/payment', request.url);
        failUrl.searchParams.set('plan', plan);
        failUrl.searchParams.set('error', 'true');
        failUrl.searchParams.set('message', '결제가 취소되었습니다. 다시 시도해 주세요.');
        return NextResponse.redirect(failUrl);
      }

      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'true');
      failUrl.searchParams.set('message', chargeData.message || '첫 정기구독 결제 승인에 실패했습니다.');
      return NextResponse.redirect(failUrl);
    }

    paymentKey = chargeData.paymentKey;

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
        } catch (notifyErr) {
          console.error('[Confirm] Failed to send admin notification for auto-cancel:', notifyErr);
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
        } catch (notifyErr) {
          console.error('[Confirm] Failed to send admin notification for cancel failure:', notifyErr);
        }
      }

      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'true');
      failUrl.searchParams.set('message', '결제가 취소되었습니다. 다시 시도해 주세요.');
      return NextResponse.redirect(failUrl);
    }

    // 7. 결제 및 정기구독 활성화 완료 -> 대시보드로 이동
    const successUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(successUrl);
  } catch (error: any) {
    console.error(`Billing confirm exception occurred: ${error?.name || 'Error'}: ${error?.message || String(error)}`);

    // 결제 승인 요청 후 응답 유실(네트워크 단절/타임아웃 등)로 paymentKey가 없는 경우
    if (!paymentKey && orderId && user) {
      console.warn(`[Confirm] paymentKey missing after exception for orderId ${orderId}. Querying Toss order lookup...`);
      const lookup = await lookupPaymentByOrderId(orderId);
      if (lookup.success && lookup.data?.status === 'DONE') {
        paymentKey = lookup.data.paymentKey;
        console.log(`[Confirm] OrderId ${orderId} verified DONE via order lookup. Proceeding to auto-cancel.`);
      } else if (!lookup.success) {
        const isSafeNotFound =
          lookup.status === 404 &&
          lookup.data?.code === 'NOT_FOUND_PAYMENT' &&
          !chargeNetworkError;

        if (isSafeNotFound) {
          // 토스로부터 명확한 응답을 받았고 조회가 404 NOT_FOUND_PAYMENT인 경우 -> 미청구 확인으로 간주하여 긴급 알림 생략
          console.log(`[Confirm] OrderId ${orderId} returned 404 NOT_FOUND_PAYMENT with definitive charge response. Skipping admin alert.`);
        } else {
          // 청구 요청 네트워크 오류/타임아웃 발생 후 조회 404이거나, 404 이외의 조회 실패, 다른 에러 코드인 경우 -> 긴급 알림 발송
          console.error(`[Confirm] CRITICAL: Payment status unconfirmed for orderId ${orderId}, user ${user.email}. Lookup status: ${lookup.status}, code: ${lookup.data?.code}, chargeNetworkError: ${Boolean(chargeNetworkError)}`);
          const isTestMode = Boolean(process.env.TOSS_SECRET_KEY?.startsWith('test_sk_'));
          const subjectPrefix = isTestMode ? '[테스트] ' : '';
          try {
            await notifyAdmin({
              subject: `${subjectPrefix}[긴급/수동 확인 필요] 결제 상태 미확인 건 - ${user.email}`,
              text: `[매장닥터 결제 상태 미확인 알림 - 수동 확인 필요]

첫 정기구독 결제 승인 요청 중 네트워크 단절/예외가 발생하였고, 토스 주문번호 조회도 실패하거나 일시 미확인되어 결제 성패 여부를 확정할 수 없습니다.
고객 카드가 결제되었을 가능성이 있으므로 토스 상점관리자에서 즉시 해당 주문번호를 확인해 주시기 바랍니다.

■ 결제 및 사용자 정보
- 주문번호: ${orderId}
- 사용자 식별자: ${user.email} (ID: ${user.id})
- 플랜: ${planDetail?.name || plan} (${planDetail?.price ? planDetail.price.toLocaleString() + '원' : ''})
- 예외 내용: ${error?.message || String(error)}
- 청구 요청 네트워크 단절/타임아웃 여부: ${chargeNetworkError ? '예 (네트워크 단절/타임아웃)' : '아니오'}
- 토스 조회 결과: HTTP ${lookup.status || 'N/A'}${lookup.data?.code ? ` (${lookup.data.code})` : ''} / ${lookup.error || 'N/A'}

■ 조치 방법
토스 상점관리자(https://dashboard.tosspayments.com) 접속 → 결제조회 메뉴에서 주문번호(${orderId})로 검색하여 결제 완료 여부를 확인하시고, 승인되어 있다면 즉시 취소 처리해 주세요.`,
            });
          } catch (notifyErr: any) {
            console.error(`[Confirm] Fallback: notifyAdmin failed for unconfirmed payment: ${notifyErr?.name || 'Error'}: ${notifyErr?.message || String(notifyErr)}`);
          }
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
      } catch (notifyErr) {
        console.error('[Confirm] Exception handler notifyAdmin failed:', notifyErr);
      }
    }

    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', 'true');
    failUrl.searchParams.set('message', paymentKey ? '결제가 취소되었습니다. 다시 시도해 주세요.' : '결제가 완료되지 않았습니다. 다시 시도해 주세요.');
    return NextResponse.redirect(failUrl);
  }
}
