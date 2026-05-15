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

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  const supabase = makeClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase 환경 변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const period = searchParams.get('period') ?? '30';

  try {
    let query = supabase
      .from('daily_sales')
      .select('id, date, sales_menu_items(name, quantity, amount, category)')
      .eq('store_id', STORE_ID);

    if (fromParam && toParam) {
      query = query.gte('date', fromParam).lte('date', toParam);
    } else if (period !== 'all') {
      const days = parseInt(period, 10);
      const from = new Date();
      from.setDate(from.getDate() - days);
      query = query.gte('date', from.toISOString().split('T')[0]);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate by name — prefer non-null category
    const nameMap: Record<string, { totalAmount: number; totalQuantity: number; category: string | null }> = {};

    for (const sale of (data ?? []) as RawSale[]) {
      for (const item of sale.sales_menu_items ?? []) {
        if (!item.name) continue;
        if (!nameMap[item.name]) {
          nameMap[item.name] = { totalAmount: 0, totalQuantity: 0, category: null };
        }
        nameMap[item.name].totalAmount += item.amount ?? 0;
        nameMap[item.name].totalQuantity += item.quantity ?? 0;
        if (item.category && !nameMap[item.name].category) {
          nameMap[item.name].category = item.category;
        }
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

    // Category breakdown — only labelled items; 미지정 bucket for null
    const categoryMap: Record<string, number> = {};
    for (const item of menuStats) {
      const cat = item.category ?? '미지정';
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

export async function PATCH(request: Request) {
  const supabase = makeClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase 환경 변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    const { menuName, category, newName } = await request.json();
    if (!menuName || category === undefined) {
      return NextResponse.json({ error: 'menuName과 category가 필요합니다.' }, { status: 400 });
    }

    // Get all daily_sales IDs for this store
    const { data: salesRows, error: salesError } = await supabase
      .from('daily_sales')
      .select('id')
      .eq('store_id', STORE_ID);

    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 500 });
    }

    const salesIds = (salesRows ?? []).map((r) => r.id as string);
    if (salesIds.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const updateFields: Record<string, unknown> = { category: category || null };
    if (newName && newName.trim() && newName !== menuName) {
      updateFields.name = newName.trim();
    }

    const { error: updateError } = await supabase
      .from('sales_menu_items')
      .update(updateFields)
      .eq('name', menuName)
      .in('daily_sale_id', salesIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
