import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callClaudeVision } from '@/lib/claude';

export const dynamic = 'force-dynamic';

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

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

  // Current month bounds
  const fromStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Previous month bounds
  const prevDate = new Date(year, month - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;
  const prevFromStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const prevToStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevLastDay).padStart(2, '0')}`;

  // Last year bounds
  const lastYear = year - 1;
  const lastYearFromStr = `${lastYear}-${String(month).padStart(2, '0')}-01`;
  const lastYearLastDay = new Date(lastYear, month, 0).getDate();
  const lastYearToStr = `${lastYear}-${String(month).padStart(2, '0')}-${String(lastYearLastDay).padStart(2, '0')}`;

  try {
    const [
      { data: storeData },
      { data: salesData },
      { data: prevSalesData },
      { data: prevPurchaseData },
      { data: lastYearSalesData },
      { data: lastYearPurchaseData },
      { data: purchaseData }
    ] = await Promise.all([
      supabase.from('stores').select('owner_salary, loan_repayment').eq('id', STORE_ID).single(),
      supabase.from('daily_sales').select('*').eq('store_id', STORE_ID).gte('date', fromStr).lte('date', toStr),
      supabase.from('daily_sales').select('*').eq('store_id', STORE_ID).gte('date', prevFromStr).lte('date', prevToStr),
      supabase.from('purchase_records').select('*').eq('store_id', STORE_ID).gte('date', prevFromStr).lte('date', prevToStr),
      supabase.from('daily_sales').select('*').eq('store_id', STORE_ID).gte('date', lastYearFromStr).lte('date', lastYearToStr),
      supabase.from('purchase_records').select('*').eq('store_id', STORE_ID).gte('date', lastYearFromStr).lte('date', lastYearToStr),
      supabase.from('purchase_records').select('*').eq('store_id', STORE_ID).gte('date', fromStr).lte('date', toStr)
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

    // AI Diagnosis
    const aiPrompt = `보고서 데이터 요약:\n이번달 매출: ${currentStats.totalRevenue}\n전월 매출: ${prevStats.totalRevenue}\n전년동월 매출: ${lastYearStats.totalRevenue}\n이번달 원가율: ${currentStats.costRatio.toFixed(1)}%\n이번달 영업이익: ${currentStats.operatingProfit}\n실질순이익: ${netProfit}\n이 매장의 ${year}년 ${month}월 성과 및 전월/전년 대비 성장/하락 트렌드를 분석하는 진단 코멘트를 한줄로 작성해줘.`;
    const aiDiagnosis = await callClaudeVision(aiPrompt).catch(() => '데이터 기반 진단을 생성하지 못했습니다.');

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
      storeName: '설맥(현리점)',
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
      }
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
