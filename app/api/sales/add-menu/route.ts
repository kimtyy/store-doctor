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

// POST /api/sales/add-menu
// Body: { date: string, menuItems: [{name,quantity,amount,category?,menuId?}] }
// Finds daily_sales by date+store_id, replaces sales_menu_items.
export async function POST(request: Request) {
  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);
    if (!body?.date || !Array.isArray(body?.menuItems)) {
      return NextResponse.json({ error: 'date와 menuItems가 필요합니다.' }, { status: 400 });
    }

    const { date, menuItems } = body as {
      date: string;
      menuItems: { name: string; quantity: number; amount: number; category?: string; menuId?: string }[];
    };

    // 해당 날짜 daily_sales 조회
    const { data: salesRows, error: findError } = await supabase
      .from('daily_sales')
      .select('id')
      .eq('store_id', STORE_ID)
      .eq('date', date)
      .limit(1);

    if (findError) throw new Error(findError.message);
    if (!salesRows || salesRows.length === 0) {
      return NextResponse.json({ error: `${date} 날짜의 매출 데이터가 없습니다. 정산서를 먼저 저장해주세요.` }, { status: 404 });
    }

    const salesId = salesRows[0].id as string;

    // 기존 메뉴 항목 삭제
    const { error: deleteError } = await supabase
      .from('sales_menu_items')
      .delete()
      .eq('daily_sale_id', salesId);
    if (deleteError) throw new Error(deleteError.message);

    // 새 메뉴 항목 삽입
    if (menuItems.length > 0) {
      // menu_master 카테고리 매핑
      const { data: masterRows } = await supabase
        .from('menu_master')
        .select('menu_name, category, aliases')
        .eq('store_id', STORE_ID);

      const masterByName: Record<string, string | null> = {};
      const masterByAlias: Record<string, { canonicalName: string; category: string | null }> = {};
      for (const m of masterRows ?? []) {
        masterByName[m.menu_name] = m.category;
        for (const alias of m.aliases ?? []) {
          masterByAlias[alias] = { canonicalName: m.menu_name, category: m.category };
        }
      }

      const rows = menuItems.map((item) => {
        const aliasMatch = masterByAlias[item.name];
        const canonicalName = aliasMatch ? aliasMatch.canonicalName : item.name;
        const resolvedCategory = item.category ?? aliasMatch?.category ?? masterByName[canonicalName] ?? null;
        return {
          daily_sale_id: salesId,
          name: canonicalName,
          quantity: item.quantity,
          amount: item.amount,
          category: resolvedCategory,
          menu_id: item.menuId ?? null,
        };
      });

      const { error: insertError } = await supabase.from('sales_menu_items').insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({ success: true, message: `✅ 메뉴 ${menuItems.length}개 저장 완료`, salesId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
