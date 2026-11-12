'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomTabNav from '../../../components/BottomTabNav';
import AdminHeaderBadge from '../../../components/ui/AdminHeaderBadge';
import {
  LIQUOR_SUB_CATEGORIES,
  LIQUOR_SUB_CATEGORY_LABELS,
  LiquorSubCategoryKey,
  SimilarMenuSuggestion,
  isValidLiquorSubCategory,
  suggestLiquorSubCategory,
  suggestMenuClassification,
} from '../../../lib/menus';

const CATEGORIES = ['주류', '음료', '안주', '식사', '세트'] as const;
type Category = (typeof CATEGORIES)[number] | '';

interface MasterRow {
  id: string;
  menu_name: string;
  category: string | null;
  liquor_sub_category?: string | null;
  aliases: string[];
}

interface UnmappedRow {
  name: string;
  category: string | null;
  suggestedCategory?: string | null;
  suggestedLiquorSub?: string | null;
}

interface DraftRow {
  id: string | null; // null = new (not yet saved)
  menuName: string;
  category: Category;
  liquorSubCategory: LiquorSubCategoryKey | '';
  aliases: string[];
  aliasInput: string;
  dirty: boolean;
}

function rowFromMaster(m: MasterRow): DraftRow {
  const cat = (m.category as Category) ?? '';
  const sub = isValidLiquorSubCategory(m.liquor_sub_category) ? m.liquor_sub_category : '';
  return {
    id: m.id,
    menuName: m.menu_name,
    category: cat,
    liquorSubCategory: sub,
    aliases: m.aliases ?? [],
    aliasInput: '',
    dirty: false,
  };
}

function newDraftRow(
  name = '',
  category: Category = '',
  liquorSubCategory: LiquorSubCategoryKey | '' = ''
): DraftRow {
  return { id: null, menuName: name, category, liquorSubCategory, aliases: [], aliasInput: '', dirty: true };
}

const CAT_BG: Record<string, string> = {
  주류: 'bg-indigo-900/60 text-indigo-300',
  음료: 'bg-sky-900/60 text-sky-300',
  안주: 'bg-orange-900/60 text-orange-300',
  식사: 'bg-emerald-900/60 text-emerald-300',
  세트: 'bg-purple-900/60 text-purple-300',
  '': 'bg-slate-700/60 text-slate-400',
};

