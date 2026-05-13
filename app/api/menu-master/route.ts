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

// Normalize for comparison: trim edges + collapse internal whitespace
function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

// GET /api/menu-master — all menu_master rows + distinct menu names from sales_menu_items
export async function GET() {
  try {
    const supabase = makeClient();

    const salesIdsRes = await supabase
      .from('daily_sales')
      .select('id')
      .eq('store_id', STORE_ID);

    const salesIds = salesIdsRes.data?.map((r) => r.id) ?? [];

    const [masterRes, salesNamesRes] = await Promise.all([
      supabase
        .from('menu_master')
        .select('id, menu_name, category, aliases, created_at')
        .eq('store_id', STORE_ID)
        .order('menu_name'),
      salesIds.length > 0
        ? supabase.from('sales_menu_items').select('name, category').in('daily_sale_id', salesIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (masterRes.error) throw new Error(masterRes.error.message);

    // Build exclusion set from menu_master: normalized menu_name + all aliases
    const excluded = new Set<string>();
    for (const m of masterRes.data ?? []) {
      excluded.add(norm(m.menu_name));
      for (const alias of m.aliases ?? []) {
        excluded.add(norm(alias));
      }
    }

    // Aggregate distinct names from sales_menu_items, keyed by normalized name
    // but preserve the original name for display
    const normToOriginal: Record<string, string> = {};
    const normToCategory: Record<string, string | null> = {};

    for (const row of salesNamesRes.data ?? []) {
      if (!row.name?.trim()) continue;
      const key = norm(row.name);
      if (!(key in normToOriginal)) {
        normToOriginal[key] = row.name;
        normToCategory[key] = row.category ?? null;
      }
      // prefer non-null category
      if (row.category && !normToCategory[key]) {
        normToCategory[key] = row.category;
      }
    }

    // Only return names not already covered by menu_master (name or alias)
    const unmapped = Object.keys(normToOriginal)
      .filter((key) => !excluded.has(key))
      .map((key) => ({ name: normToOriginal[key], category: normToCategory[key] }));

    return NextResponse.json({
      master: masterRes.data ?? [],
      unmapped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/menu-master — create one entry
export async function POST(request: Request) {
  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);
    if (!body?.menuName) {
      return NextResponse.json({ error: '메뉴명(menuName)이 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('menu_master')
      .insert({
        store_id: STORE_ID,
        menu_name: body.menuName,
        category: body.category ?? null,
        aliases: body.aliases ?? [],
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 등록된 메뉴명입니다.' }, { status: 409 });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT /api/menu-master — bulk upsert [ { menuName, category, aliases } ]
export async function PUT(request: Request) {
  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);
    if (!Array.isArray(body?.items)) {
      return NextResponse.json({ error: 'items 배열이 필요합니다.' }, { status: 400 });
    }

    // Deduplicate by menu_name — keep last occurrence to avoid ON CONFLICT affecting same row twice
    const seen = new Map<string, { menuName: string; category: string; aliases: string[] }>();
    for (const item of body.items as { menuName: string; category: string; aliases: string[] }[]) {
      if (item.menuName?.trim()) seen.set(item.menuName.trim(), item);
    }

    const rows = Array.from(seen.values()).map((item) => ({
      store_id: STORE_ID,
      menu_name: item.menuName.trim(),
      category: item.category || null,
      aliases: item.aliases ?? [],
    }));

    const { error } = await supabase
      .from('menu_master')
      .upsert(rows, { onConflict: 'store_id,menu_name' });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, count: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/menu-master — update category only (preserves aliases)
// Body: { menuName, category }
export async function PATCH(request: Request) {
  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);
    if (!body?.menuName) {
      return NextResponse.json({ error: 'menuName이 필요합니다.' }, { status: 400 });
    }

    const menuName = String(body.menuName).trim();
    const category = body.category || null;

    // Try to update existing entry — preserves aliases unchanged
    const { data: updated, error: updateError } = await supabase
      .from('menu_master')
      .update({ category })
      .eq('store_id', STORE_ID)
      .eq('menu_name', menuName)
      .select('id');

    if (updateError) throw new Error(updateError.message);

    // If no row existed, insert a new one with empty aliases
    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase
        .from('menu_master')
        .insert({ store_id: STORE_ID, menu_name: menuName, category, aliases: [] });
      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/menu-master?id=xxx — delete one entry
export async function DELETE(request: Request) {
  try {
    const supabase = makeClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id 파라미터가 필요합니다.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('menu_master')
      .delete()
      .eq('id', id)
      .eq('store_id', STORE_ID);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
