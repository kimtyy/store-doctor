'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import BottomTabNav from '../../../components/BottomTabNav';

// ── types ────────────────────────────────────────────────────────────────────

interface MenuStat {
  name: string;
  totalAmount: number;
  totalQuantity: number;
  category: string | null;
}

interface CategoryStat {
  category: string;
  totalAmount: number;
}

interface MenuAnalyticsData {
  byAmount: MenuStat[];
  byQuantity: MenuStat[];
  categoryStats: CategoryStat[];
}

interface ItemRankingStat {
  name: string;
  totalAmount: number;
  count: number;
  avgAmount: number;
}

interface VendorRankingStat {
  name: string;
  totalAmount: number;
  count: number;
}

interface PurchaseAnalyticsData {
  totalPurchase: number;
  totalRevenue: number;
  costRatioPercent: number;
  categoryStats: CategoryStat[];
  itemsByAmount: ItemRankingStat[];
  itemsByCount: ItemRankingStat[];
  vendorRankings: VendorRankingStat[];
}

// ── constants ────────────────────────────────────────────────────────────────

type Period = '7' | '30' | 'all';
type Section = 'menu' | 'purchase';

const PERIOD_LABELS: Record<Period, string> = {
  '7': '최근 7일',
  '30': '최근 30일',
  all: '전체',
};

const MENU_CATEGORIES = ['주류', '음료', '안주', '식사', '세트'] as const;
type MenuCategory = (typeof MENU_CATEGORIES)[number];

const MENU_CAT_COLORS: Record<string, string> = {
  주류: '#818cf8',
  음료: '#38bdf8',
  안주: '#fb923c',
  식사: '#34d399',
  세트: '#c084fc',
  미지정: '#475569',
};

const MENU_CAT_BG: Record<string, string> = {
  주류: 'bg-indigo-900/60 text-indigo-300',
  음료: 'bg-sky-900/60 text-sky-300',
  안주: 'bg-amber-900/60 text-amber-300',
  식사: 'bg-emerald-900/60 text-emerald-300',
  세트: 'bg-purple-900/60 text-purple-300',
  미지정: 'bg-slate-800 text-slate-500',
};

const PURCHASE_CAT_COLORS: Record<string, string> = {
  food_ingredients: '#34d399',
  alcohol: '#818cf8',
  consumables: '#fb923c',
  labor: '#f472b6',
  rent: '#a78bfa',
  electricity: '#facc15',
  gas: '#f97316',
  water: '#60a5fa',
  telecom: '#2dd4bf',
  pos_fee: '#e879f9',
  insurance: '#4ade80',
  other: '#64748b',
};

const PURCHASE_CAT_LABELS: Record<string, string> = {
  food_ingredients: '식자재',
  alcohol: '주류',
  consumables: '소모품',
  labor: '인건비',
  rent: '임대료',
  electricity: '전기요금',
  gas: '가스요금',
  water: '수도요금',
  telecom: '통신비',
  pos_fee: 'POS 사용료',
  insurance: '보험료',
  other: '기타',
};

// ── helpers ──────────────────────────────────────────────────────────────────

function formatAmount(n: number) {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}천만`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만`;
  return n.toLocaleString();
}

