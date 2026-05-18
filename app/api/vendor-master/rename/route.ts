import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수 누락');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST /api/vendor-master/rename
// { oldName: string, newName: string }
// 1. Bulk-update purchase_records: vendor_name = oldName → newName
// 2. Upsert vendor_master: canonical = newName, add oldName as alias if different
export async function POST(request: Request) {
  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);

    const oldName: string = body?.oldName?.trim() ?? '';
    const newName: string = body?.newName?.trim() ?? '';

    if (!oldName || !newName) {
      return NextResponse.json({ error: 'oldName과 newName이 필요합니다.' }, { status: 400 });
    }

    // ── 1. Bulk-update purchase_records ───────────────────────────────────────
    let updatedCount = 0;
    if (oldName !== newName) {
      const { data: updated, error: updateError } = await supabase
        .from('purchase_records')
        .update({ vendor_name: newName })
        .eq('store_id', STORE_ID)
        .eq('vendor_name', oldName)
        .select('id');

      if (updateError) throw new Error(updateError.message);
      updatedCount = updated?.length ?? 0;
    }

    // ── 2. Upsert vendor_master ───────────────────────────────────────────────
    const { data: existing, error: fetchError } = await supabase
      .from('vendor_master')
      .select('id, aliases')
      .eq('store_id', STORE_ID)
      .eq('vendor_name', newName)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);

    const aliasToAdd = oldName !== newName ? oldName : null;

    if (existing) {
      // Entry exists — add oldName as alias if not already present
      const updatedAliases: string[] = existing.aliases ?? [];
      if (aliasToAdd && !updatedAliases.includes(aliasToAdd)) {
        updatedAliases.push(aliasToAdd);
      }
      const { error: aliasError } = await supabase
        .from('vendor_master')
        .update({ aliases: updatedAliases })
        .eq('id', existing.id);
      if (aliasError) throw new Error(aliasError.message);
    } else {
      // No entry — create new
      const aliases = aliasToAdd ? [aliasToAdd] : [];
      const { error: insertError } = await supabase
        .from('vendor_master')
        .insert({ store_id: STORE_ID, vendor_name: newName, aliases });
      if (insertError) throw new Error(insertError.message);
    }

    const message = oldName === newName
      ? `"${newName}" 매입처 마스터에 등록됨`
      : `"${oldName}" → "${newName}" ${updatedCount}건 업데이트 + 마스터 등록`;

    return NextResponse.json({ success: true, message, updatedCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
