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

// GET /api/menu-master — all menu_master rows + distinct menu names from sales_menu_items
export async function GET() {
  try {
    const supabase = makeClient();

    const [masterRes, salesNamesRes] = await Promise.all([
      supabase
        .from('menu_master')
        .select('id, menu_name, category, aliases, created_at')
        .eq('store_id', STORE_ID)
        .order('menu_name'),
      supabase
        .from('sales_menu_items')
        .select('name, category')
        .in(
          'daily_sale_id',
          (
            await supabase.from('daily_sales').select('id').eq('store_id', STORE_ID)
          ).data?.map((r) => r.id) ?? []
        ),
    ]);

    if (masterRes.error) throw new Error(masterRes.error.message);

    // Aggregate distinct names from sales_menu_items
    const nameMap: Record<string, string | null> = {};
    for (const row of salesNamesRes.data ?? []) {
      if (!(row.name in nameMap)) {
        nameMap[row.name] = row.category ?? null;
      }
      // prefer non-null category
      if (row.category && !nameMap[row.name]) {
        nameMap[row.name] = row.category;
      }
    }

    const masterNames = new Set((masterRes.data ?? []).map((r) => r.menu_name));
    const unmapped = Object.entries(nameMap)
      .filter(([name]) => !masterNames.has(name))
      .map(([name, category]) => ({ name, category }));

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
