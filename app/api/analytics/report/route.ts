import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callClaudeVision } from '@/lib/claude';
import { getStoreInfo } from '@/utils/supabase/getStore';

export const dynamic = 'force-dynamic';



const PURCHASE_CAT_LABELS: Record<string, string> = {
  food_ingredients: '식자재',
  alcohol: '주류',
  consumables: '소모품',
  labor: '인건비',
  rent: '임대료',
  electricity: '전기요금',
  gas: '가스요금',
  water: '수도요금',
  telecom: '통신비',
  pos_fee: 'POS 사용료',
  insurance: '보험료',
  fuel: '유류비',
  other: '기타'
};

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

  if (!yearStr || !monthStr) {
    return NextResponse.json({ error: 'Missing year or month' }, { status: 400 });
  }

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // 1. 한국 표준시 기준 오늘 구하기
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  // Current month bounds
  const fromStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  let dayLimit = lastDay;
  if (year === todayYear && month === todayMonth) {
    dayLimit = todayDay;
  }
  const toStr = `${year}-${String(month).padStart(2, '0')}-${String(dayLimit).padStart(2, '0')}`;

  // Previous month bounds
  const prevDate = new Date(year, month - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;
  const prevFromStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
  let prevDayLimit = prevLastDay;
  if (year === todayYear && month === todayMonth) {
    prevDayLimit = Math.min(todayDay, prevLastDay);
  }
  const prevToStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevDayLimit).padStart(2, '0')}`;

  // Last year bounds
  const lastYear = year - 1;
  const lastYearFromStr = `${lastYear}-${String(month).padStart(2, '0')}-01`;
  const lastYearLastDay = new Date(lastYear, month, 0).getDate();
  let lastYearDayLimit = lastYearLastDay;
  if (year === todayYear && month === todayMonth) {
    lastYearDayLimit = Math.min(todayDay, lastYearLastDay);
  }
  const lastYearToStr = `${lastYear}-${String(month).padStart(2, '0')}-${String(lastYearDayLimit).padStart(2, '0')}`;

  // Past 6 months bounds for data sufficiency check and 3-month MoM
  const past6MonthDate = new Date(year, month - 6, 1);
  const past6MonthFromStr = `${past6MonthDate.getFullYear()}-${String(past6MonthDate.getMonth() + 1).padStart(2, '0')}-01`;

  // Next month bounds (Current Year + Next Month)
  const nextMonthDate = new Date(year, month, 1);
  const nextMonthYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;
  const nextMonthLastDay = new Date(nextMonthYear, nextMonth, 0).getDate();

  // Next month last year bounds
  const nextMonthLastYearFromStr = `${nextMonthYear - 1}-${String(nextMonth).padStart(2, '0')}-01`;
  const nextMonthLastYearLastDay = new Date(nextMonthYear - 1, nextMonth, 0).getDate();
  const nextMonthLastYearToStr = `${nextMonthYear - 1}-${String(nextMonth).padStart(2, '0')}-${String(nextMonthLastYearLastDay).padStart(2, '0')}`;

  try {
    const [
      { data: storeData },
      { data: salesData },
      { data: prevSalesData },
      { data: prevPurchaseData },
      { data: lastYearSalesData },
      { data: lastYearPurchaseData },
      { data: purchaseData },
      { data: past6MonthSalesData },
      { data: nextMonthLastYearSalesData }
    ] = await Promise.all([
      supabase.from('stores').select('owner_salary, loan_repayment').eq('id', STORE_ID).single(),
      supabase.from('daily_sales').select('*').eq('store_id', STORE_ID).gte('date', fromStr).lte('date', toStr),
      supabase.from('daily_sales').select('*').eq('store_id', STORE_ID).gte('date', prevFromStr).lte('date', prevToStr),
      supabase.from('purchase_records').select('*').eq('store_id', STORE_ID).gte('date', prevFromStr).lte('date', prevToStr),
      supabase.from('daily_sales').select('*').eq('store_id', STORE_ID).gte('date', lastYearFromStr).lte('date', lastYearToStr),
      supabase.from('purchase_records').select('*').eq('store_id', STORE_ID).gte('date', lastYearFromStr).lte('date', lastYearToStr),
      supabase.from('purchase_records').select('*').eq('store_id', STORE_ID).gte('date', fromStr).lte('date', toStr),
      supabase.from('daily_sales').select('date, total_revenue').eq('store_id', STORE_ID).gte('date', past6MonthFromStr).lte('date', toStr),
      supabase.from('daily_sales').select('total_revenue').eq('store_id', STORE_ID).gte('date', nextMonthLastYearFromStr).lte('date', nextMonthLastYearToStr)
    ]);

    // Fetch menus properly with inner join via PostgREST
    const { data: menuDataJoin } = await supabase
      .from('sales_menu_items')
      .select(`name, amount, daily_sales!inner(date, store_id)`)
      .eq('daily_sales.store_id', STORE_ID)
      .gte('daily_sales.date', fromStr)
      .lte('daily_sales.date', toStr);

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

    function calcStats(s: any[], p: any[]) {
      const totalRev = s.reduce((sum, item) => sum + (item.total_revenue || 0), 0);
      const totalPur = p.reduce((sum, item) => sum + (item.total_amount || 0), 0);
      const opProfit = totalRev - totalPur;
      const cRatio = totalRev > 0 ? (totalPur / totalRev) * 100 : 0;
      const oDays = s.length;
      const avgDaily = oDays > 0 ? Math.round(totalRev / oDays) : 0;
      const totalTables = s.reduce((sum, item) => sum + (item.tables_used || 0), 0);
      const avgSpend = totalTables > 0 ? Math.round(totalRev / totalTables) : 0;
      return { totalRevenue: totalRev, totalPurchase: totalPur, operatingProfit: opProfit, costRatio: cRatio, openDays: oDays, avgDailySales: avgDaily, avgSpend };
    }

    const currentStats = calcStats(sales, purchases);
    const prevStats = calcStats(prevSales, prevPurchases);
    const lastYearStats = calcStats(lastYearSales, lastYearPurchases);

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
      dowMap[dow].sum += s.total_revenue || 0;
      dowMap[dow].count += 1;
    }
    const dowAverages = [0, 1, 2, 3, 4, 5, 6].map(dow => {
      const m = dowMap[dow];
      return m.count > 0 ? Math.round(m.sum / m.count) : 0;
    });

    // Purchase metrics
    const totalPurchase = purchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);
    const costRatio = totalRevenue > 0 ? (totalPurchase / totalRevenue) * 100 : 0; // Excludes non-operating

    const purchaseCategoriesMap: Record<string, number> = {};
    const vendorMap: Record<string, number> = {};
    for (const p of purchases) {
      const cat = p.category || 'other';
      purchaseCategoriesMap[cat] = (purchaseCategoriesMap[cat] || 0) + (p.total_amount || 0);
      const v = p.vendor_name || '미상';
      vendorMap[v] = (vendorMap[v] || 0) + (p.total_amount || 0);
    }
    const purchaseCategories = Object.entries(purchaseCategoriesMap).map(([cat, amt]) => ({ name: PURCHASE_CAT_LABELS[cat] || cat, amount: amt })).sort((a,b)=>b.amount-a.amount);
    const topVendors = Object.entries(vendorMap).map(([v, amt]) => ({ name: v, amount: amt })).sort((a,b)=>b.amount-a.amount).slice(0, 5);

    // Profit metrics
    const operatingProfit = totalRevenue - totalPurchase;
    const netProfit = operatingProfit - nonOperatingExpenses;
    const totalCostRatio = totalRevenue > 0 ? ((totalPurchase + nonOperatingExpenses) / totalRevenue) * 100 : 0;

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
        weatherMap[s.weather_condition].sum += s.total_revenue || 0;
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
    const nextMonthLastYearTotal = (nextMonthLastYearSalesData || []).reduce((sum, s) => sum + (s.total_revenue || 0), 0);
    
    // Calculate 3-month growth rate approx
    const recent3MonthsRev = past6MonthsSales
      .filter(s => new Date(s.date) >= new Date(year, month - 3, 1))
      .reduce((sum, s) => sum + (s.total_revenue || 0), 0);
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

    // AI Diagnosis
    const aiPrompt = `보고서 데이터 요약:\n이번달 매출: ${currentStats.totalRevenue}\n전월 매출: ${prevStats.totalRevenue}\n전년동월 매출: ${lastYearStats.totalRevenue}\n이번달 원가율: ${currentStats.costRatio.toFixed(1)}%\n이번달 영업이익: ${currentStats.operatingProfit}\n실질순이익: ${netProfit}\n이 매장의 ${year}년 ${month}월 성과 및 전월/전년 대비 성장/하락 트렌드를 분석하는 진단 코멘트를 한줄로 작성해줘.`;
    const aiDiagnosis = await callClaudeVision(aiPrompt).catch(() => '데이터 기반 진단을 생성하지 못했습니다.');

    const predictionPrompt = `다음달(${nextMonth}월) 예측 데이터:\n예측 매출 범위: ${predictedMin} ~ ${predictedMax}\n계절성: ${prediction.seasonality}\n공휴일: ${prediction.holidays.join(', ')}\n주말 일수: ${weekendCount}일\n이번 달 실적 및 위 예측 데이터를 종합하여, 다음 달을 대비하기 위한 구체적인 운영 및 발주 전략을 포함한 AI 진단 코멘트를 작성해줘.`;
    const predictionAiDiagnosis = await callClaudeVision(predictionPrompt).catch(() => '예측 진단을 생성하지 못했습니다.');

    // BEP Analysis
    const fixedCostCategories = new Set(['labor', 'rent', 'electricity', 'gas', 'water', 'telecom', 'pos_fee', 'insurance']);
    const fixedCostPurchases = purchases.reduce((sum, p) => fixedCostCategories.has(p.category || '') ? sum + (p.total_amount || 0) : sum, 0);
    const fixedCostsSum = fixedCostPurchases + nonOperatingExpenses;
    const variableCostsSum = totalPurchase - fixedCostPurchases;
    const variableCostRatio = totalRevenue > 0 ? variableCostsSum / totalRevenue : 0;
    const bep = variableCostRatio < 1 ? Math.round(fixedCostsSum / (1 - variableCostRatio)) : 0;
    const bepShortfall = bep - totalRevenue; // Positive means shortfall, negative means excess

    const bepPrompt = `손익분기점 분석 데이터:\n고정비 합계: ${fixedCostsSum}\n평균 변동비율: ${Math.round(variableCostRatio * 100)}%\n손익분기점: ${bep}\n현재 월매출: ${totalRevenue}\n부족액: ${bepShortfall}\n영업일수: ${openDays}\n이 매장의 상황에 맞는 구체적인 조언(예: 하루 평균 얼마 추가 매출이 필요한지, 객단가를 높일지 등)을 포함한 손익분기점 진단 코멘트를 작성해줘.`;
    const bepAiDiagnosis = await callClaudeVision(bepPrompt).catch(() => '손익분기점 진단을 생성하지 못했습니다.');

    const weatherPrompt = `날씨와 매출 상관관계 데이터:\n${weatherStats.map(w => `${w.condition} ${w.days}일: 평균 ${w.avgRevenue}`).join('\n')}\n이 매장의 날씨에 따른 매출 분석 및 재료/주류 발주 조절에 대한 구체적인 조언을 포함한 AI 진단 코멘트를 작성해줘.`;
    const weatherAiDiagnosis = weatherStats.length > 0 ? await callClaudeVision(weatherPrompt).catch(() => '날씨 진단을 생성하지 못했습니다.') : null;

    return NextResponse.json({
      storeName: storeInfo.name,
      year,
      month,
      generatedAt: new Date().toISOString(),
      sales: {
        totalRevenue,
        serviceAmount,
        netRevenue,
        openDays,
        avgDailySales,
        momChangePct,
        cashAmount,
        cardAmount
      },
      purchases: {
        totalPurchase,
        costRatio,
        categories: purchaseCategories
      },
      profit: {
        operatingProfit,
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
