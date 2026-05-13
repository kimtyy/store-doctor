import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface SalesMenuItem {
  name: string;
  quantity: number;
  amount: number;
  category?: string;
  menuId?: string;
}

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

export async function POST(request: Request) {
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

    console.log(`메뉴 전용 저장: ${date}, ${menuItems.length}개`);

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
      console.log('기존 daily_sales 사용:', salesId);
    } else {
      // 최소 daily_sales 레코드 생성 (메뉴 전용)
      const { data: created, error: createError } = await supabase
        .from('daily_sales')
        .insert({
          store_id: STORE_ID,
          date,
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

    // 기존 메뉴 항목 삭제 후 재삽입 (중복 방지)
    await supabase.from('sales_menu_items').delete().eq('daily_sale_id', salesId);

    // 메뉴 항목 저장
    const rows = menuItems.map((item) => ({
      daily_sale_id: salesId,
      name: item.name,
      quantity: item.quantity,
      amount: item.amount,
      category: item.category ?? null,
      menu_id: item.menuId ?? null,
    }));

    const { error: menuError } = await supabase.from('sales_menu_items').insert(rows);

    if (menuError) {
      console.error('sales_menu_items 저장 실패:', menuError);
      return NextResponse.json({ error: `메뉴 저장 실패: ${menuError.message}` }, { status: 500 });
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
