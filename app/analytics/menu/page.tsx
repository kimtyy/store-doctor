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

interface MonthSelection {
  year: number;
  month: number;
}

interface VendorMasterRow {
  id: string;
  vendor_name: string;
  aliases: string[];
}

// ── constants ────────────────────────────────────────────────────────────────

type Period = '7' | '30' | 'monthly' | 'all';
type Section = 'menu' | 'purchase';

const PERIOD_LABELS: Record<Period, string> = {
  '7': '최근 7일',
  '30': '최근 30일',
  monthly: '월별',
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
  fuel: '#f97316',
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
  fuel: '유류비',
  other: '기타',
};

// ── helpers ──────────────────────────────────────────────────────────────────

function formatAmount(n: number) {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}천만`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만`;
  return n.toLocaleString();
}

function shiftMonth(m: MonthSelection, delta: number): MonthSelection {
  const d = new Date(m.year, m.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function buildApiQuery(p: Period, month: MonthSelection): string {
  if (p === 'monthly') {
    const { year, month: m } = month;
    const from = `${year}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(year, m, 0).getDate();
    const to = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return `from=${from}&to=${to}`;
  }
  return `period=${p}`;
}

function monthKey(m: MonthSelection) { return `${m.year}-${m.month}`; }

function CategoryBadge({ category }: { category: string | null }) {
  const label = category ?? '미지정';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${MENU_CAT_BG[label] ?? 'bg-slate-800 text-slate-400'}`}>
      {label}
    </span>
  );
}

function MoMBadge({ current, prev, invertColor = false }: { current: number; prev: number; invertColor?: boolean }) {
  if (prev === 0) return null;
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  const isUp = pct > 0;
  const isGood = invertColor ? !isUp : isUp;
  return (
    <p className={`text-xs mt-0.5 font-medium ${isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
      {isUp ? '+' : ''}{pct.toFixed(1)}% {isUp ? '↑' : '↓'}
    </p>
  );
}

const PERIODS: Period[] = ['7', '30', 'monthly', 'all'];
const TOP_N = 10;

function ShowMoreButton({ expanded, total, onToggle }: { expanded: boolean; total: number; onToggle: () => void }) {
  if (total <= TOP_N) return null;
  return (
    <button
      onClick={onToggle}
      className="mt-3 w-full py-2 rounded-xl text-xs font-medium text-slate-400 bg-slate-800/60 hover:bg-slate-800 active:bg-slate-800 transition"
    >
      {expanded ? '접기 ▲' : `더보기 (${total - TOP_N}개 더) ▼`}
    </button>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [section, setSection] = useState<Section>('menu');
  const [period, setPeriod] = useState<Period>('30');
  const [selectedMonth, setSelectedMonth] = useState<MonthSelection>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [availableMonths, setAvailableMonths] = useState<MonthSelection[]>([]);

  // menu analytics state
  const [menuData, setMenuData] = useState<MenuAnalyticsData | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  // purchase analytics state
  const [purchaseData, setPurchaseData] = useState<PurchaseAnalyticsData | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [prevPurchaseData, setPrevPurchaseData] = useState<PurchaseAnalyticsData | null>(null);

  // expand states for "더보기"
  const [menuAmountExpanded, setMenuAmountExpanded] = useState(false);
  const [menuQuantityExpanded, setMenuQuantityExpanded] = useState(false);
  const [purchaseItemsAmtExpanded, setPurchaseItemsAmtExpanded] = useState(false);
  const [purchaseItemsCntExpanded, setPurchaseItemsCntExpanded] = useState(false);
  const [purchaseVendorExpanded, setPurchaseVendorExpanded] = useState(false);

  // category edit popup state
  const [editingMenu, setEditingMenu] = useState<{ name: string; current: string | null; editedName: string } | null>(null);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  // vendor rename popup state
  const [editingVendor, setEditingVendor] = useState<{ name: string } | null>(null);
  const [editedVendorName, setEditedVendorName] = useState('');
  const [vendorMasterData, setVendorMasterData] = useState<VendorMasterRow[] | null>(null);
  const [vendorMasterLoading, setVendorMasterLoading] = useState(false);
  const [vendorRenameSaving, setVendorRenameSaving] = useState(false);
  const [vendorRenameMsg, setVendorRenameMsg] = useState<string | null>(null);

  const fetchMenuData = useCallback(async (p: Period, month: MonthSelection) => {
    setMenuLoading(true);
    setMenuError(null);
    try {
      const res = await fetch(`/api/analytics/menu?${buildApiQuery(p, month)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패');
      setMenuData(json);
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  const fetchPurchaseData = useCallback(async (p: Period, month: MonthSelection) => {
    setPurchaseLoading(true);
    setPurchaseError(null);
    try {
      const res = await fetch(`/api/analytics/purchases?${buildApiQuery(p, month)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패');
      setPurchaseData(json);
    } catch (e) {
      setPurchaseError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setPurchaseLoading(false);
    }
  }, []);

  useEffect(() => {
    setMenuAmountExpanded(false);
    setMenuQuantityExpanded(false);
    setPurchaseItemsAmtExpanded(false);
    setPurchaseItemsCntExpanded(false);
    setPurchaseVendorExpanded(false);
  }, [period, selectedMonth, section]);

  useEffect(() => { fetchMenuData(period, selectedMonth); }, [period, selectedMonth, fetchMenuData]);

  useEffect(() => {
    if (section === 'purchase' || period === 'monthly') {
      fetchPurchaseData(period, selectedMonth);
    }
  }, [section, period, selectedMonth, fetchPurchaseData]);

  // Fetch available months + previous month data when in monthly mode
  useEffect(() => {
    if (period !== 'monthly') {
      setAvailableMonths([]);
      setPrevPurchaseData(null);
      return;
    }
    fetch('/api/analytics/months')
      .then(r => r.json())
      .then(data => {
        const months: MonthSelection[] = data.months ?? [];
        setAvailableMonths(months);
        // Auto-navigate to latest available month if current month has no data
        if (months.length > 0) {
          const isCurrentAvailable = months.some(
            m => m.year === selectedMonth.year && m.month === selectedMonth.month
          );
          if (!isCurrentAvailable) {
            setSelectedMonth(months[months.length - 1]);
          }
        }
      })
      .catch(() => {});

    const prev = shiftMonth(selectedMonth, -1);
    const prevQ = buildApiQuery('monthly', prev);
    fetch(`/api/analytics/purchases?${prevQ}`)
      .then(r => r.json())
      .then(data => setPrevPurchaseData(data))
      .catch(() => setPrevPurchaseData(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedMonth]);

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
      await fetchMenuData(period, selectedMonth);
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setUpdatingCategory(false);
    }
  }

  function openVendorEdit(name: string) {
    setEditingVendor({ name });
    setEditedVendorName(name);
    setVendorRenameMsg(null);
    if (!vendorMasterData) {
      setVendorMasterLoading(true);
      fetch('/api/vendor-master')
        .then((r) => r.json())
        .then((d) => setVendorMasterData(d.data ?? []))
        .catch(() => setVendorMasterData([]))
        .finally(() => setVendorMasterLoading(false));
    }
  }

  async function handleVendorRename() {
    if (!editingVendor || vendorRenameSaving) return;
    const newName = editedVendorName.trim();
    if (!newName) return;
    setVendorRenameSaving(true);
    try {
      const res = await fetch('/api/vendor-master/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: editingVendor.name, newName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '저장 실패');
      setVendorRenameMsg(json.message ?? '저장 완료');
      // Refresh vendor master cache
      setVendorMasterData(null);
      // Refresh purchase data to reflect renamed vendors
      await fetchPurchaseData(period, selectedMonth);
      setTimeout(() => {
        setEditingVendor(null);
        setVendorRenameMsg(null);
      }, 1500);
    } catch (err) {
      setVendorRenameMsg(`❌ ${err instanceof Error ? err.message : '오류'}`);
    } finally {
      setVendorRenameSaving(false);
    }
  }

  const canGoPrev = useMemo(() => {
    if (availableMonths.length === 0) return false;
    const minMonth = availableMonths[0]; // sorted ascending from API
    return selectedMonth.year > minMonth.year ||
      (selectedMonth.year === minMonth.year && selectedMonth.month > minMonth.month);
  }, [availableMonths, selectedMonth]);

  const canGoNext = useMemo(() => {
    const now = new Date();
    return selectedMonth.year < now.getFullYear() ||
      (selectedMonth.year === now.getFullYear() && selectedMonth.month < now.getMonth() + 1);
  }, [selectedMonth]);

  // menu chart data
  const allByAmount = menuData?.byAmount ?? [];
  const allByQuantity = menuData?.byQuantity ?? [];
  const topByAmount = menuAmountExpanded ? allByAmount : allByAmount.slice(0, TOP_N);
  const topByQuantity = menuQuantityExpanded ? allByQuantity : allByQuantity.slice(0, TOP_N);
  const maxAmount = allByAmount[0]?.totalAmount ?? 1;
  const maxQuantity = allByQuantity[0]?.totalQuantity ?? 1;

  const menuPieData = (menuData?.categoryStats ?? []).map((s) => ({
    name: s.category,
    value: s.totalAmount,
    color: MENU_CAT_COLORS[s.category] ?? '#94a3b8',
  }));

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
        <div className="flex gap-1 rounded-2xl bg-slate-900/80 p-1.5 mb-4">
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

        {/* Period tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {PERIODS.map((tab) => (
            <button key={tab} onClick={() => setPeriod(tab)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${period === tab ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
              {PERIOD_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Month navigator */}
        {period === 'monthly' && (
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
              disabled={!canGoPrev}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-300 disabled:opacity-30 hover:bg-slate-700 transition text-base"
            >
              ←
            </button>
            <span className="text-sm font-semibold text-slate-200 min-w-[110px] text-center">
              {selectedMonth.year}년 {selectedMonth.month}월
            </span>
            <button
              onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
              disabled={!canGoNext}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-300 disabled:opacity-30 hover:bg-slate-700 transition text-base"
            >
              →
            </button>
          </div>
        )}

        {/* Monthly summary card */}
        {period === 'monthly' && (
          purchaseData ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 mb-6">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                {selectedMonth.year}년 {selectedMonth.month}월 손익 요약
              </h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-slate-500 mb-1">총매출</p>
                  <p className="text-base font-bold text-slate-100">{formatAmount(purchaseData.totalRevenue)}원</p>
                  {prevPurchaseData && (
                    <MoMBadge current={purchaseData.totalRevenue} prev={prevPurchaseData.totalRevenue} />
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">총매입</p>
                  <p className="text-base font-bold text-rose-400">{formatAmount(purchaseData.totalPurchase)}원</p>
                  {prevPurchaseData && (
                    <MoMBadge current={purchaseData.totalPurchase} prev={prevPurchaseData.totalPurchase} invertColor />
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">순이익</p>
                  {(() => {
                    const profit = purchaseData.totalRevenue - purchaseData.totalPurchase;
                    const prevProfit = prevPurchaseData
                      ? prevPurchaseData.totalRevenue - prevPurchaseData.totalPurchase
                      : null;
                    return (
                      <>
                        <p className={`text-base font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {profit >= 0 ? '+' : ''}{formatAmount(Math.abs(profit))}원
                        </p>
                        {prevProfit !== null && prevProfit !== 0 && (
                          <MoMBadge current={profit} prev={prevProfit} />
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
              {purchaseData.totalRevenue > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>원가율</span>
                    <span className={costRatioColor}>{costRatio.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${costRatio > 70 ? 'bg-rose-500' : costRatio >= 55 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(costRatio, 100).toFixed(1)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : purchaseLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 mb-6">
              <div className="text-center text-sm text-slate-500 animate-pulse py-2">손익 요약 불러오는 중...</div>
            </div>
          ) : null
        )}

        {/* ── MENU ANALYTICS ─────────────────────────────────────────────── */}
        {section === 'menu' && (
          <>
            <p className="text-xs text-slate-500 mb-4">메뉴를 탭하면 카테고리를 지정할 수 있습니다.</p>

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
                  {allByAmount.length === 0 ? (
                    <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
                  ) : (
                    <>
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
                      <ShowMoreButton
                        expanded={menuAmountExpanded}
                        total={allByAmount.length}
                        onToggle={() => setMenuAmountExpanded((v) => !v)}
                      />
                    </>
                  )}
                </section>

                {/* Quantity ranking */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">판매 수량 랭킹</h2>
                  {allByQuantity.length === 0 ? (
                    <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
                  ) : (
                    <>
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
                      <ShowMoreButton
                        expanded={menuQuantityExpanded}
                        total={allByQuantity.length}
                        onToggle={() => setMenuQuantityExpanded((v) => !v)}
                      />
                    </>
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
                {/* Summary cards — only in non-monthly mode (monthly has global summary card above) */}
                {period !== 'monthly' && (
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
                          {purchaseData.totalRevenue > 0 ? `${costRatio.toFixed(1)}%` : '—'}
                        </p>
                        {purchaseData.totalRevenue > 0 && (
                          <p className="text-xs text-slate-600 mt-0.5">
                            매출 {formatAmount(purchaseData.totalRevenue)}원
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                )}

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
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">품목 금액 랭킹</h2>
                  {purchaseData.itemsByAmount.length === 0 ? (
                    <p className="text-slate-500 text-sm">품목 데이터가 없습니다.</p>
                  ) : (() => {
                    const list = purchaseItemsAmtExpanded
                      ? purchaseData.itemsByAmount
                      : purchaseData.itemsByAmount.slice(0, TOP_N);
                    const maxAmt = purchaseData.itemsByAmount[0].totalAmount;
                    return (
                      <>
                        <div className="space-y-2">
                          {list.map((item, i) => (
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
                          ))}
                        </div>
                        <ShowMoreButton
                          expanded={purchaseItemsAmtExpanded}
                          total={purchaseData.itemsByAmount.length}
                          onToggle={() => setPurchaseItemsAmtExpanded((v) => !v)}
                        />
                      </>
                    );
                  })()}
                </section>

                {/* Item count ranking */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">품목 구매 횟수 랭킹</h2>
                  {purchaseData.itemsByCount.length === 0 ? (
                    <p className="text-slate-500 text-sm">품목 데이터가 없습니다.</p>
                  ) : (() => {
                    const list = purchaseItemsCntExpanded
                      ? purchaseData.itemsByCount
                      : purchaseData.itemsByCount.slice(0, TOP_N);
                    const maxCnt = purchaseData.itemsByCount[0].count;
                    return (
                      <>
                        <div className="space-y-2">
                          {list.map((item, i) => (
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
                          ))}
                        </div>
                        <ShowMoreButton
                          expanded={purchaseItemsCntExpanded}
                          total={purchaseData.itemsByCount.length}
                          onToggle={() => setPurchaseItemsCntExpanded((v) => !v)}
                        />
                      </>
                    );
                  })()}
                </section>

                {/* Vendor ranking */}
                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">매입처 랭킹</h2>
                  {purchaseData.vendorRankings.length === 0 ? (
                    <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
                  ) : (() => {
                    const list = purchaseVendorExpanded
                      ? purchaseData.vendorRankings
                      : purchaseData.vendorRankings.slice(0, TOP_N);
                    const maxAmt = purchaseData.vendorRankings[0].totalAmount;
                    return (
                      <>
                        <p className="text-xs text-slate-500 mb-2">상호명을 탭하면 수정할 수 있습니다.</p>
                        <div className="space-y-2">
                          {list.map((vendor, i) => (
                            <button
                              key={vendor.name}
                              onClick={() => openVendorEdit(vendor.name)}
                              className="w-full flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-800/60 active:bg-slate-800 transition text-left"
                            >
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
                            </button>
                          ))}
                        </div>
                        <ShowMoreButton
                          expanded={purchaseVendorExpanded}
                          total={purchaseData.vendorRankings.length}
                          onToggle={() => setPurchaseVendorExpanded((v) => !v)}
                        />
                      </>
                    );
                  })()}
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

      {/* Vendor rename bottom sheet */}
      {editingVendor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !vendorRenameSaving && setEditingVendor(null)}
        >
          <div
            className="w-full max-w-2xl rounded-t-3xl bg-slate-900 border-t border-slate-700 p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-semibold text-slate-100">상호명 수정</p>
              <button
                onClick={() => !vendorRenameSaving && setEditingVendor(null)}
                className="text-slate-500 hover:text-slate-300 text-xl leading-none"
              >×</button>
            </div>

            {/* Current name */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1">현재 상호명</p>
              <p className="text-sm font-medium text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded-xl px-3 py-2.5">
                {editingVendor.name}
              </p>
            </div>

            {/* Vendor master status */}
            <div className="mb-4">
              {vendorMasterLoading ? (
                <p className="text-xs text-slate-500 animate-pulse">마스터 조회 중...</p>
              ) : vendorMasterData ? (() => {
                const asCanonical = vendorMasterData.find(m => m.vendor_name === editingVendor.name);
                const asAlias = !asCanonical && vendorMasterData.find(m => (m.aliases ?? []).includes(editingVendor.name));
                if (asCanonical) return (
                  <p className="text-xs text-emerald-400">✅ 매입처 마스터에 정식명으로 등록됨</p>
                );
                if (asAlias) return (
                  <p className="text-xs text-emerald-400">✅ 매입처 마스터에 별칭으로 등록됨 (정식명: {asAlias.vendor_name})</p>
                );
                return (
                  <p className="text-xs text-amber-400">⚠️ 미등록 — 저장하면 마스터에 자동 등록됩니다</p>
                );
              })() : null}
            </div>

            {/* New canonical name input */}
            <div className="mb-5">
              <p className="text-xs text-slate-500 mb-1.5">정식 상호명</p>
              <input
                type="text"
                value={editedVendorName}
                onChange={(e) => setEditedVendorName(e.target.value)}
                placeholder="정식 상호명 입력"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
              {editedVendorName.trim() !== editingVendor.name && editedVendorName.trim() !== '' && (
                <p className="mt-1.5 text-xs text-slate-500">
                  <span className="text-amber-400">{editingVendor.name}</span>
                  {' → '}
                  <span className="text-emerald-400">{editedVendorName.trim()}</span>
                  <span className="ml-1 text-slate-600">· 동일 상호명 전체 일괄 수정</span>
                </p>
              )}
            </div>

            {/* Result message */}
            {vendorRenameMsg && (
              <p className={`text-sm mb-4 ${vendorRenameMsg.startsWith('❌') ? 'text-rose-400' : 'text-emerald-400'}`}>
                {vendorRenameMsg}
              </p>
            )}

            {/* Save button */}
            <button
              onClick={handleVendorRename}
              disabled={vendorRenameSaving || !editedVendorName.trim()}
              className="w-full rounded-2xl bg-sky-600 py-3.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40 transition"
            >
              {vendorRenameSaving
                ? '저장 중...'
                : editedVendorName.trim() === editingVendor.name
                  ? '마스터에 등록하기'
                  : '일괄 수정 + 마스터 등록'}
            </button>
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
