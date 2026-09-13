import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';

export const dynamic = 'force-dynamic';

export interface MonthlyMenuComparisonItem {
  name: string;
  category?: string;
  thisMonthQty: number;
  lastMonthQty: number;
  diff: number;
  rate: number | null;
  isNew: boolean;
}

export interface MonthlyMenuComparisonResponse {
  targetDate: string;
  periods: {
    thisMonth: { from: string; to: string; days: number };
    lastMonth: { from: string; to: string; days: number };
  };
  risingGroup: MonthlyMenuComparisonItem[];
  fallingGroup: MonthlyMenuComparisonItem[];
}

function getKstDateStr(): string {
  const now = new Date();
  const kstString = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
  const kstDate = new Date(kstString);
  const y = kstDate.getFullYear();
  const m = String(kstDate.getMonth() + 1).padStart(2, '0');
  const d = String(kstDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function GET(request: Request) {
  const normalSupabase = createServerClient();
  const { data: { user } } = await normalSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const STORE_ID = await getStoreId();
  if (!STORE_ID) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Supabase configuration is missing' },
      { status: 500 }
    );
  }

  const supabase = createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { searchParams } = new URL(request.url);
  const queryDate = searchParams.get('date');
  const limitParam = parseInt(searchParams.get('limit') || '5', 10);
  const limit = Math.min(Math.max(isNaN(limitParam) ? 5 : limitParam, 1), 50);

  // YYYY-MM-DD 형식 검증, 올바르지 않으면 KST 오늘 날짜 사용
  const targetDateStr = queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)
    ? queryDate
    : getKstDateStr();

  const [year, month, day] = targetDateStr.split('-').map(Number);
  const thisMonthFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const thisMonthTo = targetDateStr;

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevMonthLastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const prevDayLimit = Math.min(day, prevMonthLastDay);

  const lastMonthFrom = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const lastMonthTo = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevDayLimit).padStart(2, '0')}`;

  try {
    // 1. menu_master 카테고리 매핑 로드 (옵션 표시용)
    const { data: masterRows } = await supabase
      .from('menu_master')
      .select('menu_name, category, aliases')
      .eq('store_id', STORE_ID);

    const masterCategoryMap: Record<string, string> = {};
    for (const m of masterRows || []) {
      if (m.category) {
        masterCategoryMap[m.menu_name.trim()] = m.category.trim();
        for (const alias of m.aliases || []) {
          masterCategoryMap[alias.trim()] = m.category.trim();
        }
      }
    }

    // 2. 지난달 1일부터 이번달 대상일자까지 daily_sales + sales_menu_items 조회
    const { data: sales, error: salesError } = await supabase
      .from('daily_sales')
      .select('id, date, is_event, sales_menu_items(name, category, quantity, amount)')
      .eq('store_id', STORE_ID)
      .gte('date', lastMonthFrom)
      .lte('date', thisMonthTo);

    if (salesError) {
      console.error('monthly-menu-comparison fetch error:', salesError);
      return NextResponse.json({ error: salesError.message }, { status: 500 });
    }

    const thisMonthQtyMap: Record<string, number> = {};
    const lastMonthQtyMap: Record<string, number> = {};
    const menuCategories: Record<string, string> = {};
    const allNames = new Set<string>();

    for (const s of sales || []) {
      if (s.is_event) continue; // 행사 매출 제외하여 정상 영업 기준선 비교

      const isThisMonth = s.date >= thisMonthFrom && s.date <= thisMonthTo;
      const isLastMonth = s.date >= lastMonthFrom && s.date <= lastMonthTo;
      if (!isThisMonth && !isLastMonth) continue;

      for (const item of (s.sales_menu_items || [])) {
        const name = item.name?.trim();
        if (!name) continue;
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;

        allNames.add(name);
        const cat = item.category?.trim() || masterCategoryMap[name] || '';
        if (cat && !menuCategories[name]) {
          menuCategories[name] = cat;
        }

        if (isThisMonth) {
          thisMonthQtyMap[name] = (thisMonthQtyMap[name] || 0) + qty;
        }
        if (isLastMonth) {
          lastMonthQtyMap[name] = (lastMonthQtyMap[name] || 0) + qty;
        }
      }
    }

    const risingList: MonthlyMenuComparisonItem[] = [];
    const fallingList: MonthlyMenuComparisonItem[] = [];

    for (const name of Array.from(allNames)) {
      const thisMonthQty = thisMonthQtyMap[name] || 0;
      const lastMonthQty = lastMonthQtyMap[name] || 0;

      // 필터 조건: 둘 중 하나라도 10개 이상이어야 대상 (노이즈 방지)
      if (thisMonthQty < 10 && lastMonthQty < 10) continue;

      const diff = thisMonthQty - lastMonthQty;
      const rate = lastMonthQty > 0
        ? Math.round(((diff) / lastMonthQty) * 1000) / 10
        : null;

      const itemObj: MonthlyMenuComparisonItem = {
        name,
        category: menuCategories[name] || masterCategoryMap[name] || undefined,
        thisMonthQty,
        lastMonthQty,
        diff,
        rate,
        isNew: lastMonthQty === 0,
      };

      if (diff > 0) {
        risingList.push(itemObj);
      } else if (diff < 0) {
        fallingList.push(itemObj);
      }
    }

    // 상승: diff(증감 개수) 내림차순 (가장 많이 증가한 순)
    risingList.sort((a, b) => b.diff - a.diff);
    // 하락: diff(증감 개수) 오름차순 (가장 많이 감소한 순: -100, -50, ...)
    fallingList.sort((a, b) => a.diff - b.diff);

    const responseData: MonthlyMenuComparisonResponse = {
      targetDate: targetDateStr,
      periods: {
        thisMonth: { from: thisMonthFrom, to: thisMonthTo, days: day },
        lastMonth: { from: lastMonthFrom, to: lastMonthTo, days: prevDayLimit },
      },
      risingGroup: risingList.slice(0, limit),
      fallingGroup: fallingList.slice(0, limit),
    };

    return NextResponse.json(responseData);
  } catch (err) {
    console.error('Error calculating monthly menu comparison:', err);
    return NextResponse.json(
      { error: '월별 메뉴 비교 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
