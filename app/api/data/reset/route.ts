import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';
import { getUserRole } from '@/utils/supabase/getUserRole';

export const dynamic = 'force-dynamic';

export async function DELETE() {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole();
  if (role !== 'owner') {
    return NextResponse.json(
      { error: '매장 데이터 초기화는 매장 소유자만 가능합니다.' },
      { status: 403 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    // 1. daily_sales 삭제 (sales_menu_items는 ON DELETE CASCADE로 자동 연쇄 삭제)
    const { error: salesError } = await supabase
      .from('daily_sales')
      .delete()
      .eq('store_id', STORE_ID);

    if (salesError) {
      console.error('daily_sales 삭제 실패:', salesError);
      return NextResponse.json({ error: `매출 데이터 삭제 실패: ${salesError.message}` }, { status: 500 });
    }
    console.log('daily_sales 및 sales_menu_items(CASCADE) 삭제 완료');

    // 2. purchase_records 삭제
    const { error: purchaseError } = await supabase
      .from('purchase_records')
      .delete()
      .eq('store_id', STORE_ID);

    if (purchaseError) {
      console.error('purchase_records 삭제 실패:', purchaseError);
      return NextResponse.json({ error: `매입 데이터 삭제 실패: ${purchaseError.message}` }, { status: 500 });
    }
    console.log('purchase_records 삭제 완료');

    console.log('✅ 전체 초기화 완료');
    return NextResponse.json({
      success: true,
      message: '전체 데이터가 초기화되었습니다.',
    });
  } catch (error) {
    console.error('예상치 못한 오류:', error);
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
