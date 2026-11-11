import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callClaudeVisionWithMeta, sanitizeReportComment } from '@/lib/claude';
import { getStoreInfo } from '@/utils/supabase/getStore';
import {
  getComparisonPeriodBounds,
  calcPeriodStats,
  LOW_INPUT_RATE_THRESHOLD,
} from '@/lib/analytics/periodComparison';
import {
  EXPENSE_GROUP_META_MAP,
  ExpenseGroupKey,
  mapCategoryToExpenseGroup,
  PURCHASE_CATEGORY_LABELS,
} from '@/lib/expenses';

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

    if (!includeEvent) {
      salesQuery = salesQuery.eq('is_event', false);
      prevSalesQuery = prevSalesQuery.eq('is_event', false);
      prevPurchaseQuery = prevPurchaseQuery.eq('is_event', false);
      lastYearSalesQuery = lastYearSalesQuery.eq('is_event', false);
      lastYearPurchaseQuery = lastYearPurchaseQuery.eq('is_event', false);
      purchaseQuery = purchaseQuery.eq('is_event', false);
      past6MonthSalesQuery = past6MonthSalesQuery.eq('is_event', false);
      nextMonthLastYearSalesQuery = nextMonthLastYearSalesQuery.eq('is_event', false);
    }

    // Fetch menus properly with inner join via PostgREST
    let menuJoinQuery = supabase
      .from('sales_menu_items')
      .select(`name, amount, daily_sales!inner(date, store_id, is_event)`)
      .eq('daily_sales.store_id', STORE_ID)
      .gte('daily_sales.date', fromStr)
      .lte('daily_sales.date', toStr);

    if (!includeEvent) {
      menuJoinQuery = menuJoinQuery.eq('daily_sales.is_event', false);
    }

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
      { data: menuDataJoin }
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
      menuJoinQuery
    ]);

    const sales = salesData ?? [];
    const prevSales = prevSalesData ?? [];
    const lastYearSales = lastYearSalesData ?? [];
    const purchases = purchaseData ?? [];
    const prevPurchases = prevPurchaseData ?? [];
    const lastYearPurchases = lastYearPurchaseData ?? [];
    const menus = menuDataJoin ?? [];
    
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

    // Menu metrics
    const menuMap: Record<string, number> = {};
    for (const m of menus) {
      menuMap[m.name] = (menuMap[m.name] || 0) + (m.amount || 0);
    }
    const topMenus = Object.entries(menuMap).map(([m, amt]) => ({ name: m, amount: amt })).sort((a,b)=>b.amount-a.amount).slice(0, 10);

    // Weather metrics
    const weatherMap: Record<string, { sum: number, count: number }> = { '맑음': {sum:0,count:0}, '흐림': {sum:0,count:0}, '비': {sum:0,count:0}, '눈': {sum:0,count:0} };
    for (const s of sales) {
      if (s.weather_condition) {
        if (!weatherMap[s.weather_condition]) {
          weatherMap[s.weather_condition] = {sum:0,count:0};
        }
        weatherMap[s.weather_condition].sum += s.net_revenue || 0;
        weatherMap[s.weather_condition].count += 1;
      }
    }
    const weatherStats = Object.entries(weatherMap)
      .filter(([_, data]) => data.count > 0)
      .map(([condition, data]) => ({
        condition,
        days: data.count,
        avgRevenue: Math.round(data.sum / data.count)
      }))
      .sort((a, b) => b.avgRevenue - a.avgRevenue);

    // Prediction Engine
    const SEASON_MAP: Record<number, string> = {
      1: '겨울 비수기', 2: '겨울 비수기 및 졸업/입학', 3: '봄 학기 개강', 4: '봄나들이 및 벚꽃',
      5: '가정의 달 (가족 단위 외식)', 6: '초여름 및 장마 시작', 7: '여름 성수기 및 휴가철', 8: '여름 성수기 및 휴가철',
      9: '가을 개강 및 나들이', 10: '가을 나들이 및 단풍', 11: '늦가을 비수기', 12: '연말 모임 및 크리스마스'
    };
    
    const HOLIDAY_MAP: Record<number, string[]> = {
      1: ['신정', '설날(변동)'], 2: ['설날(변동)'], 3: ['삼일절'], 5: ['어린이날', '부처님오신날(변동)'],
      6: ['현충일'], 8: ['광복절'], 9: ['추석(변동)'], 10: ['개천절', '한글날'], 12: ['성탄절']
    };

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
      holidays: HOLIDAY_MAP[nextMonth] || [],
      weekendCount,
      recommendedAlcohol,
      recommendedFood
    };

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
      '출력 형식: 평문 3~5문장. 존댓말(~습니다)로 쓴다. 제목, 표, 코드블록, 목록, 이모지, 마크다운 기호(**, #, |) 사용 금지. 화면에 이미 표시된 숫자를 표로 반복하지 말고, 해석과 실행할 조언만 쓴다. 값이 "없음"으로 표시된 항목에 대해서는 데이터 부재 경고문을 쓰지 말 것.';

    const metricDefinitions =
      '[지표 정의] 원가율=재료비(식자재·주류)÷매출, 인건비율=인건비÷매출, FL비율=(재료비+인건비)÷매출, 임대료율=임대료÷매출, 총비용률=총비용÷매출, 남은돈(영업이익)=매출−총비용. "원가율"은 반드시 재료비 기준으로만 사용할 것.';

    const groupSummaryLines = currentStats.expenseGroups
      .map((g) => {
        const momTxt =
          prevStats.hasData && g.prevAmount > 0 && g.momChangePct !== null
            ? `, 전월 대비 ${g.momChangePct >= 0 ? '+' : ''}${g.momChangePct.toFixed(1)}%`
            : '';
        return `${g.shortLabel} ${g.amount}원(${g.ratioPct.toFixed(1)}%${momTxt})`;
      })
      .join(' / ');

    const prevMonthSummary = prevStats.hasData
      ? `매출 ${prevStats.totalRevenue}원, 총비용 ${prevStats.totalExpense}원, 남은돈 ${prevStats.operatingProfit}원, 원가율 ${prevStats.costRatio.toFixed(1)}%, 인건비율 ${prevStats.laborRatio.toFixed(1)}%, FL ${prevStats.flRatio.toFixed(1)}%, 일평균 ${prevStats.avgDailySales}원 (상태: ${prevStats.dataStatus === 'partial' ? '일부 데이터' : '완전'})`
      : '없음';

    const lastYearSection = lastYearStats.hasData
      ? `전년동월 실적(${lastYearStats.dataStatus === 'partial' ? '일부 데이터' : '비교 가능'}): 매출 ${lastYearStats.totalRevenue}원, 총비용 ${lastYearStats.totalExpense}원, 원가율 ${lastYearStats.costRatio.toFixed(1)}%, FL ${lastYearStats.flRatio.toFixed(1)}%, 일평균 ${lastYearStats.avgDailySales}원\n전년 동월 대비 해석 시 계절 요인과 실제 증감을 구분하여 설명할 것.`
      : '';

    const lowInputDirective = isLowInputRate
      ? `\n주의: 이번 달 매출 입력일수가 ${currentStats.openDays}/${currentStats.expectedDays}일(80% 미만)입니다. 반드시 "${lowInputWarningText}"를 포함하고 전월 대비 급감·급증 판단을 단정하지 말 것.`
      : '';

    const aiPrompt = `${metricDefinitions}
이번달(${year}년 ${month}월) 실적: 매출 ${currentStats.totalRevenue}원, 총비용 ${currentStats.totalExpense}원, 남은돈(영업이익) ${currentStats.operatingProfit}원, 영업이익률 ${currentStats.operatingProfitRatio.toFixed(1)}%, 총비용률 ${currentStats.totalCostRatio.toFixed(1)}%, 원가율 ${currentStats.costRatio.toFixed(1)}%, 인건비율 ${currentStats.laborRatio.toFixed(1)}%, FL비율 ${currentStats.flRatio.toFixed(1)}%, 임대료율 ${currentStats.rentRatio.toFixed(1)}%, 일평균 ${currentStats.avgDailySales}원 (매출입력 ${currentStats.openDays}/${currentStats.expectedDays}일, 매입 ${currentStats.purchaseCount}건)
비용 그룹별 상세: ${groupSummaryLines}
전월 실적: ${prevMonthSummary}${lastYearSection ? `\n${lastYearSection}` : ''}
이 매장의 ${year}년 ${month}월 성과와 전월 대비 크게 늘어난 비용 그룹을 짚어 해석과 실행 조언을 작성해 주세요.${lowInputDirective}
${reportFormatRule}`;

    const predictionPrompt = `${metricDefinitions}
이번달(${year}년 ${month}월) 실적: 매출 ${currentStats.totalRevenue}원, 총비용 ${currentStats.totalExpense}원, 원가율 ${currentStats.costRatio.toFixed(1)}%, FL비율 ${currentStats.flRatio.toFixed(1)}%, 일평균 매출 ${currentStats.avgDailySales}원 (영업일 ${currentStats.openDays}일)
비용 그룹별 상세: ${groupSummaryLines}
전월 실적: ${prevMonthSummary}${lastYearSection ? `\n${lastYearSection}` : ''}
다음달(${nextMonth}월) 예측 데이터: 예측 매출 범위 ${predictedMin}원 ~ ${predictedMax}원, 계절성: ${prediction.seasonality || '일반'}, 공휴일: ${prediction.holidays.length > 0 ? prediction.holidays.join(', ') : '없음'}, 주말 일수: ${weekendCount}일
이번 달·전월 실적 및 비용 구조를 반영해 다음 달을 대비한 구체적인 운영 및 발주 조언을 작성해 주세요.${lowInputDirective}
${reportFormatRule}`;

    const bepPrompt = `${metricDefinitions}
손익분기점 분석 데이터 (변동비=재료비+수수료, 고정비=나머지 그룹):
변동비 합계: ${variableCostsSum}원 (변동비율 ${Math.round(variableCostRatio * 100)}%), 고정비 합계: ${fixedCostsSum}원, 손익분기점: ${bep}원, 현재 월매출: ${totalRevenue}원, 부족액(초과 시 음수): ${bepShortfall}원, 영업일수: ${openDays}일
비용 그룹별 상세: ${groupSummaryLines}
이 매장의 손익분기점 달성과 수익 개선을 위한 구체적인 실행 조언(하루 추가 필요 매출 또는 비용 그룹 조정)을 작성해 주세요.
${reportFormatRule}`;

    const weatherPrompt = `날씨와 매출 상관관계 데이터:
${weatherStats.map(w => `${w.condition} ${w.days}일: 일평균 ${w.avgRevenue}원`).join('\n')}
이 매장의 날씨에 따른 매출 차이를 해석하고 식자재·주류 발주 조절 조언을 작성해 주세요.
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
