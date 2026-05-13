import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface SalesMenuItem {
  name: string;
  quantity: number;
  amount: number;
  category?: string;
  menuId?: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service role key로 Supabase 클라이언트 생성 (RLS 우회)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);

    if (!payload) {
      return NextResponse.json({
        error: '요청 본문을 파싱할 수 없습니다.'
      }, { status: 400 });
    }

    const { receipt, menu } = payload;

    if (!receipt) {
      return NextResponse.json({
        error: '매출 데이터가 필요합니다.'
      }, { status: 400 });
    }

    // 임시 store_id (나중에 실제 사용자 인증으로 변경)
    const tempStoreId = '550e8400-e29b-41d4-a716-446655440000';

    // 트랜잭션으로 데이터 저장
    const { data: salesData, error: salesError } = await supabase
      .from('daily_sales')
      .insert({
        store_id: tempStoreId,
        date: receipt.date,
        total_revenue: receipt.totalRevenue,
        discount: receipt.discount,
        service_charge: receipt.serviceCharge,
        tax: receipt.tax,
        net_revenue: receipt.netRevenue,
        cash_count: receipt.cashCount,
        cash_amount: receipt.cashAmount,
        card_count: receipt.cardCount,
        card_amount: receipt.cardAmount,
        tables_used: receipt.tablesUsed,
        guest_count: receipt.guestCount,
        avg_spend: receipt.avgSpend,
        open_time: receipt.openTime,
        close_time: receipt.closeTime,
        first_order_time: receipt.firstOrderTime,
        input_method: 'receipt_photo' as const,
        receipt_image_url: receipt.receiptImageUrl
      })
      .select('id')
      .single();

    if (salesError) {
      console.error('Daily sales insert error:', salesError);
      return NextResponse.json({
        error: '매출 데이터 저장에 실패했습니다.'
      }, { status: 500 });
    }

    // 메뉴 항목들 저장 (있는 경우)
    if (menu?.menuItems && menu.menuItems.length > 0) {
      const menuItems = menu.menuItems.map((item: SalesMenuItem) => ({
        daily_sale_id: salesData.id,
        name: item.name,
        quantity: item.quantity,
        amount: item.amount,
        category: item.category,
        menu_id: item.menuId
      }));

      const { error: menuError } = await supabase
        .from('sales_menu_items')
        .insert(menuItems);

      if (menuError) {
        console.error('Menu items insert error:', menuError);
        // 메뉴 저장 실패해도 기본 매출 데이터는 유지
        console.warn('메뉴 항목 저장에 실패했지만 매출 데이터는 저장되었습니다.');
      }
    }

    return NextResponse.json({
      success: true,
      message: '✅ 저장 완료!',
      data: {
        salesId: salesData.id,
        date: receipt.date,
        totalRevenue: receipt.totalRevenue
      }
    });

  } catch (error) {
    console.error('Sales save error:', error);

    if (error instanceof Error) {
      return NextResponse.json({
        error: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      error: '알 수 없는 오류가 발생했습니다.'
    }, { status: 500 });
  }
}