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

  console.log('=== 매출 저장 API ===');
  console.log('URL 설정:', !!supabaseUrl);
  console.log('Service Key 설정:', !!supabaseServiceKey);

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Supabase 환경 변수가 설정되지 않았습니다. (URL 또는 SERVICE_ROLE_KEY 누락)' },
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

    const { receipt, menu } = payload;

    console.log('수신 payload:', {
      hasReceipt: !!receipt,
      hasMenu: !!menu,
      menuItemCount: Array.isArray(menu?.menuItems) ? menu.menuItems.length : 0,
      receiptDate: receipt?.date,
      receiptRevenue: receipt?.totalRevenue,
    });

    if (!receipt) {
      return NextResponse.json({ error: '매출 데이터가 필요합니다.' }, { status: 400 });
    }

    const { data: salesData, error: salesError } = await supabase
      .from('daily_sales')
      .insert({
        store_id: STORE_ID,
        date: receipt.date,
        total_revenue: receipt.totalRevenue,
        discount: receipt.discount || 0,
        service_charge: receipt.serviceAmount || receipt.serviceCharge || 0,
        service_amount: receipt.serviceAmount || receipt.serviceCharge || 0,
        actual_sales: receipt.actualSales || (receipt.totalRevenue - (receipt.serviceAmount || receipt.serviceCharge || 0)),
        tax: receipt.tax || 0,
        net_revenue: receipt.netRevenue,
        cash_count: receipt.cashCount || 0,
        cash_amount: receipt.cashAmount || 0,
        card_count: receipt.cardCount || 0,
        card_amount: receipt.cardAmount || 0,
        tables_used: receipt.tablesUsed || 0,
        guest_count: receipt.guestCount || 0,
        avg_spend: receipt.avgSpend || 0,
        open_time: receipt.openTime || null,
        close_time: receipt.closeTime || null,
        first_order_time: receipt.firstOrderTime || null,
        input_method: 'receipt_photo',
        receipt_image_url: receipt.receiptImageUrl || null,
        is_event: receipt.isEvent ?? false,
      })
      .select('id')
      .single();

    if (salesError) {
      console.error('daily_sales 저장 실패:', salesError);
      let errorMsg = salesError.message;
      if (salesError.code === '23503') {
        errorMsg = '매장 ID가 잘못되었습니다. (stores 테이블에 해당 ID가 없습니다)';
      } else if (salesError.code === '23505') {
        errorMsg = '같은 날짜의 매출이 이미 존재합니다.';
      }
      return NextResponse.json(
        { error: errorMsg, supabaseError: { code: salesError.code, message: salesError.message } },
        { status: 500 }
      );
    }

    const salesId = salesData?.id;
    if (!salesId) {
      return NextResponse.json({ error: '저장된 매출 ID를 찾을 수 없습니다.' }, { status: 500 });
    }

    console.log('daily_sales 저장 성공:', salesId);

    // 메뉴 항목 저장
    if (menu?.menuItems && menu.menuItems.length > 0) {
      // menu_master에서 정식명 + 카테고리 매핑
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
      const rawNames = (menu.menuItems as SalesMenuItem[]).map((i) => i.name).filter(Boolean);
      const categoryFallback: Record<string, string> = {};
      if (rawNames.length > 0) {
        const { data: catRows } = await supabase
          .from('sales_menu_items')
          .select('name, category')
          .in('name', rawNames)
          .not('category', 'is', null)
          .limit(rawNames.length * 10);
        for (const row of catRows ?? []) {
          if (row.category && !categoryFallback[row.name]) {
            categoryFallback[row.name] = row.category as string;
          }
        }
      }

      const menuItems = (menu.menuItems as SalesMenuItem[]).map((item) => {
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

      const { error: menuError } = await supabase
        .from('sales_menu_items')
        .insert(menuItems);

      if (menuError) {
        console.error('sales_menu_items 저장 실패:', menuError);
        return NextResponse.json(
          { error: `메뉴 항목 저장 실패: ${menuError.message}` },
          { status: 500 }
        );
      }
      console.log(`sales_menu_items ${menu.menuItems.length}개 저장 완료`);
    }

    console.log('✅ 매출 저장 완료');
    return NextResponse.json({
      success: true,
      message: '✅ 저장 완료!',
      data: { salesId, date: receipt.date, totalRevenue: receipt.totalRevenue },
    });
  } catch (error) {
    console.error('예상치 못한 오류:', error);
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
