import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';

export const dynamic = 'force-dynamic';

export interface TrendingMenuItem {
  name: string;
  todayQty: number;
  qty7: number;
  qty30: number;
  baseline: number;
  increaseRate: number;
  message: string;
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
  // YYYY-MM-DD 형식 검증, 올바르지 않으면 KST 오늘 날짜 사용
  const targetDateStr = queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)
    ? queryDate
    : getKstDateStr();

  const from30Str = addDays(targetDateStr, -30);
  const from7Str = addDays(targetDateStr, -7);
  const toPastStr = addDays(targetDateStr, -1);

  try {
    const { data: sales, error: salesError } = await supabase
      .from('daily_sales')
      .select('id, date, is_event, sales_menu_items(name, quantity, amount)')
      .eq('store_id', STORE_ID)
      .gte('date', from30Str)
      .lte('date', targetDateStr);

    if (salesError) {
      console.error('trending-menu fetch error:', salesError);
      return NextResponse.json({ error: salesError.message }, { status: 500 });
    }

    const past7MenuQty: Record<string, number> = {};
    const past30MenuQty: Record<string, number> = {};
    const todayMenuQty: Record<string, number> = {};

    for (const s of sales || []) {
      const isToday = s.date === targetDateStr;
      const isPast7 = !s.is_event && s.date >= from7Str && s.date <= toPastStr;
      const isPast30 = !s.is_event && s.date >= from30Str && s.date <= toPastStr;

      for (const item of (s.sales_menu_items || [])) {
        const name = item.name?.trim();
        if (!name) continue;
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;

        if (isToday) {
          todayMenuQty[name] = (todayMenuQty[name] || 0) + qty;
        }
        if (isPast7) {
          past7MenuQty[name] = (past7MenuQty[name] || 0) + qty;
        }
        if (isPast30) {
          past30MenuQty[name] = (past30MenuQty[name] || 0) + qty;
        }
      }
    }

    const trending: TrendingMenuItem[] = [];

    for (const [name, todayQty] of Object.entries(todayMenuQty)) {
      const qty30 = past30MenuQty[name] || 0;
      const qty7 = past7MenuQty[name] || 0;

      // 1. 오늘 최소 3개 이상 판매 (단발성 소량 판매로 인한 % 왜곡 방지)
      if (todayQty < 3) continue;

      // 2. 최근 30일간 총 판매량이 5개 이상
      if (qty30 < 5) continue;

      const avg7 = qty7 / 7;
      const avg30 = qty30 / 30;
      const baseline = (avg7 + avg30) / 2;

      // 3. 0 나누기 방지
      if (baseline <= 0) continue;

      // 4. 평소 기준선 대비 20% 이상 증가
      if (todayQty < baseline * 1.2) continue;

      const increaseRate = Math.round(((todayQty - baseline) / baseline) * 100);

      trending.push({
        name,
        todayQty,
        qty7,
        qty30,
        baseline: Number(baseline.toFixed(2)),
        increaseRate,
        message: `🔥 ${name}, 평소보다 ${increaseRate}% 더 팔렸어요`,
      });
    }

    // 4. 증가율 높은 순, 동일 시 판매량 높은 순 정렬 및 상위 5개 추출
    trending.sort((a, b) => b.increaseRate - a.increaseRate || b.todayQty - a.todayQty);
    const topTrending = trending.slice(0, 5);

    return NextResponse.json({
      targetDate: targetDateStr,
      data: topTrending,
    });
  } catch (err) {
    console.error('Error calculating trending menus:', err);
    return NextResponse.json(
      { error: '급상승 메뉴 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
