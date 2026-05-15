import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  try {
    const supabase = makeClient();
    const { data, error } = await supabase
      .from('daily_sales')
      .select('date')
      .eq('store_id', STORE_ID)
      .order('date', { ascending: true });

    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    const months: { year: number; month: number }[] = [];
    for (const row of data ?? []) {
      const ym = (row.date as string).slice(0, 7);
      if (!seen.has(ym)) {
        seen.add(ym);
        months.push({ year: parseInt(ym.slice(0, 4)), month: parseInt(ym.slice(5, 7)) });
      }
    }

    return NextResponse.json({ months });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
