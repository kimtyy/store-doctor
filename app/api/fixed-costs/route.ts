import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';

export const dynamic = 'force-dynamic';



function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase 환경 변수 없음' }, { status: 500 });

  const { data, error } = await supabase
    .from('fixed_costs')
    .select('*')
    .eq('store_id', STORE_ID)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase 환경 변수 없음' }, { status: 500 });

  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: '요청 본문이 없습니다.' }, { status: 400 });

    const { name, amount, category, billingDay } = body;
    if (!name || amount == null || !category || !billingDay) {
      return NextResponse.json({ error: '항목명, 금액, 카테고리, 청구일이 필요합니다.' }, { status: 400 });
    }

    const { costType } = body;

    const { data, error } = await supabase
      .from('fixed_costs')
      .insert({ store_id: STORE_ID, name, amount, category, billing_day: billingDay, is_active: true, cost_type: costType ?? 'fixed_amount' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase 환경 변수 없음' }, { status: 500 });

  try {
    const body = await request.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const { id, name, amount, category, billingDay, isActive, costType } = body;
    const fields: Record<string, unknown> = {};
    if (name !== undefined) fields.name = name;
    if (amount !== undefined) fields.amount = amount;
    if (category !== undefined) fields.category = category;
    if (billingDay !== undefined) fields.billing_day = billingDay;
    if (isActive !== undefined) fields.is_active = isActive;
    if (costType !== undefined) fields.cost_type = costType;

    const { error } = await supabase
      .from('fixed_costs')
      .update(fields)
      .eq('id', id)
      .eq('store_id', STORE_ID);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase 환경 변수 없음' }, { status: 500 });

  try {
    const body = await request.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const { error } = await supabase
      .from('fixed_costs')
      .delete()
      .eq('id', body.id)
      .eq('store_id', STORE_ID);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