export default function MenuMasterPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedRow[]>([]);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [unclassifiedNames, setUnclassifiedNames] = useState<string[]>([]);
  const [similarPairs, setSimilarPairs] = useState<SimilarMenuSuggestion[]>([]);
  const [dismissedPairs, setDismissedPairs] = useState<string[]>([]);
  const [mergingPairKey, setMergingPairKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/menu-master');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '불러오기 실패');
      const masterArr: MasterRow[] = body.data ?? body.master ?? [];
      setRows(masterArr.map(rowFromMaster));
      setUnmapped(body.unmapped ?? []);
      setUnclassifiedCount(body.unclassifiedCount ?? 0);
      setUnclassifiedNames(body.unclassifiedNames ?? []);
      setSimilarPairs(body.similarPairs ?? []);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '불러오기 실패' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function addNewRow() {
    setRows((prev) => [...prev, newDraftRow()]);
    setExpandedIdx(rows.length);
  }

  function addFromUnmapped(u: UnmappedRow) {
    setUnmapped((prev) => prev.filter((x) => x.name !== u.name));
    const suggested = suggestMenuClassification(u.name, u.category);
    const cat = ((u.category as Category) || suggested.suggestedCategory || '') as Category;
    const sub =
      cat === '주류'
        ? (isValidLiquorSubCategory(u.suggestedLiquorSub) ? u.suggestedLiquorSub : suggested.suggestedLiquorSub ?? '')
        : '';
    const draft = newDraftRow(u.name, cat, sub);
    setRows((prev) => {
      const idx = prev.length;
      setExpandedIdx(idx);
      return [...prev, draft];
    });
  }

  async function mergeSimilarPair(targetMenuName: string, aliasName: string) {
    const key = `${targetMenuName}::${aliasName}`;
    setMergingPairKey(key);
    setMessage(null);
    try {
      const res = await fetch('/api/menu-master', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mergeAlias', targetMenuName, aliasName }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? '통합 실패');
      setMessage({ type: 'success', text: `✅ "${aliasName}" → "${targetMenuName}" 별칭으로 통합했습니다.` });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '통합 실패' });
    } finally {
      setMergingPairKey(null);
    }
  }

  function updateRow(idx: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, dirty: true } : r)));
  }

  function addAlias(idx: number) {
    const row = rows[idx];
    const alias = row.aliasInput.trim();
    if (!alias || row.aliases.includes(alias)) return;
    updateRow(idx, { aliases: [...row.aliases, alias], aliasInput: '' });
  }

  function removeAlias(idx: number, alias: string) {
    updateRow(idx, { aliases: rows[idx].aliases.filter((a) => a !== alias) });
  }

  async function deleteRow(idx: number) {
    const row = rows[idx];
    if (row.id) {
      const res = await fetch(`/api/menu-master?id=${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessage({ type: 'error', text: body?.error ?? '삭제 실패' });
        return;
      }
    }
    setRows((prev) => prev.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  }

  async function saveAll() {
    const dirtyRows = rows.filter((r) => r.dirty && r.menuName.trim());
    if (dirtyRows.length === 0) {
      setMessage({ type: 'success', text: '변경 사항이 없습니다.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/menu-master', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: dirtyRows.map((r) => ({
            id: r.id,
            menuName: r.menuName.trim(),
            category: r.category,
            liquorSubCategory: r.category === '주류' ? (r.liquorSubCategory || null) : null,
            aliases: r.aliases,
          })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? '저장 실패');
      setMessage({ type: 'success', text: `✅ ${body.count}개 저장 완료` });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' });
    } finally {
      setSaving(false);
    }
  }

  async function syncExisting() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/menu-master/sync', { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? '동기화 실패');
      setMessage({ type: 'success', text: body.message ?? '동기화 완료' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '동기화 실패' });
    } finally {
      setSyncing(false);
    }
  }

  const dirtyCount = rows.filter((r) => r.dirty && r.menuName.trim()).length;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-200 text-lg">←</button>
            <h1 className="text-xl font-bold text-slate-100">메뉴 관리</h1>
          </div>
          <AdminHeaderBadge />
        </div>
      </header>

      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
        <div className="mx-auto max-w-2xl space-y-4">

          {message ? (
            <div className={`rounded-2xl border p-4 text-sm ${
              message.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            }`}>
              {message.text}
            </div>
          ) : null}

          {/* 분류 필요 안내 */}
          {unclassifiedCount > 0 && (
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-amber-300">분류 필요 {unclassifiedCount}개</p>
                <span className="text-xs text-amber-200/80">보고서에서 &quot;기타&quot;로 합산됨</span>
              </div>
              {unclassifiedNames.length > 0 && (
                <p className="text-xs text-slate-300">
                  {unclassifiedNames.slice(0, 8).join(', ')}
                  {unclassifiedNames.length > 8 ? ` 외 ${unclassifiedNames.length - 8}개` : ''}
                </p>
              )}
            </div>
          )}

          {/* 비슷한 이름 제안 (확인 후 별칭 통합) */}
          {similarPairs.filter((p) => !dismissedPairs.includes(`${p.canonicalCandidate}::${p.variantName}`)).length > 0 && (
            <div className="rounded-3xl border border-sky-500/30 bg-sky-950/20 p-5 space-y-3">
              <div>
                <p className="text-sm font-semibold text-sky-300">
                  비슷한 이름 제안 ({similarPairs.filter((p) => !dismissedPairs.includes(`${p.canonicalCandidate}::${p.variantName}`)).length}건)
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  오탈자 가능성이 있는 메뉴입니다. 같은 메뉴라면 확인 후 통합해 주세요 (과거 데이터는 보존됩니다).
                </p>
              </div>
              <div className="space-y-2">
                {similarPairs
                  .filter((p) => !dismissedPairs.includes(`${p.canonicalCandidate}::${p.variantName}`))
                  .map((pair) => {
                    const pKey = `${pair.canonicalCandidate}::${pair.variantName}`;
                    const isMerging = mergingPairKey === pKey;
                    return (
                      <div key={pKey} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs space-y-0.5">
                          <p className="font-semibold text-slate-100">
                            &quot;{pair.variantName}&quot; ↔ &quot;{pair.canonicalCandidate}&quot;
                          </p>
                          <p className="text-slate-400">유사도 {Math.round(pair.similarity * 100)}%</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={isMerging}
                            onClick={() => mergeSimilarPair(pair.canonicalCandidate, pair.variantName)}
                            className="rounded-xl bg-sky-500/20 border border-sky-500/40 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
                          >
                            {isMerging ? '통합 중...' : `"${pair.canonicalCandidate}"로 통합`}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDismissedPairs((prev) => [...prev, pKey])}
                            className="rounded-xl border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                          >
                            다른 메뉴
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* 미등록 메뉴 (자동 추출) */}
          {unmapped.length > 0 && (
            <div className="rounded-3xl border border-amber-700/40 bg-amber-950/20 p-5 space-y-3">
              <p className="text-sm font-semibold text-amber-300">미등록 메뉴 ({unmapped.length}개)</p>
              <p className="text-xs text-slate-400">매출에서 발견된 메뉴입니다. 탭하면 추천 분류와 함께 등록됩니다.</p>
              <div className="flex flex-wrap gap-2">
                {unmapped.map((u) => (
                  <button
                    key={u.name}
                    onClick={() => addFromUnmapped(u)}
                    className="rounded-xl border border-amber-700/50 bg-amber-900/30 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-800/40"
                  >
                    + {u.name}
                    {u.suggestedCategory ? ` (${u.suggestedCategory})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 메뉴 목록 */}
          {loading ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 text-center">
              <p className="text-slate-400 text-sm">불러오는 중...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 text-center space-y-2">
              <p className="text-slate-400 text-sm">등록된 메뉴가 없습니다.</p>
              <p className="text-slate-500 text-xs">+ 새 메뉴 추가 버튼을 눌러 시작하세요.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((row, idx) => {
                const isExpanded = expandedIdx === idx;
                return (
                  <div key={idx} className="rounded-2xl border border-slate-800 bg-slate-900/90">
                    {/* 헤더 */}
                    <button
                      className="w-full flex items-center justify-between p-4 text-left"
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {row.menuName ? (
                          <span className="font-medium text-slate-100 truncate">{row.menuName}</span>
                        ) : (
                          <span className="text-slate-500 text-sm">메뉴명 입력 필요</span>
                        )}
                        {row.dirty && <span className="text-xs text-amber-400">●</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {row.category ? (
                          <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${CAT_BG[row.category]}`}>
                            {row.category}
                            {row.category === '주류' && row.liquorSubCategory
                              ? ` · ${LIQUOR_SUB_CATEGORY_LABELS[row.liquorSubCategory]}`
                              : ''}
                          </span>
                        ) : (
                          <span className="rounded-lg px-2 py-0.5 text-xs font-medium bg-slate-700/60 text-slate-400">미지정</span>
                        )}
                        <span className="text-slate-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* 펼쳐진 편집 영역 */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 p-4 space-y-4">
                        {/* 메뉴명 */}
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">메뉴명 (정식)</label>
                          <input
                            value={row.menuName}
                            onChange={(e) => updateRow(idx, { menuName: e.target.value })}
                            placeholder="예: 생맥주(테라)"
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600"
                          />
                        </div>

                        {/* 카테고리 */}
                        <div>
                          <label className="block text-xs text-slate-400 mb-2">카테고리</label>
                          <div className="grid grid-cols-3 gap-2">
                            {CATEGORIES.map((cat) => (
                              <button
                                key={cat}
                                onClick={() => {
                                  const nextCat = row.category === cat ? '' : cat;
                                  const nextSub =
                                    nextCat === '주류'
                                      ? row.liquorSubCategory || suggestLiquorSubCategory(row.menuName)
                                      : '';
                                  updateRow(idx, { category: nextCat, liquorSubCategory: nextSub });
                                }}
                                className={`rounded-xl py-2 text-sm font-medium transition ${
                                  row.category === cat
                                    ? CAT_BG[cat]
                                    : 'border border-slate-700 bg-slate-800/50 text-slate-400'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                            <button
                              onClick={() => updateRow(idx, { category: '', liquorSubCategory: '' })}
                              className={`rounded-xl py-2 text-sm font-medium transition ${
                                row.category === ''
                                  ? 'bg-slate-700/60 text-slate-300'
                                  : 'border border-slate-700 bg-slate-800/50 text-slate-500'
                              }`}
                            >
                              미지정
                            </button>
                          </div>
                        </div>

                        {/* 주류 소분류 (주류 선택 시에만 표시) */}
                        {row.category === '주류' && (
                          <div>
                            <label className="block text-xs text-slate-400 mb-2">주류 소분류</label>
                            <div className="grid grid-cols-3 gap-2">
                              {LIQUOR_SUB_CATEGORIES.map((sub) => (
                                <button
                                  key={sub.key}
                                  type="button"
                                  onClick={() =>
                                    updateRow(idx, {
                                      liquorSubCategory: row.liquorSubCategory === sub.key ? '' : sub.key,
                                    })
                                  }
                                  className={`rounded-xl py-2 px-2 text-xs font-medium transition ${
                                    row.liquorSubCategory === sub.key
                                      ? 'bg-indigo-500/30 border border-indigo-400/60 text-indigo-200'
                                      : 'border border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {sub.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 별칭 */}
                        <div>
                          <label className="block text-xs text-slate-400 mb-2">
                            별칭 (OCR 오인식 대비)
                          </label>
                          <div className="flex gap-2 mb-2">
                            <input
                              value={row.aliasInput}
                              onChange={(e) => updateRow(idx, { aliasInput: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') addAlias(idx); }}
                              placeholder="예: 테라생맥, 생테라"
                              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600"
                            />
                            <button
                              onClick={() => addAlias(idx)}
                              className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
                            >
                              추가
                            </button>
                          </div>
                          {row.aliases.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {row.aliases.map((alias) => (
                                <span
                                  key={alias}
                                  className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
                                >
                                  {alias}
                                  <button
                                    onClick={() => removeAlias(idx, alias)}
                                    className="text-slate-500 hover:text-rose-400 ml-0.5"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 삭제 버튼 */}
                        <button
                          onClick={() => deleteRow(idx)}
                          className="w-full rounded-xl border border-rose-700/40 py-2 text-sm text-rose-400 hover:bg-rose-950/30"
                        >
                          이 메뉴 삭제
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 새 메뉴 추가 버튼 */}
          <button
            onClick={addNewRow}
            className="w-full rounded-2xl border border-dashed border-slate-700 bg-transparent py-4 text-sm font-medium text-slate-400 hover:border-sky-600 hover:text-sky-400"
          >
            + 새 메뉴 추가
          </button>

          {/* 일괄 저장 */}
          <button
            onClick={saveAll}
            disabled={saving || dirtyCount === 0}
            className="w-full rounded-2xl bg-sky-500 py-4 text-base font-bold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? '저장 중...' : dirtyCount > 0 ? `일괄 저장 (${dirtyCount}개 변경)` : '변경 사항 없음'}
          </button>

          {/* 기존 데이터 동기화 */}
          <button
            onClick={syncExisting}
            disabled={syncing}
            className="w-full rounded-2xl border border-slate-700 bg-transparent py-4 text-sm font-semibold text-slate-400 transition hover:border-emerald-600 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {syncing ? '동기화 중...' : '기존 데이터 동기화'}
          </button>

        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
