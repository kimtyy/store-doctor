import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

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
    let fromStr: string | null = null;
    if (period !== 'all') {
      const days = parseInt(period, 10);
      const from = new Date();
      from.setDate(from.getDate() - days);
      fromStr = from.toISOString().split('T')[0];
    }

    let purchaseQuery = supabase
      .from('purchase_records')
      .select('date, total_amount, category')
      .eq('store_id', STORE_ID);
    if (fromStr) purchaseQuery = purchaseQuery.gte('date', fromStr);

    let salesQuery = supabase
      .from('daily_sales')
      .select('date, total_revenue')
      .eq('store_id', STORE_ID);
    if (fromStr) salesQuery = salesQuery.gte('date', fromStr);

    const [{ data: purchaseData, error: purchaseError }, { data: salesData, error: salesError }] =
      await Promise.all([purchaseQuery, salesQuery]);

    if (purchaseError) return NextResponse.json({ error: purchaseError.message }, { status: 500 });
    if (salesError) return NextResponse.json({ error: salesError.message }, { status: 500 });

    const totalPurchase = (purchaseData ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0);
    const totalRevenue = (salesData ?? []).reduce((s, r) => s + (r.total_revenue ?? 0), 0);
    const costRatioPercent = totalRevenue > 0 ? (totalPurchase / totalRevenue) * 100 : 0;

    const categoryMap: Record<string, number> = {};
    for (const r of purchaseData ?? []) {
      const cat = r.category ?? 'other';
      categoryMap[cat] = (categoryMap[cat] ?? 0) + (r.total_amount ?? 0);
    }
    const categoryStats = Object.entries(categoryMap)
      .map(([category, totalAmount]) => ({ category, totalAmount }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return NextResponse.json({ totalPurchase, totalRevenue, costRatioPercent, categoryStats });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
