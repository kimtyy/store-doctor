import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 });
    }

    if (!supabaseUrl || !supabase) {
      return NextResponse.json(
        { error: '서버 설정 오류: Supabase 환경 변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { vendorName, date, totalAmount, taxAmount, netAmount, category, items, inputMethod, note } = payload;

    if (!vendorName || !date || totalAmount === undefined) {
      return NextResponse.json(
        { error: '필수 항목(구매처, 날짜, 금액)이 누락되었습니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('purchase_records')
      .insert({
        store_id: STORE_ID,
        date,
        vendor_name: vendorName,
        total_amount: totalAmount,
        tax_amount: taxAmount ?? 0,
        net_amount: netAmount ?? totalAmount,
        category: category ?? 'other',
        items: items ?? [],
        input_method: inputMethod ?? 'manual',
        note: note ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ 매입 저장 실패:', error);
      return NextResponse.json(
        {
          error: error.message,
          supabaseError: { code: error.code, message: error.message, details: error.details },
        },
        { status: 500 }
      );
    }

    console.log('✅ 매입 저장 완료:', data?.id);
    return NextResponse.json({
      success: true,
      message: '✅ 저장 완료!',
      data: { purchaseId: data?.id, date, totalAmount },
    });
  } catch (error) {
    console.error('❌ 예상치 못한 오류:', error);
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
