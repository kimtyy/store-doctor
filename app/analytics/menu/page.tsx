'use client';

import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import BottomTabNav from '../../../components/BottomTabNav';

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

interface AnalyticsData {
  byAmount: MenuStat[];
  byQuantity: MenuStat[];
  categoryStats: CategoryStat[];
}

type Period = '7' | '30' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  '7': '최근 7일',
  '30': '최근 30일',
  all: '전체',
};

const CATEGORIES = ['주류', '음료', '안주', '식사'] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_COLORS: Record<string, string> = {
  주류: '#818cf8',
  음료: '#38bdf8',
  안주: '#fb923c',
  식사: '#34d399',
  미지정: '#475569',
};

const CATEGORY_BG: Record<string, string> = {
  주류: 'bg-indigo-900/60 text-indigo-300',
  음료: 'bg-sky-900/60 text-sky-300',
  안주: 'bg-amber-900/60 text-amber-300',
  식사: 'bg-emerald-900/60 text-emerald-300',
  미지정: 'bg-slate-800 text-slate-500',
};

function formatAmount(n: number) {
  return n >= 10000
    ? `${Math.round(n / 1000).toLocaleString()}천`
    : n.toLocaleString();
}

function CategoryBadge({ category }: { category: string | null }) {
  const label = category ?? '미지정';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_BG[label] ?? 'bg-slate-800 text-slate-400'}`}>
      {label}
    </span>
  );
}

export default function MenuAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingMenu, setEditingMenu] = useState<{ name: string; current: string | null } | null>(null);
  const [updatingCategory, setUpdatingCategory] = useState(false);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/menu?period=${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  async function handleCategorySelect(category: Category | null) {
    if (!editingMenu || updatingCategory) return;
    setUpdatingCategory(true);
    try {
      const res = await fetch('/api/analytics/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuName: editingMenu.name, category: category ?? '' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '업데이트 실패');
      setEditingMenu(null);
      await fetchData(period);
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setUpdatingCategory(false);
    }
  }

  const topByAmount = data?.byAmount.slice(0, 10) ?? [];
  const topByQuantity = data?.byQuantity.slice(0, 10) ?? [];
  const maxAmount = topByAmount[0]?.totalAmount ?? 1;
  const maxQuantity = topByQuantity[0]?.totalQuantity ?? 1;

  // Pie: use fixed category colors; group unknowns into 기타
  const pieData = (() => {
    if (!data?.categoryStats.length) return [];
    return data.categoryStats.map((s) => ({
      name: s.category,
      value: s.totalAmount,
      color: CATEGORY_COLORS[s.category] ?? '#94a3b8',
    }));
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-8">
        <h1 className="text-xl font-bold text-slate-100 mb-1">메뉴 분석</h1>
        <p className="text-xs text-slate-500 mb-6">메뉴를 탭하면 카테고리를 지정할 수 있습니다.</p>

        {/* Period tabs */}
        <div className="flex gap-2 mb-6">
          {(['7', '30', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                period === p
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-400 text-sm animate-pulse">불러오는 중...</div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Sales ranking */}
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                매출 랭킹
              </h2>
              {topByAmount.length === 0 ? (
                <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {topByAmount.map((item, i) => (
                    <button
                      key={item.name}
                      onClick={() => setEditingMenu({ name: item.name, current: item.category })}
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
                          <div
                            className="h-full bg-sky-500 rounded-full"
                            style={{ width: `${(item.totalAmount / maxAmount) * 100}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Quantity ranking */}
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                판매 수량 랭킹
              </h2>
              {topByQuantity.length === 0 ? (
                <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {topByQuantity.map((item, i) => (
                    <button
                      key={item.name}
                      onClick={() => setEditingMenu({ name: item.name, current: item.category })}
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
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${(item.totalQuantity / maxQuantity) * 100}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Category pie chart */}
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                카테고리 비율
              </h2>
              {pieData.length === 0 ? (
                <p className="text-slate-500 text-sm">데이터가 없습니다.</p>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart margin={{ top: 10, bottom: 0, left: 0, right: 0 }}>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value.toLocaleString()}원`, '매출']}
                        contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                        labelStyle={{ color: '#94a3b8' }}
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                      <Legend
                        formatter={(value) => (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="mt-3 space-y-1.5">
                    {data.categoryStats.map((s) => (
                      <div key={s.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: CATEGORY_COLORS[s.category] ?? '#94a3b8' }}
                          />
                          <span className="text-slate-300">{s.category}</span>
                        </div>
                        <span className="text-slate-400">{formatAmount(s.totalAmount)}원</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

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
              <p className="text-xs text-slate-500 mb-1">카테고리 지정</p>
              <p className="text-base font-semibold text-slate-100 truncate">{editingMenu.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  disabled={updatingCategory}
                  onClick={() => handleCategorySelect(cat)}
                  className={`py-3 rounded-2xl text-sm font-semibold transition ${
                    editingMenu.current === cat
                      ? 'ring-2 ring-offset-2 ring-offset-slate-900'
                      : ''
                  } ${
                    cat === '주류'
                      ? 'bg-indigo-900/80 text-indigo-200 ring-indigo-500'
                      : cat === '음료'
                      ? 'bg-sky-900/80 text-sky-200 ring-sky-500'
                      : cat === '안주'
                      ? 'bg-amber-900/80 text-amber-200 ring-amber-500'
                      : 'bg-emerald-900/80 text-emerald-200 ring-emerald-500'
                  } disabled:opacity-50`}
                >
                  {updatingCategory && editingMenu.current !== cat ? cat : cat}
                  {editingMenu.current === cat && ' ✓'}
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
