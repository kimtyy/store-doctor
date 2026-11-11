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

  async function cancelChargedPayment(reason: string) {
    if (!paymentKey) {
      return { success: false, error: 'paymentKey 누락' };
    }
    try {
      const cancelResponse = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${encodedCredential}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancelReason: reason,
        }),
      });
      const cancelData = await cancelResponse.json().catch(() => null);
      if (cancelResponse.ok) {
        return { success: true };
      }
      return { success: false, error: cancelData?.message || `HTTP ${cancelResponse.status}` };
    } catch (err: any) {
      return { success: false, error: err?.message || '네트워크 예외' };
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
      console.error('Toss billing authorizations issue failed:', issueData.message || issueData);
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

    const chargeData = await chargeResponse.json();

    if (!chargeResponse.ok) {
      console.error('Toss first billing charge failed:', chargeData.message || chargeData);
      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'true');
      failUrl.searchParams.set('message', chargeData.message || '첫 정기구독 결제 승인에 실패했습니다.');
      return NextResponse.redirect(failUrl);
    }

    paymentKey = chargeData.paymentKey;

    // 6. Supabase에 구독 정보 저장 (billingKey는 암호화하여 저장)
    const adminSupabase = getAdminClient();
    let dbError: { message: string } | null = null;

    if (!adminSupabase) {
      dbError = { message: '서버 데이터베이스 클라이언트 초기화 실패' };
    } else {
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
    console.error('Billing confirm exception occurred:', error);

    // 승인 후 예외가 발생한 경우 자동 취소 및 알림 시도
    if (paymentKey && user && orderId && planDetail) {
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
- 플랜: ${planDetail.name} (${planDetail.price.toLocaleString()}원)
- 예외 내용: ${error?.message || String(error)}`,
        });
      } catch (notifyErr) {
        console.error('[Confirm] Exception handler notifyAdmin failed:', notifyErr);
      }
    }

    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', 'true');
    failUrl.searchParams.set('message', paymentKey ? '결제가 취소되었습니다. 다시 시도해 주세요.' : '네트워크 통신 중 오류가 발생했습니다. 다시 시도해 주세요.');
    return NextResponse.redirect(failUrl);
  }
}
