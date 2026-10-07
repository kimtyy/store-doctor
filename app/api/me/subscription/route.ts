import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminSupabase(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  try {
    const userSupabase = createServerSupabase();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const adminSupabase = getAdminClient();
    if (!adminSupabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    // billing_key는 절대 클라이언트로 내려보내지 않는다.
    const { data: sub, error } = await adminSupabase
      .from('subscriptions')
      .select('id, plan, status, started_at, expires_at, next_billing_date, cancelled_at, retry_count')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error && error.message && error.message.includes('column')) {
      // fallback without newer columns
      const { data: coreSub } = await adminSupabase
        .from('subscriptions')
        .select('id, plan, status, started_at, expires_at')
        .eq('user_id', user.id)
        .maybeSingle();
      return NextResponse.json({ subscription: coreSub || null });
    }

    return NextResponse.json({ subscription: sub || null });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '조회 실패' }, { status: 500 });
  }
}
