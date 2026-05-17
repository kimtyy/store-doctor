import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

interface PurchaseItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
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
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const period = searchParams.get('period') ?? '30';

  try {
    let fromStr: string | null = null;
    let toStr: string | null = null;
    if (fromParam && toParam) {
      fromStr = fromParam;
      toStr = toParam;
    } else if (period !== 'all') {
      const days = parseInt(period, 10);
      const from = new Date();
      from.setDate(from.getDate() - days);
      fromStr = from.toISOString().split('T')[0];
    }

    let purchaseQuery = supabase
      .from('purchase_records')
      .select('date, total_amount, category, vendor_name, items')
      .eq('store_id', STORE_ID);
    if (fromStr) purchaseQuery = purchaseQuery.gte('date', fromStr);
    if (toStr) purchaseQuery = purchaseQuery.lte('date', toStr);

    let salesQuery = supabase
      .from('daily_sales')
      .select('date, total_revenue')
      .eq('store_id', STORE_ID);
    if (fromStr) salesQuery = salesQuery.gte('date', fromStr);
    if (toStr) salesQuery = salesQuery.lte('date', toStr);

    const [{ data: purchaseData, error: purchaseError }, { data: salesData, error: salesError }] =
      await Promise.all([purchaseQuery, salesQuery]);

    if (purchaseError) return NextResponse.json({ error: purchaseError.message }, { status: 500 });
    if (salesError) return NextResponse.json({ error: salesError.message }, { status: 500 });

    const records = purchaseData ?? [];

    // ── Summary ────────────────────────────────────────────────────────────────
    const totalPurchase = records.reduce((s, r) => s + (r.total_amount ?? 0), 0);
    const totalRevenue = (salesData ?? []).reduce((s, r) => s + (r.total_revenue ?? 0), 0);
    const costRatioPercent = totalRevenue > 0 ? (totalPurchase / totalRevenue) * 100 : 0;

    // ── Category stats ─────────────────────────────────────────────────────────
    const categoryMap: Record<string, number> = {};
    for (const r of records) {
      const cat = r.category ?? 'other';
      categoryMap[cat] = (categoryMap[cat] ?? 0) + (r.total_amount ?? 0);
    }
    const categoryStats = Object.entries(categoryMap)
      .map(([category, totalAmount]) => ({ category, totalAmount }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // ── Item rankings (from JSONB items array) ─────────────────────────────────
    const itemAmountMap: Record<string, number> = {};
    const itemCountMap: Record<string, number> = {};
    const itemTotalAmountForAvg: Record<string, number> = {};

    for (const r of records) {
      const items: PurchaseItem[] = Array.isArray(r.items) ? r.items : [];
      for (const item of items) {
        const name = item.name?.trim();
        if (!name) continue;
        const amt = item.amount !== undefined ? item.amount : (item.unitPrice * item.quantity) || 0;
        itemAmountMap[name] = (itemAmountMap[name] ?? 0) + amt;
        itemCountMap[name] = (itemCountMap[name] ?? 0) + 1;
        itemTotalAmountForAvg[name] = (itemTotalAmountForAvg[name] ?? 0) + amt;
      }
    }

    const itemsByAmount = Object.entries(itemAmountMap)
      .map(([name, totalAmount]) => ({
        name,
        totalAmount,
        count: itemCountMap[name] ?? 1,
        avgAmount: Math.round(totalAmount / (itemCountMap[name] ?? 1)),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const itemsByCount = Object.entries(itemCountMap)
      .map(([name, count]) => ({
        name,
        count,
        totalAmount: itemAmountMap[name] ?? 0,
        avgAmount: Math.round((itemTotalAmountForAvg[name] ?? 0) / count),
      }))
      .sort((a, b) => b.count - a.count);

    // ── Vendor rankings ────────────────────────────────────────────────────────
    const vendorAmountMap: Record<string, number> = {};
    const vendorCountMap: Record<string, number> = {};

    for (const r of records) {
      const vendor = r.vendor_name?.trim() || '미상';
      vendorAmountMap[vendor] = (vendorAmountMap[vendor] ?? 0) + (r.total_amount ?? 0);
      vendorCountMap[vendor] = (vendorCountMap[vendor] ?? 0) + 1;
    }

    const vendorRankings = Object.entries(vendorAmountMap)
      .map(([name, totalAmount]) => ({
        name,
        totalAmount,
        count: vendorCountMap[name] ?? 1,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return NextResponse.json({
      totalPurchase,
      totalRevenue,
      costRatioPercent,
      categoryStats,
      itemsByAmount,
      itemsByCount,
      vendorRankings,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
