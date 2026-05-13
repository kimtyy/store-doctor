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

// mock 모드 확인 (SUPABASE_SERVICE_ROLE_KEY가 없으면 mock 모드)
const useMockSave = !supabaseServiceKey || supabaseServiceKey.trim() === '';

// Service role key로 Supabase 클라이언트 생성 (RLS 우회)
const supabase = !useMockSave ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
}) : null;

export async function POST(request: Request) {
  try {
    console.log('=== 매출 저장 API 시작 ===');
    console.log('🔧 저장 모드:', useMockSave ? 'MOCK' : 'REAL');
    
    const payload = await request.json().catch(() => null);

    if (!payload) {
      console.error('❌ 요청 본문 파싱 실패');
      return NextResponse.json({
        error: '요청 본문을 파싱할 수 없습니다.'
      }, { status: 400 });
    }

    console.log('📥 받은 payload:', {
      hasReceipt: !!payload.receipt,
      hasMenu: !!payload.menu,
      receiptDate: payload.receipt?.date,
      receiptRevenue: payload.receipt?.totalRevenue
    });

    const { receipt, menu } = payload;

    if (!receipt) {
      console.error('❌ 매출 데이터 없음');
      return NextResponse.json({
        error: '매출 데이터가 필요합니다.'
      }, { status: 400 });
    }

    // Mock 모드에서 저장
    if (useMockSave) {
      console.log('💾 MOCK 모드로 저장...');
      const mockSalesId = '550e8400-e29b-41d4-a716-446655440000';
      return NextResponse.json({
        success: true,
        message: '✅ 저장 완료! (테스트 모드)',
        data: {
          salesId: mockSalesId,
          date: receipt.date,
          totalRevenue: receipt.totalRevenue,
          mode: 'mock'
        }
      });
    }

    // 환경 변수 확인
    if (!supabaseUrl || !supabase) {
      console.error('❌ 환경 변수 미설정');
      return NextResponse.json({
        error: '서버 설정 오류: Supabase 환경 변수가 설정되지 않았습니다.'
      }, { status: 500 });
    }

    // 고정 매장 ID 사용
    const tempStoreId = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

    console.log('🔄 데이터베이스 저장 시작...', { storeId: tempStoreId });

    // 트랜잭션으로 데이터 저장
    const { data: salesData, error: salesError } = await supabase
      .from('daily_sales')
      .insert({
        store_id: tempStoreId,
        date: receipt.date,
        total_revenue: receipt.totalRevenue,
        discount: receipt.discount || 0,
        service_charge: receipt.serviceCharge || 0,
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
        input_method: 'receipt_photo' as const,
        receipt_image_url: receipt.receiptImageUrl || null
      })
      .select('id')
      .single();

    if (salesError) {
      console.error('❌ 매출 데이터 저장 실패:', {
        code: salesError.code,
        message: salesError.message,
        details: salesError.details,
        hint: salesError.hint
      });
      
      // 상세한 Supabase 에러 메시지 반환
      let errorMsg = salesError.message;
      if (salesError.code === '23503') {
        errorMsg = '❌ 매장 ID가 잘못되었습니다. (FK 제약 조건) - Supabase에 stores 테이블 데이터를 추가해주세요.';
      } else if (salesError.code === '23505') {
        errorMsg = '❌ 같은 날짜의 매출이 이미 존재합니다.';
      }
      
      return NextResponse.json({
        error: errorMsg,
        supabaseError: {
          code: salesError.code,
          message: salesError.message,
          details: salesError.details,
          hint: salesError.hint
        }
      }, { status: 500 });
    }

    console.log('✅ 매출 데이터 저장 성공:', { salesId: salesData?.id });

    // 메뉴 항목들 저장 (있는 경우)
    if (menu?.menuItems && menu.menuItems.length > 0) {
      console.log(`🔄 메뉴 항목 ${menu.menuItems.length}개 저장 시작...`);
      const menuItems = menu.menuItems.map((item: SalesMenuItem) => ({
        daily_sale_id: salesData.id,
        name: item.name,
        quantity: item.quantity,
        amount: item.amount,
        category: item.category || null,
        menu_id: item.menuId || null
      }));

      const { error: menuError } = await supabase
        .from('sales_menu_items')
        .insert(menuItems);

      if (menuError) {
        console.error('❌ 메뉴 항목 저장 실패:', {
          code: menuError.code,
          message: menuError.message,
          details: menuError.details
        });
        // 메뉴 저장 실패해도 기본 매출 데이터는 유지
        console.warn('⚠️ 메뉴 항목 저장에 실패했지만 매출 데이터는 저장되었습니다.');
      } else {
        console.log(`✅ 메뉴 항목 ${menu.menuItems.length}개 저장 성공`);
      }
    }

    console.log('✅ 매출 저장 완료!');
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
    console.error('❌ 예상치 못한 오류:', error);

    if (error instanceof Error) {
      console.error('에러 메시지:', error.message);
      console.error('에러 스택:', error.stack);
      return NextResponse.json({
        error: error.message,
        stack: error.stack
      }, { status: 500 });
    }

    return NextResponse.json({
      error: '알 수 없는 오류가 발생했습니다.'
    }, { status: 500 });
  }
}