import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';

export const dynamic = 'force-dynamic';

export interface PeriodMenuComparisonItem {
  name: string;
  category?: string;
  thisPeriodQty: number;
  lastPeriodQty: number;
  // 호환용 alias
  thisMonthQty: number;
  lastMonthQty: number;
  diff: number;
  rate: number | null;
  isNew: boolean;
}

export interface PeriodMenuComparisonResponse {
  endDate: string;
  periodType: 'monthly' | 'weekly';
  periods: {
    current: { from: string; to: string; days: number };
    previous: { from: string; to: string; days: number };
  };
  risingGroup: PeriodMenuComparisonItem[];
  fallingGroup: PeriodMenuComparisonItem[];
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

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function getPeriodDates(endDateStr: string, periodType: 'monthly' | 'weekly') {
  if (periodType === 'weekly') {
    const currentTo = endDateStr;
    const currentFrom = addDays(endDateStr, -6); // 7일간
    const previousTo = addDays(currentFrom, -1);
    const previousFrom = addDays(previousTo, -6); // 7일간
    return {
      current: { from: currentFrom, to: currentTo, days: 7 },
      previous: { from: previousFrom, to: previousTo, days: 7 },
    };
  } else {
    // monthly: 31일간 (endDate - 30일 ~ endDate)
    const currentTo = endDateStr;
    const currentFrom = addDays(endDateStr, -30); // 31일간
    const previousTo = addDays(currentFrom, -1);
    const previousFrom = addDays(previousTo, -30); // 31일간
    return {
      current: { from: currentFrom, to: currentTo, days: 31 },
      previous: { from: previousFrom, to: previousTo, days: 31 },
    };
  }
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
  const queryEndDate = searchParams.get('endDate') || searchParams.get('date');
  const periodTypeParam = searchParams.get('periodType');
  const periodType: 'monthly' | 'weekly' = periodTypeParam === 'weekly' ? 'weekly' : 'monthly';

  const limitParam = parseInt(searchParams.get('limit') || '5', 10);
  const limit = Math.min(Math.max(isNaN(limitParam) ? 5 : limitParam, 1), 50);

  // YYYY-MM-DD 형식 검증, 올바르지 않으면 KST 오늘 날짜 사용
  const endDateStr = queryEndDate && /^\d{4}-\d{2}-\d{2}$/.test(queryEndDate)
    ? queryEndDate
    : getKstDateStr();

  const periods = getPeriodDates(endDateStr, periodType);

  try {
    // 1. menu_master 카테고리 매핑 로드
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

    // 2. 이전 기간 시작일부터 이번 기간 종료일까지 daily_sales + sales_menu_items 조회
    const { data: sales, error: salesError } = await supabase
      .from('daily_sales')
      .select('id, date, is_event, sales_menu_items(name, category, quantity, amount)')
      .eq('store_id', STORE_ID)
      .gte('date', periods.previous.from)
      .lte('date', periods.current.to);

    if (salesError) {
      console.error('period-menu-comparison fetch error:', salesError);
      return NextResponse.json({ error: salesError.message }, { status: 500 });
    }

    const currentQtyMap: Record<string, number> = {};
    const previousQtyMap: Record<string, number> = {};
    const menuCategories: Record<string, string> = {};
    const allNames = new Set<string>();

    for (const s of sales || []) {
      if (s.is_event) continue; // 행사 매출 제외

      const isCurrent = s.date >= periods.current.from && s.date <= periods.current.to;
      const isPrevious = s.date >= periods.previous.from && s.date <= periods.previous.to;
      if (!isCurrent && !isPrevious) continue;

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

        if (isCurrent) {
          currentQtyMap[name] = (currentQtyMap[name] || 0) + qty;
        }
        if (isPrevious) {
          previousQtyMap[name] = (previousQtyMap[name] || 0) + qty;
        }
      }
    }

    const risingList: PeriodMenuComparisonItem[] = [];
    const fallingList: PeriodMenuComparisonItem[] = [];

    for (const name of Array.from(allNames)) {
      const thisPeriodQty = currentQtyMap[name] || 0;
      const lastPeriodQty = previousQtyMap[name] || 0;

      // 필터 조건: 둘 중 하나라도 10개 이상이어야 대상 (노이즈 방지)
      if (thisPeriodQty < 10 && lastPeriodQty < 10) continue;

      const diff = thisPeriodQty - lastPeriodQty;
      const rate = lastPeriodQty > 0
        ? Math.round(((diff) / lastPeriodQty) * 1000) / 10
        : null;

      const itemObj: PeriodMenuComparisonItem = {
        name,
        category: menuCategories[name] || masterCategoryMap[name] || undefined,
        thisPeriodQty,
        lastPeriodQty,
        thisMonthQty: thisPeriodQty,
        lastMonthQty: lastPeriodQty,
        diff,
        rate,
        isNew: lastPeriodQty === 0,
      };

      if (diff > 0) {
        risingList.push(itemObj);
      } else if (diff < 0) {
        fallingList.push(itemObj);
      }
    }

    // 상승: diff 내림차순 (가장 많이 늘어난 순)
    risingList.sort((a, b) => b.diff - a.diff);
    // 하락: diff 오름차순 (가장 많이 줄어든 순: -50, -30, ...)
    fallingList.sort((a, b) => a.diff - b.diff);

    const responseData: PeriodMenuComparisonResponse = {
      endDate: endDateStr,
      periodType,
      periods,
      risingGroup: risingList.slice(0, limit),
      fallingGroup: fallingList.slice(0, limit),
    };

    return NextResponse.json(responseData);
  } catch (err) {
    console.error('Error calculating period menu comparison:', err);
    return NextResponse.json(
      { error: '기간별 메뉴 비교 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
