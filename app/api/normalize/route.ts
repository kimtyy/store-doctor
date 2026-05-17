import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수 누락');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function normStr(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

interface MenuItem {
  id: string;
  daily_sale_id: string;
  name: string;
  quantity: number;
  amount: number;
}

export async function POST() {
  try {
    const supabase = makeClient();
    const results = { menuUpdated: 0, menuMerged: 0, vendorUpdated: 0 };

    // ── 1. Normalize sales_menu_items ──────────────────────────────────────────
    const { data: salesRows, error: salesError } = await supabase
      .from('daily_sales')
      .select('id')
      .eq('store_id', STORE_ID);
    if (salesError) throw new Error(salesError.message);

    const saleIdList = (salesRows ?? []).map((r: { id: string }) => r.id);

    if (saleIdList.length > 0) {
      // Fetch in batches of 500 to avoid query limits
      const BATCH = 500;
      const allItems: MenuItem[] = [];
      for (let i = 0; i < saleIdList.length; i += BATCH) {
        const slice = saleIdList.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from('sales_menu_items')
          .select('id, daily_sale_id, name, quantity, amount')
          .in('daily_sale_id', slice);
        if (error) throw new Error(error.message);
        allItems.push(...((data ?? []) as MenuItem[]));
      }

      // Group items by daily_sale_id
      const bySale: Record<string, MenuItem[]> = {};
      for (const item of allItems) {
        if (!bySale[item.daily_sale_id]) bySale[item.daily_sale_id] = [];
        bySale[item.daily_sale_id].push(item);
      }

      for (const items of Object.values(bySale)) {
        const anyDirty = items.some((item) => normStr(item.name) !== item.name);
        if (!anyDirty) continue;

        // Group by normalized name to detect merges
        const groups: Record<string, { ids: string[]; qty: number; amt: number }> = {};
        for (const item of items) {
          const normed = normStr(item.name);
          if (!groups[normed]) {
            groups[normed] = { ids: [item.id], qty: item.quantity ?? 0, amt: item.amount ?? 0 };
          } else {
            groups[normed].ids.push(item.id);
            groups[normed].qty += item.quantity ?? 0;
            groups[normed].amt += item.amount ?? 0;
          }
        }

        for (const [normedName, group] of Object.entries(groups)) {
          const [keepId, ...deleteIds] = group.ids;

          await supabase
            .from('sales_menu_items')
            .update({ name: normedName, quantity: group.qty, amount: group.amt })
            .eq('id', keepId);
          results.menuUpdated++;

          if (deleteIds.length > 0) {
            await supabase.from('sales_menu_items').delete().in('id', deleteIds);
            results.menuMerged += deleteIds.length;
          }
        }
      }
    }

    // ── 2. Normalize purchase_records vendor_name ──────────────────────────────
    const { data: purchases, error: purchaseError } = await supabase
      .from('purchase_records')
      .select('id, vendor_name')
      .eq('store_id', STORE_ID);
    if (purchaseError) throw new Error(purchaseError.message);

    const vendorUpdates: Array<{ id: string; vendor_name: string }> = [];
    for (const record of purchases ?? []) {
      const normed = normStr(record.vendor_name ?? '');
      if (normed !== (record.vendor_name ?? '')) {
        vendorUpdates.push({ id: record.id, vendor_name: normed });
      }
    }

    for (const upd of vendorUpdates) {
      await supabase
        .from('purchase_records')
        .update({ vendor_name: upd.vendor_name })
        .eq('id', upd.id);
      results.vendorUpdated++;
    }

    const parts: string[] = [];
    if (results.menuUpdated > 0) parts.push(`메뉴명 ${results.menuUpdated}개 정규화`);
    if (results.menuMerged > 0) parts.push(`${results.menuMerged}개 중복 병합`);
    if (results.vendorUpdated > 0) parts.push(`매입처명 ${results.vendorUpdated}개 정규화`);
    const message = parts.length > 0 ? parts.join(', ') + ' 완료' : '정규화할 항목이 없습니다.';

    return NextResponse.json({ success: true, message, details: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
