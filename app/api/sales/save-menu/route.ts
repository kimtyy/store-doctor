import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getStoreId } from '@/utils/supabase/getStore';

interface SalesMenuItem {
  name: string;
  quantity: number;
  amount: number;
  category?: string;
  menuId?: string;
}



export async function POST(request: Request) {
  const normalSupabase = createServerClient();
  const { data: { user } } = await normalSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Supabase 환경 변수가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 });
    }

    const { date, menuItems } = payload as { date: string; menuItems: SalesMenuItem[] };

    if (!date) {
      return NextResponse.json({ error: '날짜(date)가 필요합니다.' }, { status: 400 });
    }
    if (!Array.isArray(menuItems) || menuItems.length === 0) {
      return NextResponse.json({ error: '저장할 메뉴 항목이 없습니다.' }, { status: 400 });
    }

    console.log(`메뉴 저장: ${date}, ${menuItems.length}개`);
    console.log('항목 확인:', menuItems.slice(0, 5).map((i) => ({ name: i.name, qty: i.quantity, amt: i.amount })));

    // 해당 날짜 daily_sales 조회 (있으면 재사용, 없으면 최소 레코드 생성)
    const { data: existing, error: fetchError } = await supabase
      .from('daily_sales')
      .select('id')
      .eq('store_id', STORE_ID)
      .eq('date', date)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: `매출 조회 실패: ${fetchError.message}` }, { status: 500 });
    }

    let salesId: string;

    if (existing?.id) {
      salesId = existing.id;
      console.log('기존 daily_sales 재사용:', salesId);
    } else {
      const { data: created, error: createError } = await supabase
        .from('daily_sales')
        .insert({
          store_id: STORE_ID,
          date,
          created_by: user.id,
          total_revenue: 0,
          discount: 0,
          service_charge: 0,
          tax: 0,
          net_revenue: 0,
          cash_count: 0,
          cash_amount: 0,
          card_count: 0,
          card_amount: 0,
          tables_used: 0,
          guest_count: 0,
          avg_spend: 0,
          input_method: 'receipt_photo',
        })
        .select('id')
        .single();

      if (createError) {
        console.error('daily_sales 생성 실패:', createError);
        if (createError.code === '23505') {
          return NextResponse.json({ error: '같은 날짜의 매출이 이미 존재합니다.' }, { status: 409 });
        }
        return NextResponse.json({ error: `매출 레코드 생성 실패: ${createError.message}` }, { status: 500 });
      }
      salesId = created.id;
      console.log('신규 daily_sales 생성:', salesId);
    }

    // 기존 메뉴 항목 삭제 (수정값으로 교체)
    const { error: deleteError } = await supabase
      .from('sales_menu_items')
      .delete()
      .eq('daily_sale_id', salesId);

    if (deleteError) {
      console.error('기존 메뉴 삭제 실패:', deleteError);
      return NextResponse.json({ error: `기존 메뉴 삭제 실패: ${deleteError.message}` }, { status: 500 });
    }

    // menu_master에서 정식명 + 카테고리 매핑 구성
    const { data: masterRows } = await supabase
      .from('menu_master')
      .select('menu_name, category, aliases')
      .eq('store_id', STORE_ID);

    const masterByName: Record<string, { category: string | null }> = {};
    const masterByAlias: Record<string, { canonicalName: string; category: string | null }> = {};
    for (const m of masterRows ?? []) {
      masterByName[m.menu_name] = { category: m.category };
      for (const alias of m.aliases ?? []) {
        masterByAlias[alias] = { canonicalName: m.menu_name, category: m.category };
      }
    }

    // sales_menu_items 기존 카테고리 학습 (fallback)
    const allNames = menuItems.map((i) => i.name).filter(Boolean);
    const categoryFallback: Record<string, string> = {};
    if (allNames.length > 0) {
      const { data: catRows } = await supabase
        .from('sales_menu_items')
        .select('name, category')
        .in('name', allNames)
        .not('category', 'is', null)
        .limit(allNames.length * 10);
      for (const row of catRows ?? []) {
        if (row.category && !categoryFallback[row.name]) {
          categoryFallback[row.name] = row.category as string;
        }
      }
    }

    // 수정된 메뉴 항목 삽입 (alias 정규화 + 카테고리 적용)
    const rows = menuItems.map((item) => {
      const aliasMatch = masterByAlias[item.name];
      const canonicalName = aliasMatch ? aliasMatch.canonicalName : item.name;
      const masterEntry = aliasMatch ?? masterByName[canonicalName];
      const resolvedCategory =
        item.category ||
        (masterEntry?.category ?? null) ||
        categoryFallback[canonicalName] ||
        null;
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

    if (insertError) {
      console.error('메뉴 삽입 실패:', insertError);
      return NextResponse.json({ error: `메뉴 저장 실패: ${insertError.message}` }, { status: 500 });
    }

    console.log(`✅ 메뉴 ${menuItems.length}개 저장 완료`);
    return NextResponse.json({
      success: true,
      message: `✅ 메뉴 저장 완료! (${menuItems.length}개)`,
      data: { salesId, date, menuCount: menuItems.length },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
