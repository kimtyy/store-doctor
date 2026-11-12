import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';
import { getUserRole } from '@/utils/supabase/getUserRole';
import {
  buildMenuMasterIndex,
  findSimilarMenuPairs,
  isNonMenuItem,
  isValidLiquorSubCategory,
  isValidMenuRawCategory,
  normalizeMenuCanonicalKey,
  normalizeMenuDisplayName,
  resolveMenuWithIndex,
  suggestMenuClassification,
} from '@/lib/menus';

export const dynamic = 'force-dynamic';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface MenuMasterRowLite {
  id: string;
  menu_name: string;
  aliases: string[] | null;
  category: string | null;
  liquor_sub_category: string | null;
}

function findCanonicalRowMatch(
  rows: MenuMasterRowLite[],
  candidateKey: string,
  excludeId?: string | null
): MenuMasterRowLite | undefined {
  if (!candidateKey) return undefined;
  return rows.find((row) => {
    if (excludeId && row.id === excludeId) return false;
    if (normalizeMenuCanonicalKey(row.menu_name) === candidateKey) return true;
    return (row.aliases ?? []).some((a) => normalizeMenuCanonicalKey(a) === candidateKey);
  });
}

export async function PATCH(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole();
  if (role === 'staff') {
    return NextResponse.json({ error: '메뉴 관리는 사장님 계정만 할 수 있습니다.' }, { status: 403 });
  }

  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: '요청 본문이 비어 있습니다.' }, { status: 400 });
    }

    const { data: allRowsData, error: listErr } = await supabase
      .from('menu_master')
      .select('id, menu_name, aliases, category, liquor_sub_category')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (listErr) throw new Error(listErr.message);
    const allRows = (allRowsData ?? []) as MenuMasterRowLite[];

    // 1) 유사 메뉴 별칭 통합 액션 (canonical key 기준으로 대상·별칭 행 조회)
    if (body.action === 'mergeAlias') {
      const targetMenuName = normalizeMenuDisplayName(String(body.targetMenuName ?? ''));
      const aliasName = normalizeMenuDisplayName(String(body.aliasName ?? ''));
      const targetKey = normalizeMenuCanonicalKey(targetMenuName);
      const aliasKey = normalizeMenuCanonicalKey(aliasName);
      if (!targetMenuName || !aliasName || !targetKey || !aliasKey || targetKey === aliasKey) {
        return NextResponse.json({ error: '통합할 대상 메뉴명과 별칭이 올바르지 않습니다.' }, { status: 400 });
      }

      const targetRow = findCanonicalRowMatch(allRows, targetKey);
      const aliasRow = findCanonicalRowMatch(allRows, aliasKey, targetRow?.id ?? null);

      const mergedAliasSet = new Set<string>(targetRow?.aliases ?? []);
      mergedAliasSet.add(aliasName);
      for (const a of aliasRow?.aliases ?? []) {
        if (a && a !== targetMenuName) mergedAliasSet.add(a);
      }

      const fallbackSuggestion = suggestMenuClassification(targetMenuName);
      const resolvedCategory =
        targetRow?.category ?? aliasRow?.category ?? fallbackSuggestion.suggestedCategory ?? null;
      const resolvedSubCategory =
        resolvedCategory === '주류'
          ? (targetRow?.liquor_sub_category ?? aliasRow?.liquor_sub_category ?? fallbackSuggestion.suggestedLiquorSub ?? null)
          : null;

      if (targetRow) {
        const { error: updateErr } = await supabase
          .from('menu_master')
          .update({
            aliases: Array.from(mergedAliasSet),
            category: resolvedCategory,
            liquor_sub_category: resolvedSubCategory,
          })
          .eq('id', targetRow.id)
          .eq('store_id', STORE_ID);
        if (updateErr) throw new Error(updateErr.message);
      } else {
        const { error: insertErr } = await supabase
          .from('menu_master')
          .insert({
            store_id: STORE_ID,
            menu_name: targetMenuName,
            aliases: Array.from(mergedAliasSet),
            category: resolvedCategory,
            liquor_sub_category: resolvedSubCategory,
          });
        if (insertErr) throw new Error(insertErr.message);
      }

      if (aliasRow && aliasRow.id !== targetRow?.id) {
        const { error: delErr } = await supabase
          .from('menu_master')
          .delete()
          .eq('id', aliasRow.id)
          .eq('store_id', STORE_ID);
        if (delErr) throw new Error(delErr.message);
      }

      return NextResponse.json({ success: true });
    }

    if (!body.menuName) {
      return NextResponse.json({ error: 'menuName이 필요합니다.' }, { status: 400 });
    }

    const { id: rowId, menuName, alias, category, liquorSubCategory, newName } = body as {
      id?: string;
      menuName: string;
      alias?: string;
      category?: string;
      liquorSubCategory?: string | null;
      newName?: string;
    };

    if (category !== undefined && category !== '' && !isValidMenuRawCategory(category)) {
      return NextResponse.json({ error: '올바르지 않은 메뉴 카테고리입니다.' }, { status: 400 });
    }
    if (liquorSubCategory && !isValidLiquorSubCategory(liquorSubCategory)) {
      return NextResponse.json(
        { error: '허용되지 않은 주류 소분류입니다. (소주·생맥주·병맥주·수제맥주·막걸리·전통주·기타 주류 중 선택)' },
        { status: 400 }
      );
    }

    // 기존 행은 id(있으면) 또는 canonical key 로 찾는다
    const cleanOrigName = normalizeMenuDisplayName(menuName);
    const canonicalName =
      newName && newName.trim() && newName.trim() !== menuName
        ? normalizeMenuDisplayName(newName)
        : cleanOrigName;
    const isRename = canonicalName !== cleanOrigName;
    const origKey = normalizeMenuCanonicalKey(cleanOrigName);
    const targetKey = normalizeMenuCanonicalKey(canonicalName);

    const existing =
      (rowId ? allRows.find((r) => r.id === rowId) : undefined) ??
      allRows.find((r) => r.menu_name === cleanOrigName) ??
      findCanonicalRowMatch(allRows, origKey) ??
      null;

    // 충돌 검사(409)는 새 행 생성이거나 이름의 canonical key가 바뀌는 경우에만 수행
    if (!existing || normalizeMenuCanonicalKey(existing.menu_name) !== targetKey) {
      const conflict = findCanonicalRowMatch(allRows, targetKey, existing?.id ?? null);
      if (conflict) {
        return NextResponse.json(
          { error: `이미 등록된 메뉴입니다: ${conflict.menu_name}` },
          { status: 409 }
        );
      }
    }

    if (existing) {
      const updatePayload: Record<string, unknown> = {};
      let updatedAliases: string[] = existing.aliases ?? [];

      if (isRename && !updatedAliases.includes(menuName)) {
        updatedAliases = [...updatedAliases, menuName];
      }
      if (alias && !updatedAliases.includes(alias)) {
        updatedAliases = [...updatedAliases, alias];
      }
      updatePayload.aliases = updatedAliases;

      const finalCategory = category !== undefined ? (category || null) : existing.category;
      if (category !== undefined) {
        updatePayload.category = finalCategory;
      }
      if (liquorSubCategory !== undefined || category !== undefined) {
        updatePayload.liquor_sub_category =
          finalCategory === '주류'
            ? (liquorSubCategory !== undefined ? liquorSubCategory || null : existing.liquor_sub_category ?? null)
            : null;
      }

      const { error: updateError } = await supabase
        .from('menu_master')
        .update(updatePayload)
        .eq('id', existing.id)
        .eq('store_id', STORE_ID);

      if (updateError) throw new Error(updateError.message);
    } else {
      // Entry doesn't exist — create it
      const aliases: string[] = [];
      if (isRename) aliases.push(menuName);
      if (alias && !aliases.includes(alias)) aliases.push(alias);

      const { error: insertError } = await supabase
        .from('menu_master')
        .insert({
          store_id: STORE_ID,
          menu_name: canonicalName,
          aliases,
          category: category || null,
          liquor_sub_category: category === '주류' ? (liquorSubCategory || null) : null,
        });

      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole();
  if (role === 'staff') {
    return NextResponse.json({ error: '메뉴 관리는 사장님 계정만 할 수 있습니다.' }, { status: 403 });
  }

  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);
    const items = (Array.isArray(body?.items) ? body.items : []) as Array<{
      id?: string | null;
      menuName?: string;
      category?: string;
      liquorSubCategory?: string | null;
      aliases?: string[];
    }>;

    // 서버 일괄 검증: 허용되지 않은 카테고리/주류 소분류는 저장 전 400 반환
    for (const raw of items) {
      const menuName = normalizeMenuDisplayName(String(raw.menuName ?? ''));
      if (!menuName) continue;
      if (raw.category && raw.category !== '' && !isValidMenuRawCategory(raw.category)) {
        return NextResponse.json({ error: '올바르지 않은 메뉴 카테고리입니다.' }, { status: 400 });
      }
      if (raw.liquorSubCategory && !isValidLiquorSubCategory(raw.liquorSubCategory)) {
        return NextResponse.json(
          { error: '허용되지 않은 주류 소분류입니다. (소주·생맥주·병맥주·수제맥주·막걸리·전통주·기타 주류 중 선택)' },
          { status: 400 }
        );
      }
    }

    const { data: existingRowsData, error: existingErr } = await supabase
      .from('menu_master')
      .select('id, menu_name, aliases, category, liquor_sub_category')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (existingErr) throw new Error(existingErr.message);
    const existingRows = (existingRowsData ?? []) as MenuMasterRowLite[];

    let savedCount = 0;
    const skippedDuplicates: Array<{ menuName: string; existingName: string }> = [];
    const seenNewKeys = new Map<string, string>(); // key -> menuName (새 행·이름 변경만 배치 내 충돌 검사)

    for (const raw of items) {
      const menuName = normalizeMenuDisplayName(String(raw.menuName ?? ''));
      if (!menuName) continue;
      const candKey = normalizeMenuCanonicalKey(menuName);

      // 기존 행은 id(있으면) 또는 정확/canonical key 로 찾는다
      const existingRow =
        (raw.id ? existingRows.find((r) => r.id === raw.id) : undefined) ??
        existingRows.find((r) => r.menu_name === menuName) ??
        findCanonicalRowMatch(existingRows, candKey);

      const isNewOrKeyChanged =
        !existingRow || normalizeMenuCanonicalKey(existingRow.menu_name) !== candKey;

      // 충돌 검사는 새 행 생성이거나 이름의 canonical key가 바뀌는 경우에만 수행
      if (isNewOrKeyChanged) {
        const dupInDb = findCanonicalRowMatch(existingRows, candKey, existingRow?.id ?? null);
        if (dupInDb) {
          skippedDuplicates.push({ menuName, existingName: dupInDb.menu_name });
          continue;
        }
        const dupInBatch = seenNewKeys.get(candKey);
        if (dupInBatch) {
          skippedDuplicates.push({ menuName, existingName: dupInBatch });
          continue;
        }
        seenNewKeys.set(candKey, menuName);
      }

      const category = raw.category && isValidMenuRawCategory(raw.category) ? raw.category : null;
      const liquorSub =
        category === '주류' && raw.liquorSubCategory && isValidLiquorSubCategory(raw.liquorSubCategory)
          ? raw.liquorSubCategory
          : null;
      const aliases = Array.isArray(raw.aliases)
        ? Array.from(new Set(raw.aliases.map((a) => normalizeMenuDisplayName(String(a))).filter((a) => a && a !== menuName)))
        : [];

      const payload = {
        store_id: STORE_ID,
        menu_name: menuName,
        category,
        liquor_sub_category: liquorSub,
        aliases,
      };

      const targetId = raw.id ?? existingRow?.id ?? null;
      if (targetId) {
        const { error: updErr } = await supabase
          .from('menu_master')
          .update(payload)
          .eq('id', targetId)
          .eq('store_id', STORE_ID);
        if (updErr) throw new Error(updErr.message);
      } else {
        const { error: upsErr } = await supabase
          .from('menu_master')
          .upsert(payload, { onConflict: 'store_id,menu_name' });
        if (upsErr) throw new Error(upsErr.message);
      }
      savedCount += 1;
    }

    return NextResponse.json({ success: true, count: savedCount, skippedDuplicates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole();
  if (role === 'staff') {
    return NextResponse.json({ error: '메뉴 관리는 사장님 계정만 할 수 있습니다.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '삭제할 ID가 필요합니다.' }, { status: 400 });
    }

    const supabase = makeClient();
    const { error } = await supabase
      .from('menu_master')
      .delete()
      .eq('id', id)
      .eq('store_id', STORE_ID);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '삭제 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = makeClient();
    const { data, error } = await supabase
      .from('menu_master')
      .select('id, menu_name, aliases, category, liquor_sub_category')
      .eq('store_id', STORE_ID)
      .order('menu_name', { ascending: true });
    if (error) throw new Error(error.message);

    const masterRows = data ?? [];
    const masterIndex = buildMenuMasterIndex(masterRows);

    // 매출 내역에서 아직 menu_master에 없는 메뉴 + 미분류 메뉴 집계 (daily_sales!inner 조인 + 1000행 페이지네이션)
    const itemRows: Array<{ name: string | null; category: string | null }> = [];
    const PAGE_SIZE = 1000;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data: pageRows, error: itemsError } = await supabase
        .from('sales_menu_items')
        .select('name, category, daily_sales!inner(store_id)')
        .eq('daily_sales.store_id', STORE_ID)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (itemsError) {
        return NextResponse.json(
          { error: `매출 메뉴 내역을 불러오지 못했습니다: ${itemsError.message}` },
          { status: 500 }
        );
      }
      if (!pageRows || pageRows.length === 0) break;
      itemRows.push(...pageRows);
      if (pageRows.length < PAGE_SIZE) break;
    }

    const unmappedMap = new Map<
      string,
      {
        name: string;
        category: string | null;
        suggestedCategory: string | null;
        suggestedLiquorSub: string | null;
      }
    >();
    const allCanonicalKeys = new Map<string, { name: string; count: number; isMaster: boolean }>();

    for (const m of masterRows) {
      const k = normalizeMenuCanonicalKey(m.menu_name);
      if (k) {
        allCanonicalKeys.set(k, { name: m.menu_name, count: 0, isMaster: true });
      }
    }

    for (const row of itemRows ?? []) {
      if (!row.name) continue;
      const resolved = resolveMenuWithIndex(row.name, masterIndex, row.category);
      if (!resolved.canonicalKey) continue;
      const existingEntry = allCanonicalKeys.get(resolved.canonicalKey);
      if (existingEntry) {
        existingEntry.count += 1;
      } else {
        allCanonicalKeys.set(resolved.canonicalKey, {
          name: resolved.canonicalName,
          count: 1,
          isMaster: resolved.matchedMaster,
        });
      }
      if (!resolved.matchedMaster && !unmappedMap.has(resolved.canonicalKey)) {
        const suggestion = suggestMenuClassification(resolved.canonicalName, row.category);
        unmappedMap.set(resolved.canonicalKey, {
          name: resolved.canonicalName,
          category: row.category ?? null,
          suggestedCategory: suggestion.suggestedCategory,
          suggestedLiquorSub: suggestion.suggestedLiquorSub,
        });
      }
    }

    const unmapped = Array.from(unmappedMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    // 분류 필요 개수: menu_master에서 category 미지정 + 매출에는 있으나 카테고리 미분류인 미등록 항목 (배달비 등 메뉴 외 항목 제외)
    const unclassifiedNames: string[] = [];
    for (const m of masterRows) {
      if (!isNonMenuItem(m.menu_name) && !isValidMenuRawCategory(m.category)) {
        unclassifiedNames.push(m.menu_name);
      }
    }
    for (const u of unmapped) {
      if (!isNonMenuItem(u.name) && !isValidMenuRawCategory(u.category)) {
        unclassifiedNames.push(u.name);
      }
    }
    const unclassifiedCount = unclassifiedNames.length;

    // 비슷한 이름 제안 (유사도 >= 0.80, 자동 병합 X)
    const similarPairs = findSimilarMenuPairs(Array.from(allCanonicalKeys.values()), 0.8).slice(0, 30);

    return NextResponse.json({
      data: masterRows,
      unmapped,
      unclassifiedCount,
      unclassifiedNames,
      similarPairs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
