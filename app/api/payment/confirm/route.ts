import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { getUserRole } from '@/utils/supabase/getUserRole';
import { BILLING_PLANS, PlanKey, encryptBillingKey } from '@/lib/billing';

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
  const customerKey = searchParams.get('customerKey');
  const authKey = searchParams.get('authKey');
  const plan = (searchParams.get('plan') || 'basic') as PlanKey;

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
    const planDetail = BILLING_PLANS[plan] || BILLING_PLANS.basic;
    const orderId = `sub_${user.id.slice(0, 8)}_${Date.now()}`;

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

    // 6. Supabase에 구독 정보 저장 (billingKey는 암호화하여 저장)
    const adminSupabase = getAdminClient();
    if (!adminSupabase) {
      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'true');
      failUrl.searchParams.set('message', '서버 데이터베이스 설정 오류가 발생했습니다.');
      return NextResponse.redirect(failUrl);
    }

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

    let { error: dbError } = await adminSupabase
      .from('subscriptions')
      .upsert(subscriptionPayload, {
        onConflict: 'user_id',
      });

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
      if (fallbackError) {
        dbError = fallbackError;
      } else {
        dbError = null;
      }
    }

    if (dbError) {
      console.error('Database subscription saving failed:', dbError.message);
      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'true');
      failUrl.searchParams.set('message', `결제는 승인되었으나 구독 정보 저장에 실패했습니다: ${dbError.message}`);
      return NextResponse.redirect(failUrl);
    }

    // 7. 결제 및 정기구독 활성화 완료 -> 대시보드로 이동
    const successUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(successUrl);
  } catch (error) {
    console.error('Billing confirm exception occurred:', error);
    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', 'true');
    failUrl.searchParams.set('message', '네트워크 통신 중 오류가 발생했습니다. 다시 시도해 주세요.');
    return NextResponse.redirect(failUrl);
  }
}
