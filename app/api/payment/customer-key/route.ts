import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { generateCustomerKey } from '@/lib/billing';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const customerKey = generateCustomerKey(user.id);
    return NextResponse.json({ customerKey });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'customerKey 생성 실패' }, { status: 500 });
  }
}
