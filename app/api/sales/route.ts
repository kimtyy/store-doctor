import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    storeId: row.store_id,
    date: row.date,
    totalRevenue: row.total_revenue,
    discount: row.discount ?? 0,
    serviceCharge: row.service_charge ?? 0,
    serviceAmount: row.service_amount ?? row.service_charge ?? 0,
    actualSales: row.actual_sales ?? row.total_revenue ?? 0,
    tax: row.tax ?? 0,
    netRevenue: row.net_revenue,
    cashCount: row.cash_count ?? 0,
    cashAmount: row.cash_amount ?? 0,
    cardCount: row.card_count ?? 0,
    cardAmount: row.card_amount ?? 0,
    tablesUsed: row.tables_used ?? 0,
    guestCount: row.guest_count ?? 0,
    avgSpend: row.avg_spend ?? 0,
    openTime: row.open_time ?? null,
    closeTime: row.close_time ?? null,
    firstOrderTime: row.first_order_time ?? null,
    inputMethod: row.input_method,
    receiptImageUrl: row.receipt_image_url ?? null,
    createdAt: row.created_at,
    menuItems: (row.sales_menu_items as Record<string, unknown>[] ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      amount: item.amount,
      category: item.category ?? null,
      menuId: item.menu_id ?? null,
    })),
  };
}

export async function GET() {
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
    const { data, error } = await supabase
      .from('daily_sales')
      .select('*, sales_menu_items(*)')
      .eq('store_id', STORE_ID)
      .order('date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? []).map(mapRow) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
