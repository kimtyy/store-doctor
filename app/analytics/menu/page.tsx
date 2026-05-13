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

const PIE_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fb923c', '#f472b6', '#94a3b8'];

const PERIOD_LABELS: Record<Period, string> = {
  '7': '최근 7일',
  '30': '최근 30일',
  all: '전체',
};

function formatAmount(n: number) {
  return n >= 10000
    ? `${Math.round(n / 1000).toLocaleString()}천`
    : n.toLocaleString();
}

export default function MenuAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const topByAmount = data?.byAmount.slice(0, 10) ?? [];
  const topByQuantity = data?.byQuantity.slice(0, 10) ?? [];
  const maxAmount = topByAmount[0]?.totalAmount ?? 1;
  const maxQuantity = topByQuantity[0]?.totalQuantity ?? 1;

  // Pie: top 5 + 기타
  const pieData = (() => {
    if (!data?.categoryStats.length) return [];
    const top5 = data.categoryStats.slice(0, 5);
    const rest = data.categoryStats.slice(5);
    const result = top5.map((s) => ({ name: s.category, value: s.totalAmount }));
    if (rest.length > 0) {
      result.push({ name: '기타', value: rest.reduce((acc, s) => acc + s.totalAmount, 0) });
    }
    return result;
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-8">
        <h1 className="text-xl font-bold text-slate-100 mb-6">메뉴 분석</h1>

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
                    <div key={item.name} className="flex items-center gap-3">
                      <span className="w-5 text-xs text-slate-500 text-right shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-200 truncate">{item.name}</span>
                          <span className="text-sm font-medium text-sky-400 ml-2 shrink-0">
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
                    </div>
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
                    <div key={item.name} className="flex items-center gap-3">
                      <span className="w-5 text-xs text-slate-500 text-right shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-200 truncate">{item.name}</span>
                          <span className="text-sm font-medium text-emerald-400 ml-2 shrink-0">
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
                    </div>
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
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
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

                  {/* Category list */}
                  <div className="mt-3 space-y-1.5">
                    {data.categoryStats.map((s, i) => (
                      <div key={s.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
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

      <BottomTabNav />
    </div>
  );
}
