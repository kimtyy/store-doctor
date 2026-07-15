import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Helper to create admin Supabase client to bypass RLS for write operations
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminSupabase(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const amount = searchParams.get('amount');
  const plan = searchParams.get('plan') || 'basic';

  // 1. 필수 파라미터 체크
  if (!paymentKey || !orderId || !amount) {
    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('error', 'true');
    failUrl.searchParams.set('message', '결제 필수 정보가 누락되었습니다.');
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

  // 3. 토스페이먼츠 결제 승인 API 호출
  const tossSecretKey = process.env.TOSS_SECRET_KEY;
  if (!tossSecretKey) {
    console.error('TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.');
    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', 'true');
    failUrl.searchParams.set('message', '결제 서버 설정 오류가 발생했습니다. 관리자에게 문의해 주세요.');
    return NextResponse.redirect(failUrl);
  }
  // Basic Auth 헤더 조립 (SecretKey + ":")
  const encodedCredential = Buffer.from(`${tossSecretKey}:`).toString('base64');

  try {
    const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encodedCredential}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: Number(amount),
      }),
    });

    const tossData = await tossResponse.json();

    if (!tossResponse.ok) {
      // 결제 승인 실패 시
      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'true');
      failUrl.searchParams.set('message', tossData.message || '토스 결제 승인에 실패했습니다.');
      return NextResponse.redirect(failUrl);
    }

    // 4. Supabase에 구독 정보 저장
    const adminSupabase = getAdminClient();
    if (!adminSupabase) {
      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'true');
      failUrl.searchParams.set('message', '서버 설정 오류가 발생했습니다.');
      return NextResponse.redirect(failUrl);
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30일 뒤 만료

    const { error: dbError } = await adminSupabase
      .from('subscriptions')
      .upsert(
        {
          user_id: user.id,
          plan: plan,
          status: 'active',
          started_at: startedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (dbError) {
      console.error('Database subscription logging failed:', dbError);
      const failUrl = new URL('/payment', request.url);
      failUrl.searchParams.set('plan', plan);
      failUrl.searchParams.set('error', 'true');
      failUrl.searchParams.set('message', `결제는 승인되었으나 구독 정보 저장에 실패했습니다: ${dbError.message}`);
      return NextResponse.redirect(failUrl);
    }

    // 5. 결제 및 구독 활성화 성공 -> 대시보드로 이동
    const successUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(successUrl);

  } catch (error) {
    console.error('Payment confirm exception:', error);
    const failUrl = new URL('/payment', request.url);
    failUrl.searchParams.set('plan', plan);
    failUrl.searchParams.set('error', 'true');
    failUrl.searchParams.set('message', '네트워크 통신 오류가 발생했습니다.');
    return NextResponse.redirect(failUrl);
  }
}
