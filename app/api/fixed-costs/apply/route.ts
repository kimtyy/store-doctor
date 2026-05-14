import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST /api/fixed-costs/apply
// 현재 월의 활성 고정비를 purchase_records에 자동 삽입 (중복 방지)
// note 형식: "fixed:YYYY-MM:UUID"
export async function POST() {
  const supabase = makeClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase 환경 변수 없음' }, { status: 500 });

  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${yyyy}-${mm}`;
    const firstOfMonth = `${yearMonth}-01`;

    const { data: fixedCosts, error: fcError } = await supabase
      .from('fixed_costs')
      .select('*')
      .eq('store_id', STORE_ID)
      .eq('is_active', true);

    if (fcError) throw new Error(fcError.message);
    if (!fixedCosts || fixedCosts.length === 0) return NextResponse.json({ applied: 0 });

    // 이번 달에 이미 적용된 고정비 ID 목록
    const { data: existing, error: exError } = await supabase
      .from('purchase_records')
      .select('note')
      .eq('store_id', STORE_ID)
      .eq('input_method', 'auto_fixed')
      .like('note', `fixed:${yearMonth}:%`);

    if (exError) throw new Error(exError.message);

    const appliedIds = new Set(
      (existing ?? []).map((r) => {
        // "fixed:YYYY-MM:UUID" → UUID is everything after the second colon
        const idx = (r.note ?? '').indexOf(':', 'fixed:'.length);
        return idx >= 0 ? (r.note ?? '').slice(idx + 1) : '';
      })
    );

    const toInsert = fixedCosts.filter((fc) => !appliedIds.has(fc.id));
    if (toInsert.length === 0) return NextResponse.json({ applied: 0 });

    const records = toInsert.map((fc) => ({
      store_id: STORE_ID,
      date: firstOfMonth,
      vendor_name: fc.name,
      total_amount: fc.cost_type === 'manual_input' ? 0 : fc.amount,
      category: fc.category,
      items: [],
      input_method: 'auto_fixed',
      note: `fixed:${yearMonth}:${fc.id}`,
    }));

    const { error: insertError } = await supabase.from('purchase_records').insert(records);
    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({ applied: toInsert.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
