import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getStoreId } from '@/utils/supabase/getStore';
import {
  isValidDateStr,
  mergeStoreEventsWithHolidays,
  StoreEventRecord,
  validateStoreEventInput,
} from '@/lib/storeEvents';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Service Role 클라이언트를 사용하므로 모든 쿼리에서 반드시 getStoreId() 기반 store_id 조건을 강제합니다.
 */
function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  const normalSupabase = createServerClient();
  const { data: { user } } = await normalSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = makeAdminClient();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const includeHolidays = searchParams.get('includeHolidays') !== 'false';

    if ((fromParam && !isValidDateStr(fromParam)) || (toParam && !isValidDateStr(toParam))) {
      return NextResponse.json(
        { error: '조회 기간(from/to)은 YYYY-MM-DD 형식이어야 합니다.' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('store_events')
      .select('id, store_id, start_date, end_date, title, type, impact, recurring_yearly, memo, created_by, created_at, updated_at')
      .eq('store_id', STORE_ID);

    if (fromParam && toParam) {
      if (toParam < fromParam) {
        return NextResponse.json({ error: '종료일은 시작일보다 빠를 수 없습니다.' }, { status: 400 });
      }
      // 매년 반복 이벤트는 다른 연도라도 가져와서 투영
      query = query.or(
        `recurring_yearly.eq.true,and(end_date.gte.${fromParam},start_date.lte.${toParam})`
      );
    }

    const { data, error } = await query
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const dbEvents = (data ?? []) as StoreEventRecord[];

    if (fromParam && toParam && includeHolidays) {
      const merged = mergeStoreEventsWithHolidays(dbEvents, fromParam, toParam);
      return NextResponse.json({ data: merged, rawCount: dbEvents.length });
    }

    return NextResponse.json({ data: dbEvents, rawCount: dbEvents.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '매장 사정 목록 조회 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const normalSupabase = createServerClient();
  const { data: { user } } = await normalSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: '요청 본문이 비어 있습니다.' }, { status: 400 });
    }

    const validated = validateStoreEventInput(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const supabase = makeAdminClient();
    const { data, error } = await supabase
      .from('store_events')
      .insert({
        store_id: STORE_ID,
        ...validated.data,
        created_by: user.id,
      })
      .select('id, store_id, start_date, end_date, title, type, impact, recurring_yearly, memo, created_by, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '매장 사정 등록 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const normalSupabase = createServerClient();
  const { data: { user } } = await normalSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    if (!body?.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: '수정할 매장 사정 id가 필요합니다.' }, { status: 400 });
    }

    if (!UUID_REGEX.test(body.id)) {
      return NextResponse.json({ error: '해당 매장 사정 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    const supabase = makeAdminClient();
    const { data: existingRow, error: fetchErr } = await supabase
      .from('store_events')
      .select('id, store_id, start_date, end_date, title, type, impact, recurring_yearly, memo')
      .eq('id', body.id)
      .eq('store_id', STORE_ID)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!existingRow) {
      return NextResponse.json({ error: '해당 매장 사정 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    const mergedInput = {
      title: body.title !== undefined ? body.title : existingRow.title,
      start_date: body.start_date !== undefined ? body.start_date : existingRow.start_date,
      end_date: body.end_date !== undefined ? body.end_date : existingRow.end_date,
      type: body.type !== undefined ? body.type : existingRow.type,
      impact: body.impact !== undefined ? body.impact : existingRow.impact,
      recurring_yearly:
        body.recurring_yearly !== undefined ? body.recurring_yearly : existingRow.recurring_yearly,
      memo: body.memo !== undefined ? body.memo : existingRow.memo,
    };

    const validated = validateStoreEventInput(mergedInput);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('store_events')
      .update({
        ...validated.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .eq('store_id', STORE_ID)
      .select('id, store_id, start_date, end_date, title, type, impact, recurring_yearly, memo, created_by, created_at, updated_at');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: '해당 매장 사정 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: data[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '매장 사정 수정 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const normalSupabase = createServerClient();
  const { data: { user } } = await normalSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '삭제할 매장 사정 id가 필요합니다.' }, { status: 400 });
    }

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: '해당 매장 사정 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    const supabase = makeAdminClient();
    const { data, error } = await supabase
      .from('store_events')
      .delete()
      .eq('id', id)
      .eq('store_id', STORE_ID)
      .select('id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: '해당 매장 사정 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '매장 사정 삭제 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