function CategoryBadge({ category }: { category: string | null }) {
  const label = category ?? '미지정';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${MENU_CAT_BG[label] ?? 'bg-slate-800 text-slate-400'}`}>
      {label}
    </span>
  );
}

const PERIODS: Period[] = ['7', '30', 'all'];

// ── main component ───────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [section, setSection] = useState<Section>('menu');

  // menu analytics state
  const [menuPeriod, setMenuPeriod] = useState<Period>('30');
  const [menuData, setMenuData] = useState<MenuAnalyticsData | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  // purchase analytics state
  const [purchasePeriod, setPurchasePeriod] = useState<Period>('30');
  const [purchaseData, setPurchaseData] = useState<PurchaseAnalyticsData | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // category edit popup state
  const [editingMenu, setEditingMenu] = useState<{ name: string; current: string | null; editedName: string } | null>(null);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const fetchMenuData = useCallback(async (p: Period) => {
    setMenuLoading(true);
    setMenuError(null);
    try {
      const res = await fetch(`/api/analytics/menu?period=${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패');
      setMenuData(json);
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  const fetchPurchaseData = useCallback(async (p: Period) => {
    setPurchaseLoading(true);
    setPurchaseError(null);
    try {
      const res = await fetch(`/api/analytics/purchases?period=${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패');
      setPurchaseData(json);
    } catch (e) {
      setPurchaseError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setPurchaseLoading(false);
    }
  }, []);

  useEffect(() => { fetchMenuData(menuPeriod); }, [menuPeriod, fetchMenuData]);
  useEffect(() => {
    if (section === 'purchase') fetchPurchaseData(purchasePeriod);
  }, [section, purchasePeriod, fetchPurchaseData]);

  async function handleCategorySelect(category: MenuCategory | null) {
    if (!editingMenu || updatingCategory) return;
    setUpdatingCategory(true);
    const trimmed = editingMenu.editedName.trim();
    const isRename = trimmed !== '' && trimmed !== editingMenu.name;
    const canonicalName = isRename ? trimmed : editingMenu.name;
    try {
      const [salesRes] = await Promise.all([
        fetch('/api/analytics/menu', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            menuName: editingMenu.name,
            category: category ?? '',
            ...(isRename ? { newName: canonicalName } : {}),
          }),
        }),
        // Update/create menu_master entry with category (and alias if renamed)
        fetch('/api/menu-master', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            menuName: canonicalName,
            category: category ?? '',
            ...(isRename ? { alias: editingMenu.name } : {}),
          }),
        }),
      ]);
      const json = await salesRes.json();
      if (!salesRes.ok) throw new Error(json.error ?? '업데이트 실패');
      setEditingMenu(null);
      await fetchMenuData(menuPeriod);
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setUpdatingCategory(false);
    }
  }

  // menu chart data
  const topByAmount = menuData?.byAmount.slice(0, 10) ?? [];
  const topByQuantity = menuData?.byQuantity.slice(0, 10) ?? [];
  const maxAmount = topByAmount[0]?.totalAmount ?? 1;
  const maxQuantity = topByQuantity[0]?.totalQuantity ?? 1;

  const menuPieData = (menuData?.categoryStats ?? []).map((s) => ({
    name: s.category,
    value: s.totalAmount,
    color: MENU_CAT_COLORS[s.category] ?? '#94a3b8',
  }));

  // purchase chart data
  const purchasePieData = (purchaseData?.categoryStats ?? []).map((s) => ({
    name: PURCHASE_CAT_LABELS[s.category] ?? s.category,
    value: s.totalAmount,
    color: PURCHASE_CAT_COLORS[s.category] ?? '#94a3b8',
  }));

  const drillMenus = useMemo(
    () =>
      !drillCategory || !menuData
        ? []
        : menuData.byAmount.filter((item) => (item.category ?? '미지정') === drillCategory),
    [drillCategory, menuData]
  );

  useEffect(() => {
    if (drillCategory !== null && drillMenus.length === 0) setDrillCategory(null);
  }, [drillMenus.length, drillCategory]);

  const costRatio = purchaseData?.costRatioPercent ?? 0;
  const costRatioColor =
    costRatio < 30 ? 'text-emerald-400' : costRatio < 55 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-8">
        <h1 className="text-xl font-bold text-slate-100 mb-5">분석</h1>

        {/* Section tabs */}
        <div className="flex gap-1 rounded-2xl bg-slate-900/80 p-1.5 mb-6">
          <button
            onClick={() => setSection('menu')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              section === 'menu' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🍽️ 메뉴 분석
          </button>
          <button
            onClick={() => setSection('purchase')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              section === 'purchase' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📦 매입 분석
          </button>
        </div>

        {/* ── MENU ANALYTICS ─────────────────────────────────────────────── */}
        {section === 'menu' && (
          <>
            <p className="text-xs text-slate-500 mb-4">메뉴를 탭하면 카테고리를 지정할 수 있습니다.</p>
            <div className="flex gap-2 mb-6">
              {PERIODS.map((tab) => (
                <button key={tab} onClick={() => setMenuPeriod(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${menuPeriod === tab ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                  {PERIOD_LABELS[tab]}
                </button>
              ))}
            </div>

            {menuLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-slate-400 text-sm animate-pulse">불러오는 중...</div>
              </div>
            )}
            {menuError && (
              <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4 text-red-400 text-sm">{menuError}</div>
            )}

            {!menuLoading && !menuError && menuData && (
              <>
                {/* Sales ranking */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">매출 랭킹</h2>
                  {topByAmount.length === 0 ? (
                    <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {topByAmount.map((item, i) => (
                        <button
                          key={item.name}
                          onClick={() => setEditingMenu({ name: item.name, current: item.category, editedName: item.name })}
                          className="w-full flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-800/60 active:bg-slate-800 transition text-left"
                        >
                          <span className="w-5 text-xs text-slate-500 text-right shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm text-slate-200 truncate">{item.name}</span>
                              <CategoryBadge category={item.category} />
                              <span className="text-sm font-medium text-sky-400 ml-auto shrink-0">
                                {item.totalAmount.toLocaleString()}원
                              </span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-sky-500 rounded-full" style={{ width: `${(item.totalAmount / maxAmount) * 100}%` }} />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {/* Quantity ranking */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">판매 수량 랭킹</h2>
                  {topByQuantity.length === 0 ? (
                    <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {topByQuantity.map((item, i) => (
                        <button
                          key={item.name}
                          onClick={() => setEditingMenu({ name: item.name, current: item.category, editedName: item.name })}
                          className="w-full flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-800/60 active:bg-slate-800 transition text-left"
                        >
                          <span className="w-5 text-xs text-slate-500 text-right shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm text-slate-200 truncate">{item.name}</span>
                              <CategoryBadge category={item.category} />
                              <span className="text-sm font-medium text-emerald-400 ml-auto shrink-0">
                                {item.totalQuantity}개
                              </span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(item.totalQuantity / maxQuantity) * 100}%` }} />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {/* Category pie */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">카테고리 비율</h2>
                  {menuPieData.length === 0 ? (
                    <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs text-slate-500 mb-3">카테고리 조각을 탭하면 메뉴 목록을 볼 수 있습니다.</p>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart margin={{ top: 10, bottom: 0, left: 0, right: 0 }}>
                          <Pie data={menuPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} onClick={(data: { name: string }) => setDrillCategory(data.name)} style={{ cursor: 'pointer' }}>
                            {menuPieData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} opacity={drillCategory && drillCategory !== entry.name ? 0.4 : 1} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => [`${value.toLocaleString()}원`, '매출']}
                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                            labelStyle={{ color: '#94a3b8' }}
                            itemStyle={{ color: '#e2e8f0' }}
                          />
                          <Legend formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-3 space-y-1">
                        {menuData.categoryStats.map((s) => (
                          <button
                            key={s.category}
                            onClick={() => setDrillCategory(s.category)}
                            className="w-full flex items-center justify-between text-sm rounded-xl px-2 py-1.5 hover:bg-slate-800/60 active:bg-slate-800 transition"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: MENU_CAT_COLORS[s.category] ?? '#94a3b8' }} />
                              <span className="text-slate-300">{s.category}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">{formatAmount(s.totalAmount)}원</span>
                              <span className="text-slate-600 text-xs">›</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {/* ── PURCHASE ANALYTICS ─────────────────────────────────────────── */}
        {section === 'purchase' && (
          <>
            <div className="flex gap-2 mb-6">
              {PERIODS.map((tab) => (
                <button key={tab} onClick={() => setPurchasePeriod(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${purchasePeriod === tab ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                  {PERIOD_LABELS[tab]}
                </button>
              ))}
            </div>

            {purchaseLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-slate-400 text-sm animate-pulse">불러오는 중...</div>
              </div>
            )}
            {purchaseError && (
              <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4 text-red-400 text-sm">{purchaseError}</div>
            )}

            {!purchaseLoading && !purchaseError && purchaseData && (
              <>
                {/* Summary cards */}
                <section className="mb-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs text-slate-500 mb-1">기간 총 매입</p>
                      <p className="text-lg font-bold text-rose-400">
                        {formatAmount(purchaseData.totalPurchase)}원
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs text-slate-500 mb-1">매출 대비 원가율</p>
                      <p className={`text-lg font-bold ${costRatioColor}`}>
                        {purchaseData.totalRevenue > 0
                          ? `${costRatio.toFixed(1)}%`
                          : '—'}
                      </p>
                      {purchaseData.totalRevenue > 0 && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          매출 {formatAmount(purchaseData.totalRevenue)}원
                        </p>
                      )}
                    </div>
                  </div>
                </section>

                {/* Category pie */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">카테고리별 매입</h2>
                  {purchasePieData.length === 0 ? (
                    <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart margin={{ top: 10, bottom: 0, left: 0, right: 0 }}>
                          <Pie data={purchasePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                            {purchasePieData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => [`${value.toLocaleString()}원`, '매입']}
                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                            labelStyle={{ color: '#94a3b8' }}
                            itemStyle={{ color: '#e2e8f0' }}
                          />
                          <Legend formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-3 space-y-1.5">
                        {purchaseData.categoryStats.map((s) => (
                          <div key={s.category} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ background: PURCHASE_CAT_COLORS[s.category] ?? '#94a3b8' }}
                              />
                              <span className="text-slate-300">
                                {PURCHASE_CAT_LABELS[s.category] ?? s.category}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-400">{formatAmount(s.totalAmount)}원</span>
                              {purchaseData.totalPurchase > 0 && (
                                <span className="text-xs text-slate-600 ml-2">
                                  {((s.totalAmount / purchaseData.totalPurchase) * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Item amount ranking */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">품목 금액 TOP 10</h2>
                  {purchaseData.itemsByAmount.length === 0 ? (
                    <p className="text-slate-500 text-sm">품목 데이터가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {purchaseData.itemsByAmount.map((item, i) => {
                        const maxAmt = purchaseData.itemsByAmount[0].totalAmount;
                        return (
                          <div key={item.name} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                            <span className="w-5 text-xs text-slate-500 text-right shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm text-slate-200 truncate">{item.name}</span>
                                <span className="text-xs text-slate-500 shrink-0">{item.count}회</span>
                                <span className="text-sm font-medium text-rose-400 ml-auto shrink-0">
                                  {formatAmount(item.totalAmount)}원
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(item.totalAmount / maxAmt) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Item count ranking */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">품목 구매 횟수 TOP 10</h2>
                  {purchaseData.itemsByCount.length === 0 ? (
                    <p className="text-slate-500 text-sm">품목 데이터가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {purchaseData.itemsByCount.map((item, i) => {
                        const maxCnt = purchaseData.itemsByCount[0].count;
                        return (
                          <div key={item.name} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                            <span className="w-5 text-xs text-slate-500 text-right shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm text-slate-200 truncate">{item.name}</span>
                                <span className="text-xs text-slate-500 shrink-0">
                                  평균 {formatAmount(item.avgAmount)}원
                                </span>
                                <span className="text-sm font-medium text-amber-400 ml-auto shrink-0">
                                  {item.count}회
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(item.count / maxCnt) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Vendor ranking */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">매입처 TOP 10</h2>
                  {purchaseData.vendorRankings.length === 0 ? (
                    <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {purchaseData.vendorRankings.map((vendor, i) => {
                        const maxAmt = purchaseData.vendorRankings[0].totalAmount;
                        return (
                          <div key={vendor.name} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                            <span className="w-5 text-xs text-slate-500 text-right shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm text-slate-200 truncate">{vendor.name}</span>
                                <span className="text-xs text-slate-500 shrink-0">{vendor.count}회</span>
                                <span className="text-sm font-medium text-violet-400 ml-auto shrink-0">
                                  {formatAmount(vendor.totalAmount)}원
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(vendor.totalAmount / maxAmt) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>

      {/* Category drill-down bottom sheet */}
      {drillCategory && !editingMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setDrillCategory(null)}
        >
          <div
            className="w-full max-w-2xl rounded-t-3xl bg-slate-900 border-t border-slate-700 p-6 pb-10 max-h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: MENU_CAT_COLORS[drillCategory] ?? '#94a3b8' }}
                />
                <p className="text-base font-semibold text-slate-100">{drillCategory}</p>
                <span className="text-xs text-slate-500">{drillMenus.length}개</span>
              </div>
              <button onClick={() => setDrillCategory(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-slate-500 mb-4">메뉴를 탭하면 카테고리를 변경할 수 있습니다.</p>
            <div className="overflow-y-auto space-y-1">
              {drillMenus.map((item: MenuStat) => (
                <button
                  key={item.name}
                  onClick={() => setEditingMenu({ name: item.name, current: item.category, editedName: item.name })}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-slate-800/60 active:bg-slate-800 transition text-left"
                >
                  <span className="text-sm text-slate-200 truncate flex-1 mr-3">{item.name}</span>
                  <span className="text-sm font-medium text-sky-400 shrink-0">{formatAmount(item.totalAmount)}원</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Category edit popup */}
      {editingMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !updatingCategory && setEditingMenu(null)}
        >
          <div
            className="w-full max-w-2xl rounded-t-3xl bg-slate-900 border-t border-slate-700 p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1">메뉴명 수정 (선택)</p>
              <div className="relative">
                <input
                  type="text"
                  value={editingMenu.editedName}
                  onChange={(e) => setEditingMenu((prev) => prev ? { ...prev, editedName: e.target.value } : prev)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  placeholder="메뉴명"
                />
                {editingMenu.editedName.trim() !== editingMenu.name && editingMenu.editedName.trim() !== '' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-sky-400 pointer-events-none">변경됨</span>
                )}
              </div>
              {editingMenu.editedName.trim() !== editingMenu.name && editingMenu.editedName.trim() !== '' && (
                <p className="mt-1 text-xs text-slate-500">
                  원본: <span className="text-amber-400">{editingMenu.name}</span>
                  {' → '}
                  <span className="text-emerald-400">{editingMenu.editedName.trim()}</span>
                  <span className="ml-1 text-slate-600">· 원본이 자동으로 별명에 추가됩니다</span>
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">카테고리</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {MENU_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  disabled={updatingCategory}
                  onClick={() => handleCategorySelect(cat)}
                  className={`py-3 rounded-2xl text-sm font-semibold transition disabled:opacity-50 ${
                    editingMenu.current === cat ? 'ring-2 ring-offset-2 ring-offset-slate-900' : ''
                  } ${
                    cat === '주류' ? 'bg-indigo-900/80 text-indigo-200 ring-indigo-500'
                    : cat === '음료' ? 'bg-sky-900/80 text-sky-200 ring-sky-500'
                    : cat === '안주' ? 'bg-amber-900/80 text-amber-200 ring-amber-500'
                    : cat === '세트' ? 'bg-purple-900/80 text-purple-200 ring-purple-500'
                    : 'bg-emerald-900/80 text-emerald-200 ring-emerald-500'
                  } ${cat === '세트' ? 'col-span-2' : ''}`}
                >
                  {cat}{editingMenu.current === cat ? ' ✓' : ''}
                </button>
              ))}
            </div>

            {editingMenu.current && (
              <button
                disabled={updatingCategory}
                onClick={() => handleCategorySelect(null)}
                className="w-full py-2.5 rounded-2xl text-sm text-slate-400 bg-slate-800 hover:bg-slate-700 transition disabled:opacity-50"
              >
                미지정으로 초기화
              </button>
            )}

            {updatingCategory && (
              <p className="text-center text-xs text-slate-500 mt-3 animate-pulse">저장 중...</p>
            )}
          </div>
        </div>
      )}

      <BottomTabNav />
    </div>
  );
}
