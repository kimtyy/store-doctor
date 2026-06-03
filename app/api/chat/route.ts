import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';

export const dynamic = 'force-dynamic';


const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function dateStrDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function calcMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return Math.round(slice.reduce((s, v) => s + v, 0) / period);
}

function krw(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

interface SaleRow { date: string; net_revenue: number; }
interface PurchaseRow { date: string; total_amount: number; }
interface MenuItemRow { name: string; quantity: number; amount: number; }
interface SaleWithMenus { id: string; date: string; sales_menu_items: MenuItemRow[]; }

function buildMenuSummary(salesWithMenus: SaleWithMenus[], fromDate: string, toDate: string): { name: string; amount: number }[] {
  const menuMap: Record<string, number> = {};
  for (const sale of salesWithMenus) {
    if (sale.date < fromDate || sale.date > toDate) continue;
    for (const item of sale.sales_menu_items ?? []) {
      if (!item.name) continue;
      menuMap[item.name] = (menuMap[item.name] ?? 0) + (item.amount ?? 0);
    }
  }
  return Object.entries(menuMap)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

async function buildStoreContext(STORE_ID: string): Promise<string> {
  const supabase = makeSupabase();
  if (!supabase) return '(매장 데이터를 불러올 수 없습니다)';

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  // Previous month
  const prevDate = new Date(thisYear, thisMonth - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;

  const thisRange = monthRange(thisYear, thisMonth);
  const prevRange = monthRange(prevYear, prevMonth);
  const from60 = dateStrDaysAgo(60);
  const from30 = dateStrDaysAgo(30);

  const [sales60Res, purchaseRes, menuRes] = await Promise.all([
    supabase.from('daily_sales')
      .select('date, net_revenue')
      .eq('store_id', STORE_ID)
      .gte('date', from60)
      .order('date', { ascending: true }),
    supabase.from('purchase_records')
      .select('date, total_amount')
      .eq('store_id', STORE_ID)
      .gte('date', prevRange.from),
    // Fetch 2 months of menu data in one query
    supabase.from('daily_sales')
      .select('id, date, sales_menu_items(name, quantity, amount)')
      .eq('store_id', STORE_ID)
      .gte('date', prevRange.from)
      .order('date', { ascending: true }),
  ]);

  const sales60 = (sales60Res.data ?? []) as SaleRow[];
  const purchases = (purchaseRes.data ?? []) as PurchaseRow[];
  const salesWithMenus = (menuRes.data ?? []) as unknown as SaleWithMenus[];

  // Split sales into this/prev month and last-30-day
  const salesThisMonth = sales60.filter(d => d.date >= thisRange.from && d.date <= thisRange.to);
  const salesPrevMonth = sales60.filter(d => d.date >= prevRange.from && d.date <= prevRange.to);
  const salesLast30 = sales60.filter(d => d.date >= from30);

  // Purchase maps
  const purchaseByDate: Record<string, number> = {};
  for (const p of purchases) {
    purchaseByDate[p.date] = (purchaseByDate[p.date] ?? 0) + (p.total_amount ?? 0);
  }

  function monthPurchase(fromDate: string, toDate: string): number {
    return purchases
      .filter(p => p.date >= fromDate && p.date <= toDate)
      .reduce((s, p) => s + (p.total_amount ?? 0), 0);
  }

  // Monthly totals
  const thisMthRevenue = salesThisMonth.reduce((s, d) => s + (d.net_revenue ?? 0), 0);
  const thisMthPurchase = monthPurchase(thisRange.from, thisRange.to);
  const prevMthRevenue = salesPrevMonth.reduce((s, d) => s + (d.net_revenue ?? 0), 0);
  const prevMthPurchase = monthPurchase(prevRange.from, prevRange.to);

  // MA5 / MA20 from 60-day window
  const rev60 = sales60.map(d => d.net_revenue ?? 0);
  const ma5 = calcMA(rev60, 5);
  const ma20 = calcMA(rev60, 20);

  // Weekday averages (last 30 days)
  const DOW_KR = ['일', '월', '화', '수', '목', '금', '토'];
  const dowBuckets: Record<number, number[]> = {0:[],1:[],2:[],3:[],4:[],5:[],6:[]};
  for (const d of salesLast30) {
    const dow = new Date(d.date + 'T00:00:00').getDay();
    dowBuckets[dow].push(d.net_revenue ?? 0);
  }

  // Menu summaries per month
  const thisMonthMenus = buildMenuSummary(salesWithMenus, thisRange.from, thisRange.to);
  const prevMonthMenus = buildMenuSummary(salesWithMenus, prevRange.from, prevRange.to);

  // Build context string
  const lines: string[] = [];

  lines.push(`[현재 날짜] ${thisYear}년 ${thisMonth}월 ${now.getDate()}일`);
  lines.push('');

  // This month
  lines.push(`[${thisYear}년 ${thisMonth}월 현황] (${salesThisMonth.length}일 영업)`);
  lines.push(`- 총매출: ${krw(thisMthRevenue)}`);
  lines.push(`- 총매입: ${krw(thisMthPurchase)}${thisMthPurchase === 0 ? ' (매입 미기록)' : ''}`);
  if (thisMthRevenue > 0) {
    lines.push(`- 순이익 추정: ${krw(thisMthRevenue - thisMthPurchase)}`);
    lines.push(`- 일평균 매출: ${krw(Math.round(thisMthRevenue / Math.max(salesThisMonth.length, 1)))}`);
    if (thisMthPurchase > 0) lines.push(`- 원가율: ${((thisMthPurchase / thisMthRevenue) * 100).toFixed(1)}%`);
  }
  lines.push('');

  // Prev month
  lines.push(`[${prevYear}년 ${prevMonth}월 현황] (${salesPrevMonth.length}일 영업)`);
  lines.push(`- 총매출: ${krw(prevMthRevenue)}`);
  lines.push(`- 총매입: ${krw(prevMthPurchase)}${prevMthPurchase === 0 ? ' (매입 미기록)' : ''}`);
  if (prevMthRevenue > 0) {
    lines.push(`- 순이익 추정: ${krw(prevMthRevenue - prevMthPurchase)}`);
    lines.push(`- 일평균 매출: ${krw(Math.round(prevMthRevenue / Math.max(salesPrevMonth.length, 1)))}`);
    if (prevMthPurchase > 0) lines.push(`- 원가율: ${((prevMthPurchase / prevMthRevenue) * 100).toFixed(1)}%`);
  }
  lines.push('');

  // MA
  if (ma5 !== null || ma20 !== null) {
    lines.push('[매출 이평선 (최근 60일 기준)]');
    if (ma5 !== null) lines.push(`- 5일 이평선: ${krw(ma5)}`);
    if (ma20 !== null) lines.push(`- 20일 이평선: ${krw(ma20)}`);
    if (ma5 !== null && ma20 !== null) {
      lines.push(`- 신호: ${ma5 > ma20 ? '5일선 > 20일선 (상승 추세)' : '5일선 < 20일선 (하락 주의)'}`);
    }
    lines.push('');
  }

  // Weekday averages
  lines.push('[요일별 평균 매출 (최근 30일)]');
  for (let i = 1; i <= 7; i++) {
    const dow = i % 7;
    const vals = dowBuckets[dow];
    if (vals.length > 0) {
      const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      lines.push(`- ${DOW_KR[dow]}요일: ${krw(avg)} (${vals.length}회 영업)`);
    }
  }
  lines.push('');

  // This month menus
  if (thisMonthMenus.length > 0) {
    lines.push(`[${thisMonth}월 메뉴별 매출 (전체, 많은 순)]`);
    thisMonthMenus.forEach(({ name, amount }, i) => {
      lines.push(`${i + 1}. ${name}: ${krw(amount)}`);
    });
    lines.push('');
  }

  // Prev month menus
  if (prevMonthMenus.length > 0) {
    lines.push(`[${prevMonth}월 메뉴별 매출 (전체, 많은 순)]`);
    prevMonthMenus.forEach(({ name, amount }, i) => {
      lines.push(`${i + 1}. ${name}: ${krw(amount)}`);
    });
    lines.push('');
  }

  // Daily table (last 30 days)
  lines.push('[최근 30일 일별 매출 / 매입]');
  for (const d of salesLast30) {
    const purchase = purchaseByDate[d.date];
    const purchaseStr = purchase ? ` | 매입 ${krw(purchase)}` : '';
    lines.push(`${d.date}: 매출 ${krw(d.net_revenue ?? 0)}${purchaseStr}`);
  }

  return lines.join('\n');
}

export async function POST(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI 기능이 설정되지 않았습니다. ANTHROPIC_API_KEY를 확인하세요.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { messages } = body as { messages: { role: 'user' | 'assistant'; content: string }[] };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 });
    }

    const storeContext = await buildStoreContext(STORE_ID);

    const now = new Date();
    const thisMonth = now.getMonth() + 1;
    const prevMonth = thisMonth === 1 ? 12 : thisMonth - 1;

    const systemPrompt = `당신은 설맥(현리점)의 AI 경영 컨설턴트입니다. 아래 매장 데이터를 바탕으로 사장님 질문에 답변해 주세요.

=== 매장 데이터 ===
${storeContext}

=== 답변 지침 ===
- 사장님께 친근하고 실용적으로 답변해 주세요
- 위 데이터의 구체적인 수치를 인용하며 조언해 주세요
- 한국어로 답변하고, 사장님을 "사장님"으로 호칭해 주세요
- 핵심만 간결하게 답변해 주세요 (너무 길지 않게)
- 데이터에 없는 내용은 추측하지 말고 "데이터가 없어 확인이 어렵습니다"라고 해주세요
- ${thisMonth}월 관련 질문은 [${thisMonth}월 메뉴별 매출] 데이터를, ${prevMonth}월 관련 질문은 [${prevMonth}월 메뉴별 매출] 데이터를 사용해 주세요
- 표나 목록이 필요하면 마크다운 형식(| 표, ** 굵게, ## 제목)을 사용해 주세요`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = `Claude API 오류 (${response.status})`;
      try {
        const errData = JSON.parse(errText);
        if (errData.error?.message) msg += `: ${errData.error.message}`;
      } catch { /* ignore */ }
      throw new Error(msg);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text ?? '';

    return NextResponse.json({ content });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
