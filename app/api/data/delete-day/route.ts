import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

export async function DELETE(request: Request) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase 환경 변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const payload = await request.json().catch(() => null);
    const date: string | undefined = payload?.date;

    if (!date) {
      return NextResponse.json({ error: '날짜(date)가 필요합니다.' }, { status: 400 });
    }

    // 해당 날짜 daily_sales id 조회
    const { data: salesRows, error: selectError } = await supabase
      .from('daily_sales')
      .select('id')
      .eq('store_id', STORE_ID)
      .eq('date', date);

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    const salesIds = (salesRows ?? []).map((r) => (r as { id: string }).id);

    // sales_menu_items 삭제
    if (salesIds.length > 0) {
      const { error: menuError } = await supabase
        .from('sales_menu_items')
        .delete()
        .in('daily_sale_id', salesIds);

      if (menuError) {
        return NextResponse.json({ error: menuError.message }, { status: 500 });
      }
    }

    // daily_sales 삭제
    const { error: salesError } = await supabase
      .from('daily_sales')
      .delete()
      .eq('store_id', STORE_ID)
      .eq('date', date);

    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 500 });
    }

    // purchase_records 삭제
    const { error: purchaseError } = await supabase
      .from('purchase_records')
      .delete()
      .eq('store_id', STORE_ID)
      .eq('date', date);

    if (purchaseError) {
      return NextResponse.json({ error: purchaseError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${date} 데이터가 삭제되었습니다.`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
