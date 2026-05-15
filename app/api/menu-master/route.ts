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
    if (!body?.menuName) {
      return NextResponse.json({ error: 'menuName이 필요합니다.' }, { status: 400 });
    }

    const { menuName, alias, category, newName } = body as {
      menuName: string;
      alias?: string;
      category?: string;
      newName?: string;
    };

    // Canonical name: if renaming, use newName; otherwise menuName
    const canonicalName = (newName && newName.trim() && newName !== menuName) ? newName.trim() : menuName;
    const isRename = canonicalName !== menuName;

    const { data: existing, error: fetchError } = await supabase
      .from('menu_master')
      .select('id, aliases, category')
      .eq('menu_name', canonicalName)
      .eq('store_id', STORE_ID)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);

    if (existing) {
      const updatePayload: Record<string, unknown> = {};
      let updatedAliases: string[] = existing.aliases ?? [];

      if (isRename && !updatedAliases.includes(menuName)) {
        updatedAliases = [...updatedAliases, menuName];
      }
      if (alias && !updatedAliases.includes(alias)) {
        updatedAliases = [...updatedAliases, alias];
      }
      updatePayload.aliases = updatedAliases;

      if (category !== undefined) {
        updatePayload.category = category || null;
      }

      const { error: updateError } = await supabase
        .from('menu_master')
        .update(updatePayload)
        .eq('id', existing.id);

      if (updateError) throw new Error(updateError.message);
    } else {
      // Entry doesn't exist — create it
      const aliases: string[] = [];
      if (isRename) aliases.push(menuName);
      if (alias && !aliases.includes(alias)) aliases.push(alias);

      const { error: insertError } = await supabase
        .from('menu_master')
        .insert({
          store_id: STORE_ID,
          menu_name: canonicalName,
          aliases,
          category: category || null,
        });

      if (insertError) throw new Error(insertError.message);
    }

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
      .select('id, menu_name, aliases, category')
      .eq('store_id', STORE_ID);
    if (error) throw new Error(error.message);
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
