import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callClaudeVisionWithMeta, sanitizeReportComment } from '@/lib/claude';
import { getStoreInfo } from '@/utils/supabase/getStore';
import {
  getComparisonPeriodBounds,
  calcPeriodStats,
  calcComparisonMetricDelta,
  calcPaymentCountComparison,
  LOW_INPUT_RATE_THRESHOLD,
} from '@/lib/analytics/periodComparison';
import {
  EXPENSE_GROUP_META_MAP,
  ExpenseGroupKey,
  mapCategoryToExpenseGroup,
  PURCHASE_CATEGORY_LABELS,
} from '@/lib/expenses';
import { analyzeMenuPeriod, MenuSaleInputRow } from '@/lib/analytics/menuAnalysis';
import { MenuMasterRecord } from '@/lib/menus';
import { getHolidaysInRange } from '@/lib/holidays';
import {
  analyzeEventPeriodSales,
  computeStorePeakWeekdays,
  findLastYearSameLunarHolidays,
  mergeStoreEventsWithHolidays,
  STORE_EVENT_IMPACT_LABELS,
  STORE_EVENT_TYPE_META,
  StoreEventRecord,
} from '@/lib/storeEvents';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const storeInfo = await getStoreInfo();
  if (!storeInfo) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const STORE_ID = storeInfo.id;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase env variables not set' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { searchParams } = new URL(request.url);
  const yearStr = searchParams.get('year');
  const monthStr = searchParams.get('month');
  const includeEvent = searchParams.get('includeEvent') === 'true';

  if (!yearStr || !monthStr) {
    return NextResponse.json({ error: 'Missing year or month' }, { status: 400 });
  }

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // 1. 공통 기간 비교 경계 계산 (1-K)
  const bounds = getComparisonPeriodBounds(year, month);
  const fromStr = bounds.current.from;
  const toStr = bounds.current.to;
  const prevFromStr = bounds.prev.from;
  const prevToStr = bounds.prev.to;
  const lastYearFromStr = bounds.lastYear.from;
  const lastYearToStr = bounds.lastYear.to;
  const past6MonthFromStr = bounds.past6MonthFromStr;
  const nextMonthYear = bounds.nextMonth.year;
  const nextMonth = bounds.nextMonth.month;
  const nextMonthLastDay = bounds.nextMonth.daysInMonth;
  const nextMonthLastYearFromStr = bounds.nextMonth.lastYearFrom;
  const nextMonthLastYearToStr = bounds.nextMonth.lastYearTo;

  try {
    let salesQuery = supabase.from('daily_sales').select('*').eq('store_id', STORE_ID).gte('date', fromStr).lte('date', toStr);
    let prevSalesQuery = supabase.from('daily_sales').select('*').eq('store_id', STORE_ID).gte('date', prevFromStr).lte('date', prevToStr);
    let prevPurchaseQuery = supabase.from('purchase_records').select('*').eq('store_id', STORE_ID).gte('date', prevFromStr).lte('date', prevToStr);
    let lastYearSalesQuery = supabase.from('daily_sales').select('*').eq('store_id', STORE_ID).gte('date', lastYearFromStr).lte('date', lastYearToStr);
    let lastYearPurchaseQuery = supabase.from('purchase_records').select('*').eq('store_id', STORE_ID).gte('date', lastYearFromStr).lte('date', lastYearToStr);
    let purchaseQuery = supabase.from('purchase_records').select('*').eq('store_id', STORE_ID).gte('date', fromStr).lte('date', toStr);
    let past6MonthSalesQuery = supabase.from('daily_sales').select('date, net_revenue').eq('store_id', STORE_ID).gte('date', past6MonthFromStr).lte('date', toStr);
    let nextMonthLastYearSalesQuery = supabase.from('daily_sales').select('net_revenue').eq('store_id', STORE_ID).gte('date', nextMonthLastYearFromStr).lte('date', nextMonthLastYearToStr);

    let currentMenuSalesQuery = supabase
      .from('daily_sales')
      .select('id, date, net_revenue, is_event, sales_menu_items(name, quantity, amount, category)')
      .eq('store_id', STORE_ID)
      .gte('date', fromStr)
      .lte('date', toStr);
    let prevMenuSalesQuery = supabase
      .from('daily_sales')
      .select('id, date, net_revenue, is_event, sales_menu_items(name, quantity, amount, category)')
      .eq('store_id', STORE_ID)
      .gte('date', prevFromStr)
      .lte('date', prevToStr);
    let lastYearMenuSalesQuery = supabase
      .from('daily_sales')
      .select('id, date, net_revenue, is_event, sales_menu_items(name, quantity, amount, category)')
      .eq('store_id', STORE_ID)
      .gte('date', lastYearFromStr)
      .lte('date', lastYearToStr);

    if (!includeEvent) {
      salesQuery = salesQuery.eq('is_event', false);
      prevSalesQuery = prevSalesQuery.eq('is_event', false);
      prevPurchaseQuery = prevPurchaseQuery.eq('is_event', false);
      lastYearSalesQuery = lastYearSalesQuery.eq('is_event', false);
      lastYearPurchaseQuery = lastYearPurchaseQuery.eq('is_event', false);
      purchaseQuery = purchaseQuery.eq('is_event', false);
      past6MonthSalesQuery = past6MonthSalesQuery.eq('is_event', false);
      nextMonthLastYearSalesQuery = nextMonthLastYearSalesQuery.eq('is_event', false);
      currentMenuSalesQuery = currentMenuSalesQuery.eq('is_event', false);
      prevMenuSalesQuery = prevMenuSalesQuery.eq('is_event', false);
      lastYearMenuSalesQuery = lastYearMenuSalesQuery.eq('is_event', false);
    }

    const menuMasterQuery = supabase
      .from('menu_master')
      .select('menu_name, category, liquor_sub_category, aliases')
      .eq('store_id', STORE_ID);

    const storeEventsQuery = supabase
      .from('store_events')
      .select('id, store_id, start_date, end_date, title, type, impact, recurring_yearly, memo, created_by, created_at, updated_at')
      .eq('store_id', STORE_ID)
      .order('start_date', { ascending: true });

    const storeQuery = supabase
      .from('stores')
      .select('owner_salary, loan_repayment')
      .eq('id', STORE_ID)
      .single();

    const [
      { data: storeData },
      { data: salesData },
      { data: prevSalesData },
      { data: prevPurchaseData },
      { data: lastYearSalesData },
      { data: lastYearPurchaseData },
      { data: purchaseData },
      { data: past6MonthSalesData },
      { data: nextMonthLastYearSalesData },
      { data: currentMenuSalesData },
      { data: prevMenuSalesData },
      { data: lastYearMenuSalesData },
      { data: menuMasterData, error: menuMasterError },
      { data: storeEventsData, error: storeEventsError }
    ] = await Promise.all([
      storeQuery,
      salesQuery,
      prevSalesQuery,
      prevPurchaseQuery,
      lastYearSalesQuery,
      lastYearPurchaseQuery,
      purchaseQuery,
      past6MonthSalesQuery,
      nextMonthLastYearSalesQuery,
      currentMenuSalesQuery,
      prevMenuSalesQuery,
      lastYearMenuSalesQuery,
      menuMasterQuery,
      storeEventsQuery
    ]);

    if (menuMasterError) {
      return NextResponse.json(
        { error: `메뉴 마스터를 불러오지 못했습니다: ${menuMasterError.message}` },
        { status: 500 }
      );
    }
    if (storeEventsError) {
      return NextResponse.json(
        { error: `매장 사정 데이터를 불러오지 못했습니다: ${storeEventsError.message}` },
        { status: 500 }
      );
    }

    const rawStoreEvents = (storeEventsData ?? []) as StoreEventRecord[];
    const nextMonthFromStr = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`;
    const nextMonthToStr = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-${String(nextMonthLastDay).padStart(2, '0')}`;
    const currentEvents = mergeStoreEventsWithHolidays(rawStoreEvents, fromStr, toStr);
    const prevEvents = mergeStoreEventsWithHolidays(rawStoreEvents, prevFromStr, prevToStr);
    const lastYearEvents = mergeStoreEventsWithHolidays(rawStoreEvents, lastYearFromStr, lastYearToStr);
    const nextMonthEvents = mergeStoreEventsWithHolidays(rawStoreEvents, nextMonthFromStr, nextMonthToStr);

    const sales = salesData ?? [];
    const prevSales = prevSalesData ?? [];
    const lastYearSales = lastYearSalesData ?? [];
    const purchases = purchaseData ?? [];
    const prevPurchases = prevPurchaseData ?? [];
    const lastYearPurchases = lastYearPurchaseData ?? [];
    const masterRows = (menuMasterData ?? []) as MenuMasterRecord[];
    
    const ownerSalary = storeData?.owner_salary || 0;
    const loanRepayment = storeData?.loan_repayment || 0;
    const nonOperatingExpenses = ownerSalary + loanRepayment;

    // 공통 기간 비교 계산 함수 사용 (1-K)
    const lastYearStats = calcPeriodStats(lastYearSales, lastYearPurchases, bounds.lastYear.expectedDays);
    const prevStats = calcPeriodStats(prevSales, prevPurchases, bounds.prev.expectedDays);
    const currentStats = calcPeriodStats(
      sales,
      purchases,
      bounds.current.expectedDays,
      prevStats.groupTotals
    );

    if (currentStats.expenseBreakdown.unmappedCategories.length > 0) {
      console.info(
        '[Report] Unmapped purchase categories grouped into 기타 운영비:',
        currentStats.expenseBreakdown.unmappedCategories
      );
    }

    // Sales metrics (keep existing for backward compatibility)
    const totalRevenue = currentStats.totalRevenue;
    const serviceAmount = sales.reduce((sum, s) => sum + (s.service_charge || 0), 0);
    const netRevenue = sales.reduce((sum, s) => sum + (s.net_revenue || 0), 0);
    const openDays = currentStats.openDays;
    const avgDailySales = currentStats.avgDailySales;
    
    const prevTotalRevenue = prevStats.totalRevenue;
    const momChangePct = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0;

    const cashAmount = sales.reduce((sum, s) => sum + (s.cash_amount || 0), 0);
    const cardAmount = sales.reduce((sum, s) => sum + (s.card_amount || 0), 0);

    // Day of week sales
    const dowMap: Record<number, { sum: number, count: number }> = { 0: {sum:0,count:0}, 1: {sum:0,count:0}, 2: {sum:0,count:0}, 3: {sum:0,count:0}, 4: {sum:0,count:0}, 5: {sum:0,count:0}, 6: {sum:0,count:0} };
    for (const s of sales) {
      const dow = new Date(s.date).getDay();
      dowMap[dow].sum += s.net_revenue || 0;
      dowMap[dow].count += 1;
    }
    const dowAverages = [0, 1, 2, 3, 4, 5, 6].map(dow => {
      const m = dowMap[dow];
      return m.count > 0 ? Math.round(m.sum / m.count) : 0;
    });

    // Expense & Purchase metrics (1-K 표준 분류 기준)
    const totalPurchase = currentStats.totalExpense;
    const totalExpense = currentStats.totalExpense;
    const costRatio = currentStats.costRatio; // 재료비(원가) 기준 원가율

    const purchaseCategoriesMap: Record<string, number> = {};
    const vendorMap: Record<string, { amount: number; groupAmounts: Partial<Record<ExpenseGroupKey, number>> }> = {};
    for (const p of purchases) {
      const cat = p.category || 'other';
      const amt = p.total_amount || 0;
      purchaseCategoriesMap[cat] = (purchaseCategoriesMap[cat] || 0) + amt;

      const v = p.vendor_name || '미상';
      const gKey = mapCategoryToExpenseGroup(cat);
      if (!vendorMap[v]) {
        vendorMap[v] = { amount: 0, groupAmounts: {} };
      }
      vendorMap[v].amount += amt;
      vendorMap[v].groupAmounts[gKey] = (vendorMap[v].groupAmounts[gKey] || 0) + amt;
    }
    const purchaseCategories = Object.entries(purchaseCategoriesMap)
      .map(([cat, amt]) => ({
        name: (PURCHASE_CATEGORY_LABELS as Record<string, string>)[cat] || cat,
        amount: amt,
      }))
      .sort((a, b) => b.amount - a.amount);

    const topVendors = Object.entries(vendorMap)
      .map(([v, info]) => {
        let topGroupKey: ExpenseGroupKey = 'other_ops';
        let topGroupAmt = -1;
        for (const [gk, ga] of Object.entries(info.groupAmounts) as [ExpenseGroupKey, number][]) {
          if (ga > topGroupAmt) {
            topGroupAmt = ga;
            topGroupKey = gk;
          }
        }
        return {
          name: v,
          amount: info.amount,
          groupKey: topGroupKey,
          groupLabel: EXPENSE_GROUP_META_MAP[topGroupKey].shortLabel,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Profit metrics
    const operatingProfit = currentStats.operatingProfit; // 매출 - 총비용 = 남은 돈
    const netProfit = operatingProfit - nonOperatingExpenses;
    const totalCostRatio = currentStats.totalCostRatio; // 총비용 ÷ 매출 * 100

    // Menu & Liquor Analysis (1-L: 전월·전년동월 비교, 공백 무시 정규화, 주류 6소분류, 상/하위 70%/10%, 카테고리 원가율)
    const currentMenuAnalysis = analyzeMenuPeriod(
      (currentMenuSalesData ?? []) as MenuSaleInputRow[],
      purchases,
      masterRows
    );
    const prevMenuAnalysis = analyzeMenuPeriod(
      (prevMenuSalesData ?? []) as MenuSaleInputRow[],
      prevPurchases,
      masterRows
    );
    const lastYearMenuAnalysis = analyzeMenuPeriod(
      (lastYearMenuSalesData ?? []) as MenuSaleInputRow[],
      lastYearPurchases,
      masterRows
    );

    const topMenus = currentMenuAnalysis.menus.slice(0, 10).map((m) => ({
      name: m.name,
      amount: m.amount,
      quantity: m.quantity,
      sharePct: m.sharePct,
      tier: m.tier,
    }));

    // Weather metrics (날씨별 사정 기간 겹침 일수 집계)
    const manualEventDateSet = new Set<string>();
    for (const ev of currentEvents) {
      if (!ev.isAutoHoliday) {
        for (let cur = ev.start_date; cur <= ev.end_date; ) {
          manualEventDateSet.add(cur);
          const d = new Date(`${cur}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          cur = d.toISOString().slice(0, 10);
        }
      }
    }

    const weatherMap: Record<
      string,
      { sum: number; count: number; eventOverlapDays: number }
    > = {
      맑음: { sum: 0, count: 0, eventOverlapDays: 0 },
      흐림: { sum: 0, count: 0, eventOverlapDays: 0 },
      비: { sum: 0, count: 0, eventOverlapDays: 0 },
      눈: { sum: 0, count: 0, eventOverlapDays: 0 },
    };
    for (const s of sales) {
      if (s.weather_condition) {
        if (!weatherMap[s.weather_condition]) {
          weatherMap[s.weather_condition] = { sum: 0, count: 0, eventOverlapDays: 0 };
        }
        weatherMap[s.weather_condition].sum += s.net_revenue || 0;
        weatherMap[s.weather_condition].count += 1;
        if (manualEventDateSet.has(s.date)) {
          weatherMap[s.weather_condition].eventOverlapDays += 1;
        }
      }
    }
    const weatherStats = Object.entries(weatherMap)
      .filter(([_, data]) => data.count > 0)
      .map(([condition, data]) => ({
        condition,
        days: data.count,
        eventOverlapDays: data.eventOverlapDays,
        avgRevenue: Math.round(data.sum / data.count),
      }))
      .sort((a, b) => b.avgRevenue - a.avgRevenue);

    // Prediction Engine
    const SEASON_MAP: Record<number, string> = {
      1: '겨울 비수기', 2: '겨울 비수기 및 졸업/입학', 3: '봄 학기 개강', 4: '봄나들이 및 벚꽃',
      5: '가정의 달 (가족 단위 외식)', 6: '초여름 및 장마 시작', 7: '여름 성수기 및 휴가철', 8: '여름 성수기 및 휴가철',
      9: '가을 개강 및 나들이', 10: '가을 나들이 및 단풍', 11: '늦가을 비수기', 12: '연말 모임 및 크리스마스'
    };
    
    const nextMonthHolidays = getHolidaysInRange(nextMonthFromStr, nextMonthToStr).map((h) => h.title);

    const past6MonthsSales = past6MonthSalesData || [];
    const uniqueMonths = new Set(past6MonthsSales.map(s => s.date.substring(0, 7)));
    const hasEnoughData = uniqueMonths.size >= 6;

    let basePrediction = 0;
    let predictionBasis = '';
    const nextMonthLastYearTotal = (nextMonthLastYearSalesData || []).reduce((sum, s) => sum + (s.net_revenue || 0), 0);
    
    // Calculate 3-month growth rate approx
    const recent3MonthsRev = past6MonthsSales
      .filter(s => new Date(s.date) >= new Date(year, month - 3, 1))
      .reduce((sum, s) => sum + (s.net_revenue || 0), 0);
    const avgRecentRev = recent3MonthsRev / 3;
    const growthRate = avgRecentRev > 0 ? (totalRevenue - avgRecentRev) / avgRecentRev : 0;

    if (nextMonthLastYearTotal > 0) {
      basePrediction = nextMonthLastYearTotal * (1 + growthRate);
      predictionBasis = `전년도 ${nextMonth}월 실적(${Math.round(nextMonthLastYearTotal/10000)}만원)에 최근 성장률(${(growthRate * 100).toFixed(1)}%) 반영`;
    } else {
      basePrediction = totalRevenue * (1 + (growthRate > 0 ? Math.min(growthRate, 0.1) : Math.max(growthRate, -0.1))); // cap growth
      predictionBasis = `최근 3개월 추세 기반 산출 (전년 동월 데이터 없음)`;
    }

    const predictedMin = Math.round(basePrediction * 0.9);
    const predictedMax = Math.round(basePrediction * 1.1);

    // Weekends in next month
    let weekendCount = 0;
    for (let d = 1; d <= nextMonthLastDay; d++) {
      const dayOfWeek = new Date(nextMonthYear, nextMonth - 1, d).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) weekendCount++;
    }

    const alcoholPurchase = purchases.filter(p => p.category === 'alcohol').reduce((sum, p) => sum + (p.total_amount || 0), 0);
    const foodPurchase = purchases.filter(p => p.category === 'food_ingredients').reduce((sum, p) => sum + (p.total_amount || 0), 0);
    const alcoholCostRatioReal = totalRevenue > 0 ? (alcoholPurchase / totalRevenue) : 0;
    const foodCostRatioReal = totalRevenue > 0 ? (foodPurchase / totalRevenue) : 0;

    const recommendedAlcohol = Math.round(basePrediction * alcoholCostRatioReal);
    const recommendedFood = Math.round(basePrediction * foodCostRatioReal);

    const prediction = {
      nextMonth,
      hasEnoughData,
      predictedMin,
      predictedMax,
      predictionBasis,
      seasonality: SEASON_MAP[nextMonth] || '',
      holidays: nextMonthHolidays,
      weekendCount,
      recommendedAlcohol,
      recommendedFood
    };

    // 매장 사정(이벤트) 기간 vs 그 외 기간 일평균 비교 (1-N / 1-N2)
    const endDateObj = new Date(`${toStr}T00:00:00Z`);
    endDateObj.setUTCDate(endDateObj.getUTCDate() - 89);
    const recent90FromStr = endDateObj.toISOString().slice(0, 10);
    const recent90Sales = (past6MonthSalesData ?? []).filter(
      (r: { date: string; net_revenue: number }) => r.date >= recent90FromStr && r.date <= toStr
    );
    const peakWeekdays = computeStorePeakWeekdays(recent90Sales);
    const eventSalesComparison = analyzeEventPeriodSales(sales, currentEvents, peakWeekdays);
    const lastYearSameLunarEvents = findLastYearSameLunarHolidays(currentEvents, rawStoreEvents, year);
    const nextMonthSameLunarEvents = findLastYearSameLunarHolidays(nextMonthEvents, rawStoreEvents, nextMonthYear);
    const hasManualEventsThisMonth = currentEvents.some((e) => !e.isAutoHoliday);
    const showEventPromptBanner =
      prevStats.hasData &&
      prevStats.totalRevenue > 0 &&
      Math.abs(((totalRevenue - prevStats.totalRevenue) / prevStats.totalRevenue) * 100) >= 20 &&
      !hasManualEventsThisMonth;

    // BEP Analysis (1-K 동일 분류 상수 사용: 변동비 = 재료비 + 수수료, 고정비 = 나머지 6개 그룹 + 영업외 지출)
    const variableCostsSum = currentStats.expenseBreakdown.variableCost;
    const fixedCostPurchases = currentStats.expenseBreakdown.fixedCostFromPurchases;
    const fixedCostsSum = fixedCostPurchases + nonOperatingExpenses;
    const variableCostRatio = totalRevenue > 0 ? variableCostsSum / totalRevenue : 0;
    const bep = variableCostRatio < 1 ? Math.round(fixedCostsSum / (1 - variableCostRatio)) : 0;
    const bepShortfall = bep - totalRevenue; // Positive means shortfall, negative means excess

    // Data completeness check (< 80% 입력률 체크)
    const isLowInputRate = currentStats.inputRate < LOW_INPUT_RATE_THRESHOLD;
    const lowInputWarningText = '입력되지 않은 날이 있어 실제와 다를 수 있습니다.';

    // AI Diagnosis (각 호출은 상호 의존성이 없으므로 Promise.allSettled 병렬 실행, 타임아웃 20초, maxTokens 600)
    const reportFormatRule =
      '출력 형식: 평문 3~5문장. 존댓말(~습니다)로 쓴다. 제목, 표, 코드블록, 목록, 이모지, 마크다운 기호(**, #, |) 사용 금지. 화면에 이미 표시된 숫자를 표로 반복하지 말고, 해석과 실행할 조언만 쓴다. 값이 "없음"으로 표시된 항목에 대해서는 데이터 부재 경고문을 쓰지 말 것.\n' +
      '[정확성 규칙]\n' +
      '- 비율의 변화는 반드시 %p 로 말하고, 금액의 변화(%)와 섞지 말 것.\n' +
      '- 프롬프트에 주어진 숫자만 사용하고, 직접 계산한 퍼센트를 만들지 말 것.\n' +
      '- 공과금(전기·가스·수도)은 납부 시점이 사용 월과 다를 수 있으므로, 전월 대비 공과금 증감을 운영 문제로 단정하지 말 것.\n' +
      '- 주류·안주 원가율은 매입 카테고리 분류와 영수증 입력 여부에 따라 실제와 다를 수 있으니, 낮거나 높다고 단정하지 말고 전월 대비 %p 변화 위주로 해석할 것.\n' +
      '- 음료 매출은 대응하는 매입 구분이 없어 원가율 계산에서 제외된다.\n' +
      '- 매출 변동을 해석할 때 기록된 매장 사정을 먼저 고려하고, 사정으로 설명되는 변동을 운영 문제로 단정하지 말 것. 사정 기간을 뺀 평소 일평균으로 실제 추세를 판단할 것.\n' +
      "- 결제 건수는 손님 수나 테이블 수가 아니라 POS 결제 횟수다. '방문객', '테이블당', '객단가'라는 말을 쓰지 말고 '결제 건수', '결제 1건당 매출'로만 말할 것.";

    const metricDefinitions =
      '[지표 정의] 원가율=재료비(식자재·주류)÷매출, 인건비율=인건비÷매출, FL비율=(재료비+인건비)÷매출, 임대료율=임대료÷매출, 총비용률=총비용÷매출, 남은돈(영업이익)=매출−총비용. "원가율"은 반드시 재료비 기준으로만 사용할 것.';

    const groupSummaryLines = currentStats.expenseGroups
      .map((g) => {
        if (!prevStats.hasData) {
          return `${g.shortLabel}: 이번달 금액 ${g.amount}원 (비율 ${g.ratioPct.toFixed(1)}%)`;
        }
        const prevAmt = g.prevAmount ?? 0;
        const prevRatio = prevStats.totalRevenue > 0 ? (prevAmt / prevStats.totalRevenue) * 100 : 0;
        const amtDelta = calcComparisonMetricDelta(g.amount, prevAmt, 'amount', true).formatted;
        const ratioDelta = calcComparisonMetricDelta(g.ratioPct, prevRatio, 'ratio', true).formatted;
        return `${g.shortLabel}: 금액 이번달 ${g.amount}원 / 전월 ${prevAmt}원 (${amtDelta}), 비율 이번달 ${g.ratioPct.toFixed(1)}% / 전월 ${prevRatio.toFixed(1)}% (${ratioDelta})`;
      })
      .join(' | ');

    const prevAmountSummary = prevStats.hasData
      ? [
          `매출 ${currentStats.totalRevenue}원 / 전월 ${prevStats.totalRevenue}원 (${calcComparisonMetricDelta(currentStats.totalRevenue, prevStats.totalRevenue, 'amount', true).formatted})`,
          `총비용 ${currentStats.totalExpense}원 / 전월 ${prevStats.totalExpense}원 (${calcComparisonMetricDelta(currentStats.totalExpense, prevStats.totalExpense, 'amount', true).formatted})`,
          `남은돈 ${currentStats.operatingProfit}원 / 전월 ${prevStats.operatingProfit}원 (${calcComparisonMetricDelta(currentStats.operatingProfit, prevStats.operatingProfit, 'amount', true).formatted})`,
          `일평균매출 ${currentStats.avgDailySales}원 / 전월 ${prevStats.avgDailySales}원 (${calcComparisonMetricDelta(currentStats.avgDailySales, prevStats.avgDailySales, 'amount', true).formatted})`,
        ].join(', ')
      : '없음';

    const prevRatioSummary = prevStats.hasData
      ? [
          `원가율 이번달 ${currentStats.costRatio.toFixed(1)}% / 전월 ${prevStats.costRatio.toFixed(1)}% (${calcComparisonMetricDelta(currentStats.costRatio, prevStats.costRatio, 'ratio', true).formatted})`,
          `인건비율 이번달 ${currentStats.laborRatio.toFixed(1)}% / 전월 ${prevStats.laborRatio.toFixed(1)}% (${calcComparisonMetricDelta(currentStats.laborRatio, prevStats.laborRatio, 'ratio', true).formatted})`,
          `FL비율 이번달 ${currentStats.flRatio.toFixed(1)}% / 전월 ${prevStats.flRatio.toFixed(1)}% (${calcComparisonMetricDelta(currentStats.flRatio, prevStats.flRatio, 'ratio', true).formatted})`,
          `임대료율 이번달 ${currentStats.rentRatio.toFixed(1)}% / 전월 ${prevStats.rentRatio.toFixed(1)}% (${calcComparisonMetricDelta(currentStats.rentRatio, prevStats.rentRatio, 'ratio', true).formatted})`,
          `총비용률 이번달 ${currentStats.totalCostRatio.toFixed(1)}% / 전월 ${prevStats.totalCostRatio.toFixed(1)}% (${calcComparisonMetricDelta(currentStats.totalCostRatio, prevStats.totalCostRatio, 'ratio', true).formatted})`,
          `영업이익률 이번달 ${currentStats.operatingProfitRatio.toFixed(1)}% / 전월 ${prevStats.operatingProfitRatio.toFixed(1)}% (${calcComparisonMetricDelta(currentStats.operatingProfitRatio, prevStats.operatingProfitRatio, 'ratio', true).formatted})`,
        ].join(', ')
      : '없음';

    const prevMonthSummary = prevStats.hasData
      ? `금액 비교(전월 대비 변화율%): ${prevAmountSummary}\n전월 대비 비율 비교(차이 %p): ${prevRatioSummary}\n전월 데이터 상태: ${prevStats.dataStatus === 'partial' ? '일부 데이터' : '완전'}`
      : '없음';

    let lastYearPaymentLine = '';
    if (lastYearStats.hasData && lastYearStats.tablesUsed > 0) {
      const lyPayCmp = calcPaymentCountComparison(currentStats, lastYearStats);
      const lyAvgDelta =
        currentStats.avgSpend > 0 && lastYearStats.avgSpend > 0
          ? calcComparisonMetricDelta(currentStats.avgSpend, lastYearStats.avgSpend, 'amount', true).formatted
          : '-';
      const lyPayNote =
        lastYearStats.paymentDataStatus === 'partial'
          ? ` (전년 일부 데이터 ${lastYearStats.paymentDaysCount}/${lastYearStats.openDays}일)`
          : '';
      lastYearPaymentLine = `\n- 결제 지표: 결제 건수 이번달 ${currentStats.tablesUsed}건 / 전년 ${lastYearStats.tablesUsed}건${lyPayNote} (${lyPayCmp.formatted}), 결제 1건당 매출 이번달 ${currentStats.avgSpend}원 / 전년 ${lastYearStats.avgSpend}원 (${lyAvgDelta})`;
    }

    const lastYearSection = lastYearStats.hasData
      ? `전년동월 비교(${lastYearStats.dataStatus === 'partial' ? '일부 데이터' : '비교 가능'}):\n- 금액: 매출 이번달 ${currentStats.totalRevenue}원 / 전년 ${lastYearStats.totalRevenue}원 (${calcComparisonMetricDelta(currentStats.totalRevenue, lastYearStats.totalRevenue, 'amount', true).formatted}), 총비용 이번달 ${currentStats.totalExpense}원 / 전년 ${lastYearStats.totalExpense}원 (${calcComparisonMetricDelta(currentStats.totalExpense, lastYearStats.totalExpense, 'amount', true).formatted})\n- 비율(%p): 원가율 이번달 ${currentStats.costRatio.toFixed(1)}% / 전년 ${lastYearStats.costRatio.toFixed(1)}% (${calcComparisonMetricDelta(currentStats.costRatio, lastYearStats.costRatio, 'ratio', true).formatted}), FL비율 이번달 ${currentStats.flRatio.toFixed(1)}% / 전년 ${lastYearStats.flRatio.toFixed(1)}% (${calcComparisonMetricDelta(currentStats.flRatio, lastYearStats.flRatio, 'ratio', true).formatted})${lastYearPaymentLine}\n전년 동월 대비 해석 시 계절 요인과 실제 증감을 구분하여 설명할 것.`
      : '';

    const lowInputDirective = isLowInputRate
      ? `\n주의: 이번 달 매출 입력일수가 ${currentStats.openDays}/${currentStats.expectedDays}일(80% 미만)입니다. 반드시 "${lowInputWarningText}"를 포함하고 전월 대비 급감·급증 판단을 단정하지 말 것.`
      : '';

    const paymentDeltaLines: string[] = [];
    const paymentCoverageNote =
      currentStats.paymentDataStatus === 'partial'
        ? ` (일부 데이터 ${currentStats.paymentDaysCount}/${currentStats.openDays}일)`
        : '';
    const prevPayCoverageNote =
      prevStats.paymentDataStatus === 'partial'
        ? ` (전월 일부 데이터 ${prevStats.paymentDaysCount}/${prevStats.openDays}일)`
        : '';
    if (currentStats.tablesUsed > 0) {
      const cntCmp = calcPaymentCountComparison(currentStats, prevStats);
      const cntDelta =
        !prevStats.hasData || prevStats.tablesUsed <= 0
          ? '전월 데이터 없음'
          : cntCmp.formatted;
      paymentDeltaLines.push(
        `결제 건수: 이번달 ${currentStats.tablesUsed}건${paymentCoverageNote}${prevPayCoverageNote} (${cntDelta})`
      );
    } else {
      paymentDeltaLines.push('결제 건수: 없음');
    }
    if (currentStats.avgSpend > 0) {
      const hasPrevAvg = prevStats.hasData && prevStats.avgSpend > 0;
      const avgDelta = hasPrevAvg
        ? calcComparisonMetricDelta(currentStats.avgSpend, prevStats.avgSpend, 'amount', true).formatted
        : '전월 데이터 없음';
      paymentDeltaLines.push(
        `결제 1건당 매출(순매출 기준): 이번달 ${currentStats.avgSpend}원${paymentCoverageNote}${prevPayCoverageNote} (${avgDelta})`
      );
    } else {
      paymentDeltaLines.push('결제 1건당 매출: 없음');
    }
    if (
      currentStats.paymentDataStatus === 'partial' ||
      prevStats.paymentDataStatus === 'partial' ||
      lastYearStats.paymentDataStatus === 'partial'
    ) {
      paymentDeltaLines.push('주의: 일부 데이터 기간의 결제 건수 합계는 비교하지 말 것');
    }

    let menuPromptSection = '메뉴별 매출 데이터: 없음';
    if (currentMenuAnalysis.hasMenuData) {
      const lSharePrev = prevMenuAnalysis.hasMenuData
        ? calcComparisonMetricDelta(
            currentMenuAnalysis.majorShares.liquor,
            prevMenuAnalysis.majorShares.liquor,
            'ratio',
            true
          ).formatted
        : '전월 없음';
      const fSharePrev = prevMenuAnalysis.hasMenuData
        ? calcComparisonMetricDelta(
            currentMenuAnalysis.majorShares.food,
            prevMenuAnalysis.majorShares.food,
            'ratio',
            true
          ).formatted
        : '전월 없음';

      const subSummary = currentMenuAnalysis.liquorSubGroups
        .filter((s) => s.amount > 0)
        .map((s) => {
          const prevSub = prevMenuAnalysis.liquorSubGroups.find((p) => p.key === s.key);
          const subAmtDelta =
            prevMenuAnalysis.hasMenuData && prevSub && prevSub.amount > 0
              ? calcComparisonMetricDelta(s.amount, prevSub.amount, 'amount', true).formatted
              : '전월 비교 없음';
          return `${s.label} ${s.amount}원(주류내 ${s.shareOfLiquorPct.toFixed(1)}%, ${subAmtDelta})`;
        })
        .join(', ');

      const top3Text = currentMenuAnalysis.menus
        .slice(0, 3)
        .map((m) => `${m.name} ${m.amount}원(${m.sharePct.toFixed(1)}%)`)
        .join(', ');
      const bottomSample =
        currentMenuAnalysis.bottom10Menus.length > 0
          ? currentMenuAnalysis.bottom10Menus.slice(0, 3)
          : currentMenuAnalysis.menus.slice(-3);
      const bottomText = bottomSample
        .map((m) => `${m.name} ${m.amount}원(${m.sharePct.toFixed(1)}%)`)
        .join(', ');

      const isMenuPartial = currentMenuAnalysis.dataStatus === 'partial';
      const liqCostText =
        !isMenuPartial && currentMenuAnalysis.liquorCostRatio !== null
          ? `${currentMenuAnalysis.liquorCostRatio.toFixed(1)}%${
              prevMenuAnalysis.hasMenuData &&
              prevMenuAnalysis.dataStatus !== 'partial' &&
              prevMenuAnalysis.liquorCostRatio !== null
                ? ` (${calcComparisonMetricDelta(currentMenuAnalysis.liquorCostRatio, prevMenuAnalysis.liquorCostRatio, 'ratio', true).formatted})`
                : ''
            }`
          : '없음';
      const foodCostText =
        !isMenuPartial && currentMenuAnalysis.foodCostRatio !== null
          ? `${currentMenuAnalysis.foodCostRatio.toFixed(1)}%${
              prevMenuAnalysis.hasMenuData &&
              prevMenuAnalysis.dataStatus !== 'partial' &&
              prevMenuAnalysis.foodCostRatio !== null
                ? ` (${calcComparisonMetricDelta(currentMenuAnalysis.foodCostRatio, prevMenuAnalysis.foodCostRatio, 'ratio', true).formatted})`
                : ''
            }`
          : '없음';

      const menuLines = [
        `메뉴 매출·비중은 순매출 기준`,
        `메뉴 데이터 상태: ${isMenuPartial ? `일부 데이터 (${currentMenuAnalysis.daysWithMenuData}/${currentMenuAnalysis.totalSalesDays}일)` : `완전 (${currentMenuAnalysis.daysWithMenuData}일)`}`,
        `카테고리 비중(비율 변화는 %p): 주류 ${currentMenuAnalysis.majorShares.liquor.toFixed(1)}% (${lSharePrev}), 안주·식사 ${currentMenuAnalysis.majorShares.food.toFixed(1)}% (${fSharePrev}), 기타 ${currentMenuAnalysis.majorShares.other.toFixed(1)}%`,
        `주류 세부: ${subSummary || '없음'}`,
      ];
      if (!isMenuPartial) {
        menuLines.push(`카테고리별 원가율(비율 변화는 %p): 주류 원가율 ${liqCostText}, 안주 원가율 ${foodCostText}`);
      }
      menuLines.push(`상위 대표 메뉴: ${top3Text || '없음'} / 하위권 메뉴: ${bottomText || '없음'}`);
      menuPromptSection = menuLines.join('\n');
    }

    const formatEventsForPrompt = (evList: StoreEventRecord[]): string => {
      if (evList.length === 0) return '없음';
      return evList
        .map((ev) => {
          const typeLabel = (STORE_EVENT_TYPE_META[ev.type] ?? STORE_EVENT_TYPE_META.other).shortLabel;
          const impactLabel = STORE_EVENT_IMPACT_LABELS[ev.impact] ?? '모름';
          const range = ev.start_date === ev.end_date ? ev.start_date : `${ev.start_date}~${ev.end_date}`;
          return `${range} ${ev.title}(${typeLabel}, 영향:${impactLabel}${ev.memo ? `, 메모:${ev.memo}` : ''})`;
        })
        .join(' / ');
    };

    const formatSegmentSummary = (
      label: string,
      seg: {
        days: number;
        peakDays: number;
        avgRevenue: number;
        avgPaymentCount: number | null;
      }
    ): string => {
      const payText = seg.avgPaymentCount !== null ? ` (일평균 결제 ${seg.avgPaymentCount}건)` : '';
      return `${label}(${seg.days}일 · 매출 집중 요일 ${eventSalesComparison.peakLabelText} ${seg.peakDays}일) 일평균 ${seg.avgRevenue}원${payText}`;
    };

    const comparisonLine = eventSalesComparison.canCompare
      ? `사정 기간 vs 평소 일평균(매출 있는 날 기준): ${formatSegmentSummary('사정 기간', eventSalesComparison.eventSegment)} vs ${formatSegmentSummary('그 외 평소', eventSalesComparison.normalSegment)} (차이 ${eventSalesComparison.revenueDiffPct !== null ? `${eventSalesComparison.revenueDiffPct >= 0 ? '+' : ''}${eventSalesComparison.revenueDiffPct}%` : '-'})`
      : '사정 기간 vs 평소 일평균: 비교 불가';

    const holidayLine =
      eventSalesComparison.holidaySegment.days > 0
        ? formatSegmentSummary('공휴일(자동)', eventSalesComparison.holidaySegment)
        : null;

    const perEventLine =
      eventSalesComparison.perEventStats.length > 0
        ? `이벤트별 일평균: ${eventSalesComparison.perEventStats
            .map((p) => formatSegmentSummary(p.title, p))
            .join(' / ')}`
        : null;

    const eventPromptSection = [
      `이번 달 매장 사정: ${formatEventsForPrompt(currentEvents)}`,
      `전월 매장 사정: ${formatEventsForPrompt(prevEvents)}`,
      `전년 동월 매장 사정: ${formatEventsForPrompt(lastYearEvents)}`,
      ...(lastYearSameLunarEvents.length > 0
        ? [`작년 같은 명절 사용자 기록: ${formatEventsForPrompt(lastYearSameLunarEvents)}`]
        : []),
      comparisonLine,
      ...(holidayLine ? [holidayLine] : []),
      ...(perEventLine ? [perEventLine] : []),
      ...(eventSalesComparison.hasWeekdaySkew && eventSalesComparison.weekdaySkewMessage
        ? [`요일 구성 주의: ${eventSalesComparison.weekdaySkewMessage}`]
        : []),
      '사정 기간과 평소 기간의 차이가 작으면, 사정만으로 전월 대비 변동을 설명할 수 없다고 솔직히 말하고 다른 가능성(계절·요일·기타)을 함께 제시할 것. 단정하지 말 것.',
    ].join('\n');

    const aiPrompt = `${metricDefinitions}
이번달(${year}년 ${month}월) 실적: 매출 ${currentStats.totalRevenue}원, 총비용 ${currentStats.totalExpense}원, 남은돈(영업이익) ${currentStats.operatingProfit}원, 영업이익률 ${currentStats.operatingProfitRatio.toFixed(1)}%, 총비용률 ${currentStats.totalCostRatio.toFixed(1)}%, 원가율 ${currentStats.costRatio.toFixed(1)}%, 인건비율 ${currentStats.laborRatio.toFixed(1)}%, FL비율 ${currentStats.flRatio.toFixed(1)}%, 임대료율 ${currentStats.rentRatio.toFixed(1)}%, 일평균 ${currentStats.avgDailySales}원 (매출입력 ${currentStats.openDays}/${currentStats.expectedDays}일, 매입 ${currentStats.purchaseCount}건)
${paymentDeltaLines.join(' / ')}
${eventPromptSection}
비용 그룹별 상세(금액 vs 비율 분리): ${groupSummaryLines}
${menuPromptSection}
${prevMonthSummary}${lastYearSection ? `\n${lastYearSection}` : ''}
이 매장의 ${year}년 ${month}월 손익 성과, 결제 지표(건수·1건당 매출), 매장 사정(이벤트·공휴일) 영향과 평소 일평균 추세, 주류/안주 비중·원가율·인기 메뉴 흐름, 변화가 큰 비용 그룹(공과금 시차 주의)을 종합해 핵심 해석과 실행 조언을 작성해 주세요.${lowInputDirective}
${reportFormatRule}`;

    const predictionPrompt = `${metricDefinitions}
이번달(${year}년 ${month}월) 실적: 매출 ${currentStats.totalRevenue}원, 총비용 ${currentStats.totalExpense}원, 원가율 ${currentStats.costRatio.toFixed(1)}%, FL비율 ${currentStats.flRatio.toFixed(1)}%, 일평균 매출 ${currentStats.avgDailySales}원 (영업일 ${currentStats.openDays}일)
${eventPromptSection}
비용 그룹별 상세(금액 vs 비율 분리): ${groupSummaryLines}
${prevMonthSummary}${lastYearSection ? `\n${lastYearSection}` : ''}
다음달(${nextMonth}월) 예측 데이터: 예측 매출 범위 ${predictedMin}원 ~ ${predictedMax}원, 계절성: ${prediction.seasonality || '일반'}, 공휴일: ${prediction.holidays.length > 0 ? prediction.holidays.join(', ') : '없음'}, 다음달 예정·반복 매장 사정: ${formatEventsForPrompt(nextMonthEvents)}${nextMonthSameLunarEvents.length > 0 ? `, 작년 같은 명절 사용자 기록: ${formatEventsForPrompt(nextMonthSameLunarEvents)}` : ''}, 주말 일수: ${weekendCount}일
이번 달·전월 실적, 기록된 매장 사정(평소 일평균 추세 포함), 다음 달 공휴일·예정 사정을 반영해 다음 달을 대비한 구체적인 운영 및 발주 조언을 작성해 주세요.${lowInputDirective}
${reportFormatRule}`;

    const bepPrompt = `${metricDefinitions}
손익분기점 분석 데이터 (변동비=재료비+수수료, 고정비=나머지 그룹):
변동비 합계: ${variableCostsSum}원 (변동비율 ${Math.round(variableCostRatio * 100)}%), 고정비 합계: ${fixedCostsSum}원, 손익분기점: ${bep}원, 현재 월매출: ${totalRevenue}원, 부족액(초과 시 음수): ${bepShortfall}원, 영업일수: ${openDays}일
${eventPromptSection}
비용 그룹별 상세: ${groupSummaryLines}
이 매장의 손익분기점 달성과 수익 개선을 위한 구체적인 실행 조언(평소 일평균과 사정 기간을 고려한 추가 필요 매출 또는 비용 그룹 조정)을 작성해 주세요.
${reportFormatRule}`;

    const weatherLines = weatherStats.map((w) => {
      const overlapText =
        w.eventOverlapDays > 0 ? ` (이 중 ${w.eventOverlapDays}일이 매장 사정 기간과 겹침)` : '';
      return `${w.condition} ${w.days}일${overlapText}: 일평균 ${w.avgRevenue}원`;
    });

    const weatherPrompt = `날씨와 매출 상관관계 데이터:
${weatherLines.join('\n')}
${eventPromptSection}
이 매장의 날씨에 따른 매출 차이를 해석하고 식자재·주류 발주 조절 조언을 작성해 주세요.
특정 날씨에 사정 기간(행사·훈련·단축 등)이 겹친 경우 날씨 효과만으로 단정하지 말고 사정 영향 가능성을 함께 언급해 주세요.
${reportFormatRule}`;

    const reportClaudeOptions = { timeoutMs: 20000, maxTokens: 600 };
    const [aiRes, predRes, bepRes, weatherRes] = await Promise.allSettled([
      callClaudeVisionWithMeta(aiPrompt, undefined, reportClaudeOptions),
      callClaudeVisionWithMeta(predictionPrompt, undefined, reportClaudeOptions),
      callClaudeVisionWithMeta(bepPrompt, undefined, reportClaudeOptions),
      weatherStats.length > 0
        ? callClaudeVisionWithMeta(weatherPrompt, undefined, reportClaudeOptions)
        : Promise.resolve(null),
    ]);

    const aiFallback = '데이터 기반 진단을 생성하지 못했습니다.';
    const predictionFallback = '예측 진단을 생성하지 못했습니다.';
    const bepFallback = '손익분기점 진단을 생성하지 못했습니다.';
    const weatherFallback = '날씨 진단을 생성하지 못했습니다.';

    let aiDiagnosis = aiRes.status === 'fulfilled' && aiRes.value
      ? sanitizeReportComment(aiRes.value.text, aiRes.value.stopReason, aiFallback)
      : aiFallback;
    if (isLowInputRate && !aiDiagnosis.includes(lowInputWarningText)) {
      aiDiagnosis = `${lowInputWarningText} ${aiDiagnosis}`;
    }

    const predictionAiDiagnosis = predRes.status === 'fulfilled' && predRes.value
      ? sanitizeReportComment(predRes.value.text, predRes.value.stopReason, predictionFallback)
      : predictionFallback;
    const bepAiDiagnosis = bepRes.status === 'fulfilled' && bepRes.value
      ? sanitizeReportComment(bepRes.value.text, bepRes.value.stopReason, bepFallback)
      : bepFallback;
    const weatherAiDiagnosis = weatherStats.length === 0
      ? null
      : (weatherRes.status === 'fulfilled' && weatherRes.value
          ? sanitizeReportComment(weatherRes.value.text, weatherRes.value.stopReason, weatherFallback)
          : weatherFallback);

    return NextResponse.json({
      storeName: storeInfo.name,
      year,
      month,
      generatedAt: new Date().toISOString(),
      dataCoverage: {
        openDays: currentStats.openDays,
        expectedDays: currentStats.expectedDays,
        purchaseCount: currentStats.purchaseCount,
        inputRate: currentStats.inputRate,
        isLowInputRate,
      },
      sales: {
        totalRevenue,
        serviceAmount,
        netRevenue,
        openDays,
        avgDailySales,
        momChangePct,
        cashAmount,
        cardAmount,
        totalRevenueVatIncluded: sales.reduce((sum, s) => sum + (s.total_revenue || 0), 0)
      },
      purchases: {
        totalPurchase,
        totalExpense,
        ingredientCost: currentStats.ingredientCost,
        costRatio,
        laborRatio: currentStats.laborRatio,
        flRatio: currentStats.flRatio,
        rentRatio: currentStats.rentRatio,
        totalCostRatio,
        groups: currentStats.expenseGroups,
        categories: purchaseCategories
      },
      profit: {
        operatingProfit,
        operatingProfitRatio: currentStats.operatingProfitRatio,
        ownerSalary,
        loanRepayment,
        nonOperatingExpenses,
        netProfit,
        totalCostRatio
      },
      bep: {
        fixedCostsSum,
        variableCostRatio,
        bep,
        currentRevenue: totalRevenue,
        bepShortfall,
        aiDiagnosis: bepAiDiagnosis
      },
      topMenus,
      menuAnalysis: {
        current: currentMenuAnalysis,
        prev: prevMenuAnalysis,
        lastYear: lastYearMenuAnalysis,
      },
      topVendors,
      dowAverages, // 0: Sun, 1: Mon, ...
      aiDiagnosis,
      weather: {
        stats: weatherStats,
        aiDiagnosis: weatherAiDiagnosis
      },
      comparison: {
        current: currentStats,
        prev: prevStats,
        lastYear: lastYearStats
      },
      events: {
        current: currentEvents,
        prev: prevEvents,
        lastYear: lastYearEvents,
        nextMonth: nextMonthEvents,
        comparison: eventSalesComparison,
        peakWeekdays,
        hasManualEventsThisMonth,
        showEventPromptBanner,
      },
      prediction: {
        ...prediction,
        aiDiagnosis: predictionAiDiagnosis
      }
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
