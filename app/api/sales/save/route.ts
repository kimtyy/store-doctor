import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getStoreId } from '@/utils/supabase/getStore';
import { buildMenuMasterIndex, resolveMenuWithIndex } from '@/lib/menus';
import { calcServerAvgSpend, resolvePaymentCountInput } from '@/lib/analytics/periodComparison';
import { codeToWeatherCondition } from '@/lib/weather';

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

    // Fetch weather data for the receipt date using store coordinates
    let weatherCondition: string | null = null;
    let temperature: number | null = null;
    try {
      // 1. 매장 좌표 조회 (W-1: 매장 좌표 사용, 좌표 없으면 날씨 생략)
      const { data: storeRow } = await supabase
        .from('stores')
        .select('latitude, longitude')
        .eq('id', STORE_ID)
        .single();

      if (storeRow?.latitude !== null && storeRow?.latitude !== undefined &&
          storeRow?.longitude !== null && storeRow?.longitude !== undefined) {
        const lat = Number(storeRow.latitude).toFixed(2);
        const lon = Number(storeRow.longitude).toFixed(2);

        // 2. 90일 이전 여부 확인
        const targetDate = new Date(receipt.date);
        const today = new Date();
        const diffDays = Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

        let weatherData: any = null;

        if (diffDays > 90) {
          // 과거 90일 이전: 1차 archive-api 시도
          const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${receipt.date}&end_date=${receipt.date}&daily=weather_code,temperature_2m_mean&timezone=Asia%2FSeoul`;
          try {
            const archiveRes = await fetch(archiveUrl, { signal: AbortSignal.timeout(5000) });
            if (archiveRes.ok) {
              weatherData = await archiveRes.json();
            }
          } catch (archErr) {
            console.warn('Archive weather API failed, trying forecast past_days fallback:', archErr);
          }

          // archive 실패 시 2차 forecast(past_days) fallback 시도
          if (!weatherData?.daily?.weather_code) {
            const fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${receipt.date}&end_date=${receipt.date}&daily=weather_code,temperature_2m_mean&timezone=Asia%2FSeoul&past_days=92`;
            try {
              const fallbackRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(5000) });
              if (fallbackRes.ok) {
                weatherData = await fallbackRes.json();
              }
            } catch (fbErr) {
              console.warn('Forecast fallback weather API failed:', fbErr);
            }
          }
        } else {
          // 90일 이내: forecast API 호출
          const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${receipt.date}&end_date=${receipt.date}&daily=weather_code,temperature_2m_mean&timezone=Asia%2FSeoul`;
          const weatherRes = await fetch(forecastUrl, { signal: AbortSignal.timeout(5000) });
          if (weatherRes.ok) {
            weatherData = await weatherRes.json();
          }
        }

        const code = weatherData?.daily?.weather_code?.[0];
        const temp = weatherData?.daily?.temperature_2m_mean?.[0];

        if (code !== undefined) {
          weatherCondition = codeToWeatherCondition(code);
        }
        if (temp !== undefined && temp !== null && !isNaN(temp)) {
          temperature = Math.round(temp);
        }
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
    }

    const paymentCount = resolvePaymentCountInput(receipt.tablesUsed, receipt.guestCount);
    const resolvedGuestCount = receipt.guestCount && receipt.guestCount > 0 ? receipt.guestCount : paymentCount;
    // 클라이언트 avgSpend 무시: 서버에서 항상 순매출 ÷ 결제 건수로 재계산
    const serverAvgSpend = calcServerAvgSpend(receipt.netRevenue || 0, paymentCount);

    const { data: salesData, error: salesError } = await supabase
      .from('daily_sales')
      .insert({
        store_id: STORE_ID,
        date: receipt.date,
        created_by: user.id,
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
        tables_used: paymentCount,
        guest_count: resolvedGuestCount,
        avg_spend: serverAvgSpend,
        open_time: receipt.openTime || null,
        close_time: receipt.closeTime || null,
        first_order_time: receipt.firstOrderTime || null,
        input_method: receipt.inputMethod || 'receipt_photo',
        receipt_image_url: receipt.receiptImageUrl || null,
        note: receipt.note || null,
        is_event: receipt.isEvent ?? false,
        weather_condition: weatherCondition,
        temperature: temperature,
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

      const masterIndex = buildMenuMasterIndex(masterRows ?? []);

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
        const resolved = resolveMenuWithIndex(item.name, masterIndex, item.category ?? null);
        const canonicalName = resolved.canonicalName;
        const resolvedCategory =
          (resolved.matchedMaster ? resolved.rawCategory : null) ||
          item.category ||
          resolved.rawCategory ||
          categoryFallback[canonicalName] ||
          categoryFallback[item.name] ||
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
