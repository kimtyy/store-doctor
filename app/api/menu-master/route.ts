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

export async function PATCH(request: Request) {
  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);
    if (!body?.menuName || !body?.alias) {
      return NextResponse.json({ error: 'menuName과 alias가 필요합니다.' }, { status: 400 });
    }
    const { menuName, alias } = body as { menuName: string; alias: string };

    const { data, error: fetchError } = await supabase
      .from('menu_master')
      .select('id, aliases')
      .eq('menu_name', menuName)
      .eq('store_id', STORE_ID)
      .single();

    if (fetchError || !data) {
      return NextResponse.json({ success: true }); // menu not in master — skip silently
    }

    const current: string[] = data.aliases ?? [];
    if (current.includes(alias)) {
      return NextResponse.json({ success: true });
    }

    const { error: updateError } = await supabase
      .from('menu_master')
      .update({ aliases: [...current, alias] })
      .eq('id', data.id);

    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = makeClient();
    const { data, error } = await supabase
      .from('menu_master')
      .select('menu_name, aliases')
      .eq('store_id', STORE_ID);
    if (error) throw new Error(error.message);
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
