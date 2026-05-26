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
    isEvent: row.is_event ?? false,
    note: row.note ?? null,
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

export async function PATCH(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase 환경 변수가 설정되지 않았습니다.' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await request.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const { id, receipt, menuItems } = body as {
      id: string;
      receipt: {
        date?: string;
        totalRevenue: number;
        serviceAmount?: number;
        netRevenue: number;
        tax?: number;
        cashAmount?: number;
        cardAmount?: number;
        guestCount?: number;
        avgSpend?: number;
        isEvent?: boolean;
        note?: string;
      };
      menuItems?: { name: string; quantity: number; amount: number; category?: string; menuId?: string }[];
    };

    if (!receipt) return NextResponse.json({ error: 'receipt 데이터가 필요합니다.' }, { status: 400 });

    const serviceAmount = receipt.serviceAmount ?? 0;
    const updateFields: Record<string, unknown> = {
      total_revenue: receipt.totalRevenue,
      service_charge: serviceAmount,
      service_amount: serviceAmount,
      actual_sales: receipt.totalRevenue - serviceAmount,
      tax: receipt.tax ?? 0,
      net_revenue: receipt.netRevenue,
      cash_amount: receipt.cashAmount ?? 0,
      card_amount: receipt.cardAmount ?? 0,
      guest_count: receipt.guestCount ?? 0,
      avg_spend: receipt.avgSpend ?? 0,
      note: receipt.note ?? null,
    };
    if (receipt.date) updateFields.date = receipt.date;
    if (typeof receipt.isEvent === 'boolean') updateFields.is_event = receipt.isEvent;
    if (receipt.note !== undefined) updateFields.note = receipt.note;

    const { error: updateError } = await supabase
      .from('daily_sales')
      .update(updateFields)
      .eq('id', id)
      .eq('store_id', STORE_ID);

    if (updateError) throw new Error(updateError.message);

    if (Array.isArray(menuItems)) {
      const { error: deleteError } = await supabase
        .from('sales_menu_items').delete().eq('daily_sale_id', id);
      if (deleteError) throw new Error(deleteError.message);

      if (menuItems.length > 0) {
        const { error: insertError } = await supabase.from('sales_menu_items').insert(
          menuItems.map((item) => ({
            daily_sale_id: id,
            name: item.name,
            quantity: item.quantity,
            amount: item.amount,
            category: item.category ?? null,
            menu_id: item.menuId ?? null,
          }))
        );
        if (insertError) throw new Error(insertError.message);
      }
    }

    return NextResponse.json({ success: true, message: '✅ 수정 저장 완료' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
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
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') ?? '0', 10);

    let query = supabase
      .from('daily_sales')
      .select('*, sales_menu_items(*)')
      .eq('store_id', STORE_ID)
      .order('date', { ascending: true });

    if (days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte('date', since.toISOString().split('T')[0]);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? []).map(mapRow) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
