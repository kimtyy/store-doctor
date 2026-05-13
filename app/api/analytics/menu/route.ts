import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

interface RawMenuItem {
  name: string;
  quantity: number;
  amount: number;
  category: string | null;
}

interface RawSale {
  id: string;
  date: string;
  sales_menu_items: RawMenuItem[];
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase 환경 변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') ?? '30';

  try {
    let query = supabase
      .from('daily_sales')
      .select('id, date, sales_menu_items(name, quantity, amount, category)')
      .eq('store_id', STORE_ID);

    if (period !== 'all') {
      const days = parseInt(period, 10);
      const from = new Date();
      from.setDate(from.getDate() - days);
      const fromStr = from.toISOString().split('T')[0];
      query = query.gte('date', fromStr);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nameMap: Record<string, { totalAmount: number; totalQuantity: number; category: string | null }> = {};

    for (const sale of (data ?? []) as RawSale[]) {
      for (const item of sale.sales_menu_items ?? []) {
        if (!item.name) continue;
        if (!nameMap[item.name]) {
          nameMap[item.name] = { totalAmount: 0, totalQuantity: 0, category: item.category ?? null };
        }
        nameMap[item.name].totalAmount += item.amount ?? 0;
        nameMap[item.name].totalQuantity += item.quantity ?? 0;
      }
    }

    const menuStats = Object.entries(nameMap).map(([name, stats]) => ({
      name,
      totalAmount: stats.totalAmount,
      totalQuantity: stats.totalQuantity,
      category: stats.category,
    }));

    const byAmount = [...menuStats].sort((a, b) => b.totalAmount - a.totalAmount);
    const byQuantity = [...menuStats].sort((a, b) => b.totalQuantity - a.totalQuantity);

    const categoryMap: Record<string, number> = {};
    for (const item of menuStats) {
      const cat = item.category ?? '기타';
      categoryMap[cat] = (categoryMap[cat] ?? 0) + item.totalAmount;
    }
    const categoryStats = Object.entries(categoryMap)
      .map(([category, totalAmount]) => ({ category, totalAmount }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return NextResponse.json({ byAmount, byQuantity, categoryStats });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
