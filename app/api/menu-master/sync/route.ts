import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';
import { getUserRole } from '@/utils/supabase/getUserRole';
import { fetchAll, IN_QUERY_CHUNK_SIZE } from '@/lib/supabase/fetchAll';

export const dynamic = 'force-dynamic';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST /api/menu-master/sync
// Retroactively applies menu_master categories and canonical names to existing sales_menu_items
export async function POST() {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole();
  if (role !== 'owner') {
    return NextResponse.json(
      { error: '메뉴 동기화는 매장 소유자만 가능합니다.' },
      { status: 403 }
    );
  }

  try {
    const supabase = makeClient();

    // Fetch all menu_master entries for this store
    const { data: masterRows, error: masterError } = await supabase
      .from('menu_master')
      .select('menu_name, category, aliases')
      .eq('store_id', STORE_ID);

    if (masterError) throw new Error(masterError.message);
    if (!masterRows || masterRows.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: '등록된 메뉴 마스터가 없습니다.' });
    }

    // Build lookup: exact name → { canonicalName, category }
    //               alias       → { canonicalName, category }
    const lookup = new Map<string, { canonicalName: string; category: string | null }>();
    for (const m of masterRows) {
      lookup.set(m.menu_name, { canonicalName: m.menu_name, category: m.category });
      for (const alias of m.aliases ?? []) {
        if (!lookup.has(alias)) {
          lookup.set(alias, { canonicalName: m.menu_name, category: m.category });
        }
      }
    }

    // Fetch all daily_sales IDs for this store
    const { data: salesRows, error: salesError } = await fetchAll(
      supabase
        .from('daily_sales')
        .select('id')
        .eq('store_id', STORE_ID)
        .order('id', { ascending: true })
    );

    if (salesError) throw new Error(`매출 목록 조회 실패: ${salesError.message}`);
    const salesIds = (salesRows ?? []).map((r) => r.id);
    if (salesIds.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: '매출 데이터가 없습니다.' });
    }

    // Fetch all sales_menu_items that match any known name or alias
    const allKnownNames = Array.from(lookup.keys());
    const totalFetchChunks = Math.ceil(salesIds.length / IN_QUERY_CHUNK_SIZE);
    const items: Array<{ id: string; name: string; category: string | null }> = [];

    for (let chunkIdx = 0; chunkIdx < totalFetchChunks; chunkIdx++) {
      const slice = salesIds.slice(
        chunkIdx * IN_QUERY_CHUNK_SIZE,
        (chunkIdx + 1) * IN_QUERY_CHUNK_SIZE
      );
      const q = supabase
        .from('sales_menu_items')
        .select('id, name, category')
        .in('daily_sale_id', slice)
        .in('name', allKnownNames)
        .order('id', { ascending: true });
      const { data: batchItems, error: itemsError } = await fetchAll(q);
      if (itemsError) {
        throw new Error(
          `메뉴 항목 조회 실패 (${chunkIdx}/${totalFetchChunks} 청크 적용됨): ${itemsError.message}`
        );
      }
      if (batchItems) items.push(...batchItems);
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: '업데이트할 항목이 없습니다.' });
    }

    // Group items that actually need updating (category changed or name needs normalization)
    const toUpdate = items.filter((item) => {
      const entry = lookup.get(item.name);
      if (!entry) return false;
      const nameChanged = entry.canonicalName !== item.name;
      const catChanged = entry.category && entry.category !== item.category;
      return nameChanged || catChanged;
    });

    if (toUpdate.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: '이미 모두 동기화되어 있습니다.' });
    }

    // Update in batches of IN_QUERY_CHUNK_SIZE to avoid query size limits
    const totalUpdateChunks = Math.ceil(toUpdate.length / IN_QUERY_CHUNK_SIZE);
    let totalUpdated = 0;

    for (let chunkIdx = 0; chunkIdx < totalUpdateChunks; chunkIdx++) {
      const batch = toUpdate.slice(
        chunkIdx * IN_QUERY_CHUNK_SIZE,
        (chunkIdx + 1) * IN_QUERY_CHUNK_SIZE
      );

      // Group by (canonicalName, category) to minimize round trips
      const groups = new Map<string, string[]>();
      for (const item of batch) {
        const entry = lookup.get(item.name)!;
        const key = JSON.stringify({ name: entry.canonicalName, category: entry.category });
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item.id);
      }

      for (const [keyStr, ids] of groups) {
        const { name: canonicalName, category } = JSON.parse(keyStr) as { name: string; category: string | null };
        const { error: updateError } = await supabase
          .from('sales_menu_items')
          .update({ name: canonicalName, ...(category ? { category } : {}) })
          .in('id', ids);

        if (updateError) {
          throw new Error(
            `메뉴 동기화 업데이트 실패 (${chunkIdx}/${totalUpdateChunks} 청크 적용됨): ${updateError.message}`
          );
        }
        totalUpdated += ids.length;
      }
    }

    return NextResponse.json({
      success: true,
      updated: totalUpdated,
      message: `✅ ${totalUpdated}개 메뉴 업데이트됨`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
