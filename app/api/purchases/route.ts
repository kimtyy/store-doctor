import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getStoreId } from '@/utils/supabase/getStore';
import { getUserRole } from '@/utils/supabase/getUserRole';

export const dynamic = 'force-dynamic';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase 환경 변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') ?? '0', 10);

    let query = supabase
      .from('purchase_records')
      .select('id, date, vendor_name, total_amount, category, note, memo, items, is_event, created_by')
      .eq('store_id', STORE_ID)
      .order('date', { ascending: false });

    if (days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte('date', since.toISOString().split('T')[0]);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase 환경 변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 });
    }

    const { id, items, totalAmount, date, vendorName, memo } = body as {
      id: string;
      items: { name: string; quantity: number; unitPrice: number; amount: number }[];
      totalAmount: number;
      date?: string;
      vendorName?: string;
      memo?: string;
    };

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const role = await getUserRole();
    const normalSupabase = createServerClient();
    const { data: { user } } = await normalSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (role === 'staff') {
      const { data: record } = await supabase
        .from('purchase_records')
        .select('created_by')
        .eq('id', id)
        .eq('store_id', STORE_ID)
        .maybeSingle();

      if (!record || record.created_by !== user.id) {
        return NextResponse.json({ error: '본인이 입력한 데이터만 수정/삭제할 수 있습니다.' }, { status: 403 });
      }
    }

    const updatePayload: Record<string, unknown> = { items: items ?? [], total_amount: totalAmount };
    if (date) updatePayload.date = date;
    if (vendorName !== undefined) updatePayload.vendor_name = vendorName;
    if (memo !== undefined) updatePayload.memo = memo;

    const { error } = await supabase
      .from('purchase_records')
      .update(updatePayload)
      .eq('id', id)
      .eq('store_id', STORE_ID);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase 환경 변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const role = await getUserRole();
    const normalSupabase = createServerClient();
    const { data: { user } } = await normalSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (role === 'staff') {
      const { data: record } = await supabase
        .from('purchase_records')
        .select('created_by')
        .eq('id', id)
        .eq('store_id', STORE_ID)
        .maybeSingle();

      if (!record || record.created_by !== user.id) {
        return NextResponse.json({ error: '본인이 입력한 데이터만 수정/삭제할 수 있습니다.' }, { status: 403 });
      }
    }

    // store_id 보안 체크 — 해당 매장 소유 레코드만 삭제 가능
    const { error } = await supabase
      .from('purchase_records')
      .delete()
      .eq('id', id)
      .eq('store_id', STORE_ID);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

